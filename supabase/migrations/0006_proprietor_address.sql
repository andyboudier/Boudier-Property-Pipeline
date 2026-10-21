-- CCOD/OCOD publish each company proprietor's correspondence address. For a
-- company-owned freehold that is the address to write to — no title purchase
-- needed. Carry it through staging to the candidate.

set search_path = public, extensions;

alter table stg_ccod add column if not exists proprietor_address text;
alter table freehold_candidates add column if not exists company_address text;

create or replace function build_freehold_candidates(p_la_code text)
returns integer language plpgsql as $$
declare
  n integer;
begin
  with
  -- 2. UPRNs falling inside each freehold polygon.
  inside as (
    select p.inspire_id, p.la_code, p.geom, u.uprn
    from stg_inspire_polygon p
    join stg_uprn u on st_within(u.geom, p.geom)
    where p.la_code = p_la_code
  ),
  -- 3. Keep only UPRNs corroborated by another dataset — OS Open UPRN alone
  --    includes car parks and street furniture, which are not addresses.
  corroborated as (
    select i.*
    from inside i
    where exists (select 1 from stg_epc        e where e.uprn = i.uprn)
       or exists (select 1 from stg_price_paid p where p.uprn = i.uprn)
       or exists (select 1 from stg_lease      l where l.uprn = i.uprn)
       or exists (select 1 from stg_voa        v where v.uprn = i.uprn)
  ),
  agg as (
    select
      c.inspire_id,
      c.la_code,
      st_multi(st_union(c.geom)) as geom,
      array_agg(distinct c.uprn) as uprns,
      count(distinct c.uprn) as address_count,                                    -- F2
      count(distinct c.uprn) filter (where exists
        (select 1 from stg_lease l where l.uprn = c.uprn)) as lease_count,        -- F3
      count(distinct c.uprn) filter (where exists
        (select 1 from stg_epc e where e.uprn = c.uprn)) as epc_uprn_count,       -- F6
      (select count(*) from stg_epc e where e.uprn = any(array_agg(distinct c.uprn))) as epc_cert_count,
      (select array_agg(distinct e.property_type) from stg_epc e
        where e.uprn = any(array_agg(distinct c.uprn))) as epc_types,
      (select array_agg(distinct v.description) from stg_voa v
        where v.uprn = any(array_agg(distinct c.uprn))) as voa_descs,
      -- Owner by postcode: the polygon's postcodes come from the EPC records
      -- of the UPRNs inside it. Freehold titles are preferred — a leasehold
      -- title at the same postcode is a flat within the building, not its owner.
      (select row_to_json(x) from (
        select cc.company_name, cc.company_number, cc.is_overseas, cc.proprietor_address
        from stg_ccod cc
        where cc.postcode in (
          select distinct e.postcode from stg_epc e
          where e.uprn = any(array_agg(distinct c.uprn)) and e.postcode is not null)
        order by (cc.tenure ilike 'freehold') desc nulls last
        limit 1) x) as owner
    from corroborated c
    group by c.inspire_id, c.la_code
  )
  insert into freehold_candidates as fc (
    inspire_id, la_code, geom, centroid, address_count, lease_count,
    epc_uprn_count, epc_cert_count, owner_type, owner_type_inferred,
    company_name, company_number, company_address, use_classes, uprns, sample_addresses,
    last_sale_date, last_sale_price, confidence, sources, refreshed_at
  )
  select
    a.inspire_id,
    a.la_code,
    a.geom,
    st_centroid(a.geom),
    a.address_count,
    a.lease_count,
    a.epc_uprn_count,
    a.epc_cert_count,
    -- 6. F4. No CCOD/OCOD match means private is INFERRED, not known.
    case
      when a.owner is null                                           then 'private'::owner_type
      when is_public_body(a.owner->>'company_name')                  then 'public'::owner_type
      when (a.owner->>'is_overseas')::boolean                        then 'overseas'::owner_type
      else 'company'::owner_type
    end,
    a.owner is null,
    case when a.owner is null or is_public_body(a.owner->>'company_name')
         then null else a.owner->>'company_name' end,
    case when a.owner is null then null else a.owner->>'company_number' end,
    case when a.owner is null or is_public_body(a.owner->>'company_name')
         then null else a.owner->>'proprietor_address' end,
    derive_use_classes(a.epc_types, a.voa_descs),                                  -- 7. F5
    a.uprns,
    freehold_sample_addresses(a.uprns),
    (select max(pp.sale_date) from stg_price_paid pp where pp.uprn = any(a.uprns)),
    (select pp.price from stg_price_paid pp where pp.uprn = any(a.uprns)
      order by pp.sale_date desc limit 1),
    -- Confidence (plan §6): every address carries an EPC, and the polygon is
    -- not so large that it is probably covering more than one building.
    round(least(1.0,
      (case when a.address_count > 0
            then least(a.epc_uprn_count::numeric / a.address_count, 1) else 0 end) * 0.6
      + (case when st_area(a.geom::geography) < 5000 then 1 else 0.3 end) * 0.4
    ), 3),
    jsonb_build_object('method', 'phase1-spatial-join', 'la_code', a.la_code),
    now()
  from agg a
  on conflict (inspire_id, la_code) do update set
    geom = excluded.geom, centroid = excluded.centroid,
    address_count = excluded.address_count, lease_count = excluded.lease_count,
    epc_uprn_count = excluded.epc_uprn_count, epc_cert_count = excluded.epc_cert_count,
    owner_type = excluded.owner_type, owner_type_inferred = excluded.owner_type_inferred,
    company_name = excluded.company_name, company_number = excluded.company_number,
    company_address = excluded.company_address,
    use_classes = excluded.use_classes, uprns = excluded.uprns, sample_addresses = excluded.sample_addresses,
    last_sale_date = excluded.last_sale_date, last_sale_price = excluded.last_sale_price,
    confidence = excluded.confidence, sources = excluded.sources,
    refreshed_at = excluded.refreshed_at;

  get diagnostics n = row_count;
  return n;
end
$$;
