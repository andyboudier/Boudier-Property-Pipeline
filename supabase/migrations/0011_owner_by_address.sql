-- Match the owning company by the building's address, not just its postcode.
--
-- The derivation (0006) took any company title at the same postcode as the
-- owner. In Reading that was wrong for 474 of 541 company-owned targets: 44a
-- Berkeley Avenue was "owned" by Euro Garages, which owns the service station
-- at number 10. The letter would have gone to the wrong company.
--
-- Now a freehold title in CCOD/OCOD owns a building only when its property
-- address contains the building's address on word boundaries ("25 eastern
-- avenue" in "25 eastern avenue reading rg1 5rx") at the same postcode. A flat
-- prefix is dropped first ("flat 2, 25 eastern avenue" → "25 eastern avenue"),
-- and a block's flats also try the block name ("10 lima court bath road" →
-- "lima court bath road"). No match means private, inferred — as the plan
-- always intended for a building with no company title.
--
-- The matched title also gives the title number, and CCOD's price paid is the
-- fallback last sale where Price Paid has no whole-building sale (it only
-- records company purchases from 2013 onwards).

set search_path = public, extensions;

alter table stg_ccod
  add column if not exists price_paid integer,
  add column if not exists date_added date;

-- Every in-scope company title, kept across councils so enrichment never
-- depends on which council's staging data happens to be loaded.
create table if not exists ccod_titles (
  title_number         text primary key,
  tenure               text,
  property_address     text,
  postcode             text,
  company_name         text,
  company_number       text,
  is_overseas          boolean not null default false,
  proprietor_address   text,
  price_paid           integer,
  date_added           date
);
create index if not exists ccod_titles_postcode_idx on ccod_titles (postcode);

create or replace function save_ccod_titles() returns integer
language plpgsql as $$
declare
  n integer;
begin
  insert into ccod_titles as t
  select distinct on (title_number)
         title_number, tenure, property_address, postcode, company_name, company_number,
         is_overseas, proprietor_address, price_paid, date_added
  from stg_ccod
  where title_number is not null
  order by title_number, is_overseas desc
  on conflict (title_number) do update set
    tenure = excluded.tenure, property_address = excluded.property_address, postcode = excluded.postcode,
    company_name = excluded.company_name, company_number = excluded.company_number,
    is_overseas = excluded.is_overseas, proprietor_address = excluded.proprietor_address,
    price_paid = excluded.price_paid, date_added = excluded.date_added;
  get diagnostics n = row_count;
  return n;
end
$$;

alter table freehold_candidates add column if not exists last_sale_source text; -- price-paid | ccod

-- The building's address keys, from the EPC addresses of its UPRNs.
create or replace function building_keys(addr text) returns text[]
language sql immutable as $$
  with a as (
    select regexp_replace(norm_addr(addr),
             '^(flat|apartment|apt|unit|room|maisonette|studio|suite) [a-z0-9]+ ', '') as k
  )
  select array_remove(array[
    ' ' || k || ' ',
    case when k ~ '^[0-9]+[a-z]? [a-z]+( [a-z]+)? (court|house|lodge|mansions|apartments|heights|tower|hall|buildings|point|view|place|works|chambers|gardens|close) '
         then ' ' || regexp_replace(k, '^[0-9]+[a-z]? ', '') || ' ' end
  ], null)
  from a
$$;

create or replace function enrich_freehold_candidates(p_la_code text) returns integer
language plpgsql as $$
declare
  n integer;
begin
  -- EPC: the band distribution across the building's UPRNs.
  with b as (
    select c.id, e.band
    from freehold_candidates c
    cross join lateral unnest(c.uprns) u(uprn)
    join epc_latest e on e.uprn = u.uprn
    where c.la_code = p_la_code and e.band is not null
  ), dist as (
    select id, jsonb_object_agg(band, k order by band) as bands
    from (select id, band, count(*) as k from b group by id, band) per
    group by id
  ), agg as (
    select id,
           percentile_disc(0.5) within group (order by band) as typical,
           max(band) as worst
    from b group by id
  )
  update freehold_candidates c
  set epc_bands        = dist.bands,
      epc_band_typical = agg.typical,
      epc_band_worst   = agg.worst
  from agg join dist using (id)
  where c.id = agg.id;
  get diagnostics n = row_count;

  create temp table _keys on commit drop as
    select distinct c.id, e.postcode, unnest(building_keys(e.address)) as k
    from freehold_candidates c
    cross join lateral unnest(c.uprns) u(uprn)
    join epc_latest e on e.uprn = u.uprn
    where c.la_code = p_la_code and e.postcode is not null and e.address is not null;
  delete from _keys where length(trim(k)) < 4;
  create index on _keys (postcode);

  -- Owner: a freehold company title whose address names this building.
  create temp table _owner on commit drop as
    select distinct on (k.id) k.id, t.*
    from _keys k
    join ccod_titles t on t.postcode = k.postcode
    where t.tenure ilike 'freehold'
      and ' ' || norm_addr(t.property_address) || ' ' like '%' || k.k || '%'
      -- "land adjoining 4 berkeley avenue" is a different parcel
      and norm_addr(t.property_address) !~ '^(land|garages?|parking|car park|electricity|sub ?station|the site)'
    order by k.id,
             (' ' || norm_addr(t.property_address) || ' ') like k.k || '%' desc,  -- title starts with the building
             length(k.k) desc,
             t.date_added desc nulls last;

  update freehold_candidates c
  set owner_type = 'private', owner_type_inferred = true,
      company_name = null, company_number = null, company_address = null, title_number = null
  where c.la_code = p_la_code;

  update freehold_candidates c
  set owner_type = case when is_public_body(o.company_name) then 'public'::owner_type
                        when o.is_overseas then 'overseas'::owner_type
                        else 'company'::owner_type end,
      owner_type_inferred = false,
      company_name    = case when is_public_body(o.company_name) then null else o.company_name end,
      company_number  = o.company_number,
      company_address = o.proprietor_address,
      title_number    = o.title_number
  from _owner o
  where c.id = o.id;

  -- Last sale: the latest whole-property Price Paid record for the building…
  update freehold_candidates c
  set last_sale_price = null, last_sale_date = null, last_sale_tenure = null,
      last_sale_type = null, last_sale_source = null
  where c.la_code = p_la_code;

  with hit as (
    select distinct on (k.id) k.id, s.price, s.sale_date, s.tenure, s.property_type
    from _keys k
    join ppd_sales s on s.postcode = k.postcode
    where coalesce(s.saon, '') = ''
      and s.paon is not null
      and k.k like '% ' || norm_addr(s.paon || ' ' || coalesce(s.street, '')) || ' %'
    order by k.id, s.sale_date desc
  )
  update freehold_candidates c
  set last_sale_price = hit.price, last_sale_date = hit.sale_date, last_sale_tenure = hit.tenure,
      last_sale_type = hit.property_type, last_sale_source = 'price-paid'
  from hit
  where c.id = hit.id;

  -- …or, if the owning company's purchase is newer or Price Paid has none,
  -- what CCOD says that company paid.
  update freehold_candidates c
  set last_sale_price = o.price_paid, last_sale_date = o.date_added, last_sale_tenure = 'F',
      last_sale_type = null, last_sale_source = 'ccod'
  from _owner o
  where c.id = o.id
    and o.price_paid is not null and o.date_added is not null
    and (c.last_sale_date is null or o.date_added > c.last_sale_date);

  return n;
end
$$;
