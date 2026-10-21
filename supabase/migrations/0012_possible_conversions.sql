-- Possible conversions: freeholds that OS addresses as several units, but
-- that no other dataset corroborates.
--
-- The derivation only counts a UPRN when an EPC, lease, VOA or Price Paid
-- record backs it, because OS Open UPRN alone includes car parks and street
-- furniture. That missed 46 Berkeley Avenue, Reading: a detached freehold
-- house (sold £350,000 in 2020) with five OS UPRNs and no EPC on any of them
-- — a conversion or HMO nobody has certified, which is exactly the target.
--
-- So a polygon with at least three OS UPRNs and fewer than two corroborated
-- ones is kept as possible_conversion. Two is left out: in Slough that is
-- 1,025 polygons, mostly a house plus an annex or garage record.
--
-- These buildings have no address of their own (no EPC), so near_address is
-- the nearest certified address, for the list; the map resolves the exact
-- address when one is opened.

set search_path = public, extensions;

alter table freehold_candidates
  add column if not exists uprn_count          integer,          -- every OS UPRN inside, corroborated or not
  add column if not exists possible_conversion boolean not null default false,
  add column if not exists near_address        text;

create index if not exists freehold_candidates_conversion_idx
  on freehold_candidates (la_code, possible_conversion, uprn_count);

create or replace function add_possible_conversions(p_la_code text) returns integer
language plpgsql as $$
declare
  n integer;
begin
  create temp table _pc on commit drop as
    select p.inspire_id, p.geom,
           count(*) as raw,
           count(*) filter (where exists (select 1 from stg_epc   e where e.uprn = u.uprn)
                               or exists (select 1 from stg_lease l where l.uprn = u.uprn)
                               or exists (select 1 from stg_voa   v where v.uprn = u.uprn)) as corr,
           count(*) filter (where exists (select 1 from stg_lease l where l.uprn = u.uprn)) as leases,
           array_agg(u.uprn order by u.uprn) as uprns
    from stg_inspire_polygon p
    join stg_uprn u on st_within(u.geom, p.geom)
    where p.la_code = p_la_code
    group by p.inspire_id, p.geom;

  -- Every candidate gets its raw count, conversion or not.
  update freehold_candidates c set uprn_count = pc.raw
  from _pc pc where c.la_code = p_la_code and c.inspire_id = pc.inspire_id;

  delete from _pc where not (raw >= 3 and corr < 2);

  -- A polygon with one corroborated address already has a row: flag it.
  update freehold_candidates c set possible_conversion = true
  from _pc pc where c.la_code = p_la_code and c.inspire_id = pc.inspire_id;

  insert into freehold_candidates (
    inspire_id, la_code, geom, centroid, address_count, lease_count, epc_uprn_count, epc_cert_count,
    owner_type, owner_type_inferred, uprns, uprn_count, possible_conversion, confidence, sources, refreshed_at
  )
  select pc.inspire_id, p_la_code, st_multi(pc.geom), st_pointonsurface(pc.geom), pc.corr, pc.leases, 0, 0,
         'private', true, pc.uprns, pc.raw, true,
         0.3,  -- the OS count is all there is; nothing corroborates it
         jsonb_build_object('os_uprn', pc.raw), now()
  from _pc pc
  on conflict (inspire_id, la_code) do nothing;
  get diagnostics n = row_count;

  -- The nearest certified address, so the list has something to call it by.
  update freehold_candidates c
  set near_address = (
    select e.address || coalesce(', ' || e.postcode, '')
    from stg_uprn u
    join stg_epc e on e.uprn = u.uprn
    where u.geom && st_expand(c.centroid, 0.001)
      and not (u.uprn = any(c.uprns))
      and e.address is not null
    order by u.geom <-> c.centroid
    limit 1)
  where c.la_code = p_la_code and c.possible_conversion;

  return n;
end
$$;

-- Called by the map once it has reverse-geocoded a conversion's address
-- ("46", "Berkeley Avenue", "RG1 6JE"): store it, then look for the last
-- whole-property sale and a company freehold title at that address.
create or replace function resolve_conversion(p_id bigint, p_label text, p_paon text, p_street text, p_postcode text)
returns void language plpgsql as $$
declare
  k text := ' ' || norm_addr(p_paon || ' ' || p_street) || ' ';
  s record;
  t record;
begin
  update freehold_candidates set sample_addresses = array[p_label] where id = p_id and possible_conversion;
  if not found or coalesce(p_paon, '') = '' or coalesce(p_postcode, '') = '' then return; end if;

  select price, sale_date, tenure, property_type into s
  from ppd_sales
  where postcode = upper(p_postcode) and coalesce(saon, '') = ''
    and ' ' || norm_addr(paon || ' ' || coalesce(street, '')) || ' ' = k
  order by sale_date desc limit 1;
  if found then
    update freehold_candidates
    set last_sale_price = s.price, last_sale_date = s.sale_date, last_sale_tenure = s.tenure,
        last_sale_type = s.property_type, last_sale_source = 'price-paid'
    where id = p_id;
  end if;

  select * into t
  from ccod_titles
  where postcode = upper(p_postcode) and tenure ilike 'freehold'
    and ' ' || norm_addr(property_address) || ' ' like k || '%'
  order by date_added desc nulls last limit 1;
  if found then
    update freehold_candidates
    set owner_type = case when is_public_body(t.company_name) then 'public'::owner_type
                          when t.is_overseas then 'overseas'::owner_type else 'company'::owner_type end,
        owner_type_inferred = false,
        company_name = case when is_public_body(t.company_name) then null else t.company_name end,
        company_number = t.company_number, company_address = t.proprietor_address, title_number = t.title_number
    where id = p_id;
  end if;
end
$$;
