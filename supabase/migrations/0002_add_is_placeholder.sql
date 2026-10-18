-- Marks garments whose size charts are placeholders (fixtures/garments with
-- "placeholder": true), so they are never mistaken for verified retailer data.
-- Ingested garments default to false.

alter table public.garments
  add column is_placeholder boolean not null default false;
