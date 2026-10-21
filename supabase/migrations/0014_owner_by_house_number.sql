-- Owners from titles that list several houses or have no postcode.
--
-- 134 Corwen Road, Reading showed as privately owned, but Reading Borough
-- Council owns the block: its title BK429432 reads "134 and 136 Corwen Road,
-- Tilehurst, Reading" and has no postcode. Postcode-less titles were never
-- loaded, and a list like "134 and 136" or "129 to 153 (odd)" never matched a
-- single building. Council and housing association estates are mostly
-- registered exactly like that, so blocks they own looked like targets.
--
-- The loader now keeps postcode-less titles that name one of the council's
-- post towns, and expands each title's house numbers into address_keys
-- (etl/sources/_titles.py). A building matches by its own "number street"
-- (epc_key) — at the same postcode, or for a title with no postcode, naming
-- the same post town — before falling back to the address match from 0011.

set search_path = public, extensions;

alter table stg_ccod    add column if not exists address_keys text[];
alter table ccod_titles add column if not exists address_keys text[];
alter table epc_latest  add column if not exists post_town text;

create or replace function save_ccod_titles() returns integer
language plpgsql as $$
declare
  n integer;
begin
  insert into ccod_titles as t
  select distinct on (title_number)
         title_number, tenure, property_address, postcode, company_name, company_number,
         is_overseas, proprietor_address, price_paid, date_added, address_keys
  from stg_ccod
  where title_number is not null
  order by title_number, is_overseas desc
  on conflict (title_number) do update set
    tenure = excluded.tenure, property_address = excluded.property_address, postcode = excluded.postcode,
    company_name = excluded.company_name, company_number = excluded.company_number,
    is_overseas = excluded.is_overseas, proprietor_address = excluded.proprietor_address,
    price_paid = excluded.price_paid, date_added = excluded.date_added, address_keys = excluded.address_keys;
  get diagnostics n = row_count;
  return n;
end
$$;

-- A unit's house number and street from its EPC address, in the same form as
-- address_keys: "Flat 1, 134, Corwen Road, Tilehurst" → "134 corwen road".
create or replace function epc_key(addr text) returns text
language sql immutable as $$
  with a as (
    select regexp_replace(coalesce(addr, ''),
             '^\s*(flat|apartment|apt|unit|room|maisonette|studio|suite)\s+[a-z0-9]+\s*,?\s*', '', 'i') as s
  ), m as (
    select regexp_match(s, '(?:^|[,\s-])(\d+[a-z]?)\s*,?\s+([a-z][a-z''. -]*[a-z])', 'i') as g from a
  )
  select case when g is null then null
              else lower(g[1]) || ' ' || norm_addr(split_part(g[2], ',', 1)) end
  from m
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

  -- Each unit's own house number and street ("134 corwen road"), for titles
  -- that list several houses, and its post town, for titles with no postcode.
  create temp table _ekeys on commit drop as
    select distinct c.id, e.postcode, e.post_town as town, epc_key(e.address) as key
    from freehold_candidates c
    cross join lateral unnest(c.uprns) u(uprn)
    join epc_latest e on e.uprn = u.uprn
    where c.la_code = p_la_code and e.address is not null;
  delete from _ekeys where key is null;
  create index on _ekeys (key);

  -- One row per house a freehold title names, so the match is an equality
  -- join rather than an array test against every title.
  create temp table _tkeys on commit drop as
    select t.title_number, unnest(t.address_keys) as key
    from ccod_titles t
    where t.tenure ilike 'freehold' and cardinality(t.address_keys) > 0
      and norm_addr(t.property_address) !~ '^(land|garages?|parking|car park|electricity|sub ?station|the site)';
  create index on _tkeys (key);

  -- Owner: a freehold company title that names this building — first by
  -- house number (it lists the building among its houses), then by address.
  create temp table _owner on commit drop as
    select distinct on (m.id) m.*
    from (
      select k.id, 1 as route, true as starts, length(k.key) as len, t.*
      from _ekeys k
      join _tkeys tk on tk.key = k.key
      join ccod_titles t on t.title_number = tk.title_number
      where t.postcode = k.postcode
         or (t.postcode is null and k.town is not null
             and ' ' || norm_addr(t.property_address) || ' ' like '% ' || k.town || ' %')
      union all
      select k.id, 2, (' ' || norm_addr(t.property_address) || ' ') like k.k || '%', length(k.k), t.*
      from _keys k
      join ccod_titles t on t.postcode = k.postcode
      where t.tenure ilike 'freehold'
        and ' ' || norm_addr(t.property_address) || ' ' like '%' || k.k || '%'
        -- "land adjoining 4 berkeley avenue" is a different parcel
        and norm_addr(t.property_address) !~ '^(land|garages?|parking|car park|electricity|sub ?station|the site)'
    ) m
    order by m.id, m.route, m.starts desc, m.len desc, m.date_added desc nulls last;

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

  -- EPC validity: a certificate lasts ten years from lodgement. Per unit
  -- (latest certificate each, capped at 40 for the side card) and summarised.
  with units as (
    select c.id, e.address, e.band, e.lodged, (e.lodged + interval '10 years')::date as expires
    from freehold_candidates c
    cross join lateral unnest(c.uprns) u(uprn)
    join epc_latest e on e.uprn = u.uprn
    where c.la_code = p_la_code and e.lodged is not null
  ), v as (
    select id,
           min(expires) as first_expiry,
           max(expires) as last_expiry,
           count(*) filter (where expires < current_date) as expired,
           (jsonb_agg(jsonb_build_object('address', address, 'band', band, 'lodged', lodged, 'expires', expires)
                      order by expires))  as all_units
    from units group by id
  )
  update freehold_candidates c
  set epc_first_expiry = v.first_expiry,
      epc_last_expiry  = v.last_expiry,
      epc_expired_count = v.expired,
      epc_units = case when jsonb_array_length(v.all_units) > 40
                       then (select jsonb_agg(x) from (select x from jsonb_array_elements(v.all_units) x limit 40) s)
                       else v.all_units end
  from v
  where c.id = v.id;

  return n;
end
$$;
