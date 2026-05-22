-- v15: job_views — time-series view tracking per job
create table if not exists job_views (
  id          bigserial primary key,
  job_id      text        not null,
  employer_id text        not null,
  viewed_at   timestamptz not null default now()
);

create index if not exists job_views_emp_day_idx on job_views (employer_id, viewed_at desc);
create index if not exists job_views_job_day_idx on job_views (job_id,      viewed_at desc);

alter table job_views enable row level security;

-- Anyone (anon visitors) can log a view
create policy "anon_insert_job_views" on job_views
  for insert with check (true);

-- All rows readable; app code always filters by employer_id
create policy "public_read_job_views" on job_views
  for select using (true);
