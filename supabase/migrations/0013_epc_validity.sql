-- When each EPC expires. A certificate is valid for ten years from the date
-- it was lodged; a unit with an expired one needs a new certificate before it
-- can be let or sold. Added to the enrichment (redefined in full below, as
-- 0011 plus the validity block at the end).

set search_path = public, extensions;

alter table freehold_candidates
  add column if not exists epc_first_expiry  date,     -- the soonest a unit's certificate expires (or expired)
  add column if not exists epc_last_expiry   date,
  add column if not exists epc_expired_count integer,  -- units whose latest certificate has expired
  add column if not exists epc_units         jsonb;    -- [{address, band, lodged, expires}], soonest expiry first

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
