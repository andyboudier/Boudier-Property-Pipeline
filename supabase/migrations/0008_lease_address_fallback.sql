-- Leases with no UPRN (about 5,000 of Reading's 34,247) never counted against
-- a building, so lease_count was a floor and "unbroken" an overstatement.
-- Resolve them to an EPC UPRN at the same postcode whose normalised address is
-- a leading prefix of the lease's: "flat 2 19 alcester crescent" matches
-- "flat 2 19 alcester crescent london e5 9px". The trailing-space test stops
-- "flat 1 ..." from matching "flat 10 ...".

set search_path = public, extensions;

create or replace function norm_addr(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function resolve_lease_uprns() returns integer
language plpgsql as $$
declare
  n integer;
begin
  with m as (
    select distinct on (l.ctid) l.ctid as row_id, e.uprn
    from stg_lease l
    join stg_epc e on e.postcode = l.postcode
    where l.uprn is null
      and l.postcode is not null
      and e.address is not null
      and (norm_addr(l.address) || ' ') like (norm_addr(e.address) || ' %')
    -- the longest matching EPC address is the most specific
    order by l.ctid, length(e.address) desc
  )
  update stg_lease l set uprn = m.uprn from m where l.ctid = m.row_id;
  get diagnostics n = row_count;
  return n;
end
$$;
