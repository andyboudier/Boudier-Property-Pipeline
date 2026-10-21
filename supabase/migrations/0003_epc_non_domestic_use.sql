-- A non-domestic EPC is direct evidence of commercial use. Count it towards
-- the E use class in F5, alongside VOA descriptions. (The EPC source now loads
-- non-domestic certificates with property_type = 'Non-domestic'.)

set search_path = public, extensions;

create or replace function derive_use_classes(epc_types text[], voa_descs text[])
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct uc), '{}')
  from (
    select case
      when e ~* 'non-domestic'                 then 'E'
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
