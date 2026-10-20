-- Unbroken Freehold Finder — core table (plan §5).
--
-- One row per freehold polygon, pre-computed by the ETL so the app only ever
-- runs a filter query. Firestore keeps the deals; land data lives here because
-- Firestore cannot do spatial joins or polygon queries at this scale.
--
-- Phase 1 populates this from free data via spatial joins, so title_number is
-- null and the counts are proxies. Phase 3 swaps in HMLR National Polygon data
-- and fills title_number, at which point the counts become exact.

create extension if not exists postgis;

create type owner_type as enum ('private', 'company', 'overseas', 'public', 'unknown');

create table if not exists freehold_candidates (
  id                  bigint generated always as identity primary key,
  -- INSPIRE polygons carry no title number; Phase 3 fills this in.
  inspire_id          text not null,
  title_number        text,
  la_code             text not null,                 -- ONS code, e.g. E06000038 (Reading)

  geom                geometry(MultiPolygon, 4326) not null,
  centroid            geometry(Point, 4326) not null,

  -- F2 / F3 / F6. "Unbroken freehold" = freehold + address_count in range +
  -- lease_count = 0. INSPIRE is freehold-only, so F1 is automatic.
  address_count       integer not null default 0,
  lease_count         integer not null default 0,
  epc_uprn_count      integer not null default 0,    -- distinct UPRNs with >=1 EPC
  epc_cert_count      integer not null default 0,    -- total certificates

  -- F4. No CCOD/OCOD match means private ownership is inferred, not known —
  -- owner_type_inferred records which it is so the UI can say so.
  owner_type          owner_type not null default 'unknown',
  owner_type_inferred boolean not null default false,
  company_name        text,
  company_number      text,

  use_classes         text[] not null default '{}',  -- F5: C3, C4, sui-generis HMO, E, mixed
  uprns               bigint[] not null default '{}',
  sample_addresses    text[] not null default '{}',

  last_sale_date      date,
  last_sale_price     numeric,

  constraints         jsonb not null default '{}'::jsonb,  -- conservation, article4, listed, flood
  planning_recent     jsonb not null default '[]'::jsonb,

  -- 0-1. High when every UPRN has a corroborating record, the polygon looks
  -- like a single building, and address_count agrees with the EPC count.
  confidence          numeric(4, 3) not null default 0,

  -- Provenance: every row records where it came from and when (plan §8).
  sources             jsonb not null default '{}'::jsonb,
  refreshed_at        timestamptz not null default now(),

  unique (inspire_id, la_code)
);

-- Map viewport queries.
create index if not exists freehold_candidates_geom_idx on freehold_candidates using gist (geom);
create index if not exists freehold_candidates_centroid_idx on freehold_candidates using gist (centroid);
-- The filter set that F2/F3/F6 hit on every search, narrowed by area first.
create index if not exists freehold_candidates_filter_idx
  on freehold_candidates (la_code, address_count, lease_count, epc_uprn_count);
create index if not exists freehold_candidates_owner_idx on freehold_candidates (owner_type);
create index if not exists freehold_candidates_use_idx on freehold_candidates using gin (use_classes);

comment on table freehold_candidates is
  'One row per freehold polygon. Phase 1 counts are spatial-join proxies (see plan §4); Phase 3 replaces them with HMLR title data.';
