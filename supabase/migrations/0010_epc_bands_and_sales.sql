-- EPC rating and last sold price on each candidate.
--
-- Both come from tables that persist across councils, unlike the stg_* tables
-- (truncated for each build), so a candidate can be enriched — or re-enriched
-- — without rebuilding its council from scratch.
--
--   epc_latest  one row per UPRN: its most recent certificate's band
--   ppd_sales   HMLR Price Paid (OGL), loaded per district from the PPD service
--
-- Price Paid has no UPRN. A sale is matched to a building when it is a
-- whole-property sale (no SAON) at the same postcode and its "PAON street"
-- appears, on word boundaries, in the normalised EPC address of one of the
-- building's UPRNs: "46 berkeley avenue" matches "flat 2 46 berkeley avenue"
-- but not "146 berkeley avenue".

set search_path = public, extensions;

create table if not exists epc_latest (
  uprn      bigint primary key,
  la_code   text not null,
  postcode  text,
  address   text,
  band      text,          -- A–G (non-domestic A+ is folded into A)
  lodged    date,
  kind      text           -- domestic | non-domestic
);
create index if not exists epc_latest_la_idx on epc_latest (la_code);

create table if not exists ppd_sales (
  id             text primary key,   -- PPD transaction unique id
  la_code        text not null,
  postcode       text,
  paon           text,
  saon           text,
  street         text,
  price          integer,
  sale_date      date,
  property_type  text,               -- D S T F O
  tenure         text,               -- F freehold, L leasehold
  category       text                -- A standard, B additional (repossessions, companies…)
);
create index if not exists ppd_sales_la_idx on ppd_sales (la_code);
create index if not exists ppd_sales_postcode_idx on ppd_sales (postcode);

alter table freehold_candidates
  add column if not exists epc_bands        jsonb,   -- {"C": 3, "D": 5}
  add column if not exists epc_band_typical text,    -- median of the building's units
  add column if not exists epc_band_worst   text,
  add column if not exists last_sale_tenure text,
  add column if not exists last_sale_type   text;

create index if not exists freehold_candidates_last_sale_idx on freehold_candidates (last_sale_date);

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

  -- Last sale: the latest whole-property Price Paid record for the building.
  with keys as (
    select distinct c.id, e.postcode, ' ' || norm_addr(e.address) || ' ' as a
    from freehold_candidates c
    cross join lateral unnest(c.uprns) u(uprn)
    join epc_latest e on e.uprn = u.uprn
    where c.la_code = p_la_code and e.postcode is not null and e.address is not null
  ), hit as (
    select distinct on (k.id) k.id, s.price, s.sale_date, s.tenure, s.property_type
    from keys k
    join ppd_sales s on s.postcode = k.postcode
    where coalesce(s.saon, '') = ''
      and s.paon is not null
      and k.a like '% ' || norm_addr(s.paon || ' ' || coalesce(s.street, '')) || ' %'
    order by k.id, s.sale_date desc
  )
  update freehold_candidates c
  set last_sale_price  = hit.price,
      last_sale_date   = hit.sale_date,
      last_sale_tenure = hit.tenure,
      last_sale_type   = hit.property_type
  from hit
  where c.id = hit.id;

  return n;
end
$$;
