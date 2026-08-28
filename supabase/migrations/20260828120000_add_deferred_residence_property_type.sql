-- Add Deferred Residence as a single-property type with Airbnb-style behavior.
alter table public.properties
  drop constraint if exists properties_type_check;

alter table public.properties
  add constraint properties_type_check
  check (type in ('rental', 'airbnb', 'apartment', 'deferred_residence'));
