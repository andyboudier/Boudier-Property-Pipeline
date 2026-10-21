-- On-demand imports: search a place in the app, find its council has no data,
-- press Import. The app records the request here and starts the refresh
-- workflow for that council; the ETL reports its progress back to this row.

create table if not exists area_imports (
  la_code       text primary key,          -- ONS code, e.g. E07000114 (Thanet)
  la_name       text not null,             -- also the name the EPC API filters on
  lat           double precision,          -- where to centre the map for this area
  lng           double precision,
  status        text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  requested_at  timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  candidates    integer,
  targets       integer,                   -- default-filter approach list
  message       text
);
