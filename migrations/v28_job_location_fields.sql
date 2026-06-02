-- v28: store the location breakdown on jobs for analytics.
-- Today only the combined `location` text ("Subcity, City") is saved; these add the
-- structured pieces so jobs can be aggregated by pincode / city / area.
-- Safe to re-run.

begin;

alter table public.jobs
  add column if not exists pincode text,
  add column if not exists city    text,
  add column if not exists subcity text;

create index if not exists jobs_city_idx    on public.jobs(city);
create index if not exists jobs_pincode_idx on public.jobs(pincode);

commit;
