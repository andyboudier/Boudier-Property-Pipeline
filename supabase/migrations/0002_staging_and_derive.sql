-- Phase 1 — staging tables and the derivation (plan §4).
--
-- The ETL lands each source in its own staging table, then build_freehold_
-- candidates() does the spatial joins and writes one row per polygon. Keeping
-- the derivation in SQL means it can be tested against synthetic fixtures
-- before any licensed data is downloaded.

create extension if not exists postgis with schema extensions;
set search_path = public, extensions;

-- ── Staging: one table per source in plan §3 ────────────────────────────────

-- HMLR INSPIRE Index Polygons. Freehold-only, so filter F1 is satisfied by the
-- source itself. No title numbers until Phase 3.
create table if not exists stg_inspire_polygon (
  inspire_id text not null,
  la_code    text not null,
  geom       geometry(MultiPolygon, 4326) not null,
  primary key (inspire_id, la_code)
);
create index if not exists stg_inspire_geom_idx on stg_inspire_polygon using gist (geom);

-- OS Open UPRN. Includes non-address objects (car parks, street furniture),
-- which is why step 3 below only keeps corroborated UPRNs.
create table if not exists stg_uprn (
  uprn bigint primary key,
  geom geometry(Point, 4326) not null
);
create index if not exists stg_uprn_geom_idx on stg_uprn using gist (geom);

-- HMLR Registered Leases (>7 years). Drives lease_count (F3).
create table if not exists stg_lease (
  uprn     bigint,
  address  text,
  postcode text
);
create index if not exists stg_lease_uprn_idx on stg_lease (uprn);

-- EPC certificates. Drives F6 and helps F5.
create table if not exists stg_epc (
  uprn           bigint not null,
  postcode       text,
  address        text,
  property_type  text,
  certificate_id text
);
create index if not exists stg_epc_postcode_idx on stg_epc (postcode);
create index if not exists stg_epc_uprn_idx on stg_epc (uprn);

-- VOA non-domestic rating list. Corroborates commercial UPRNs, feeds F5.
create table if not exists stg_voa (
  uprn        bigint,
  description text
);
create index if not exists stg_voa_uprn_idx on stg_voa (uprn);

-- HMLR Price Paid. Corroborates UPRNs and fills last sale.
create table if not exists stg_price_paid (
  uprn       bigint,
  sale_date  date,
  price      numeric
);
create index if not exists stg_price_paid_uprn_idx on stg_price_paid (uprn);

-- HMLR CCOD/OCOD. Drives owner_type (F4). A polygon with no match is INFERRED
-- private — recorded as such, never asserted.
--
-- The real files carry NO UPRN: they are keyed by title number, with the
-- property address and postcode. So a polygon is matched to an owner by
-- postcode (obtained from the EPC records of the UPRNs inside it), which is
-- the join the plan describes in §4 step 6.
create table if not exists stg_ccod (
  title_number   text,
  tenure         text,                      -- Freehold / Leasehold, straight from the file
  property_address text,
  postcode       text,
  company_name   text,
  company_number text,
  proprietorship text,
  country_incorporated text,
  is_overseas    boolean not null default false
);
create index if not exists stg_ccod_postcode_idx on stg_ccod (postcode);

-- ── Classification helpers ──────────────────────────────────────────────────

-- Councils, housing associations, the Crown and charities are out of scope (F4).
create or replace function is_public_body(name text) returns boolean
language sql immutable as $$
  select name ~* '(council|borough|county|district|housing association|homes (ltd|limited)?$|housing (trust|society)|registered provider|crown estate|secretary of state|charity|charitable|almshouse|diocese|parochial|nhs|police|fire authority)'
$$;

-- EPC property type and VOA description → the use classes in F5.
create or replace function derive_use_classes(epc_types text[], voa_descs text[])
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct uc), '{}')
  from (
    select case
      when e ~* '(flat|maisonette)'            then 'C3'
      when e ~* '(house|bungalow)'             then 'C3'
      when e ~* '(room|hmo|house in multiple)' then 'C4'
      else null end as uc
    from unnest(coalesce(epc_types, '{}')) e
    union all
    select case when v is not null then 'E' else null end
    from unnest(coalesce(voa_descs, '{}')) v
  ) t
  where uc is not null
$$;

-- ── The derivation (plan §4, steps 2-8) ─────────────────────────────────────

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
        select cc.company_name, cc.company_number, cc.is_overseas
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
    company_name, company_number, use_classes, uprns,
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
    derive_use_classes(a.epc_types, a.voa_descs),                                  -- 7. F5
    a.uprns,
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
    use_classes = excluded.use_classes, uprns = excluded.uprns,
    last_sale_date = excluded.last_sale_date, last_sale_price = excluded.last_sale_price,
    confidence = excluded.confidence, sources = excluded.sources,
    refreshed_at = excluded.refreshed_at;

  get diagnostics n = row_count;
  return n;
end
$$;
