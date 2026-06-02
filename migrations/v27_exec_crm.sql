-- v27: Executive CRM — deal pipeline, payment links, reminders, richer callbacks.
-- Run in the Supabase SQL editor. All of these tables are accessed ONLY through
-- the service-role /api/exec endpoint, so RLS is enabled with NO public policies
-- (deny-all to anon/authenticated; the service role bypasses RLS). Safe to re-run.

begin;

-- ── payment_links ─────────────────────────────────────────────────────────────
create table if not exists public.payment_links (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  executive_id  uuid not null,
  referral_id   uuid,                       -- employer_referrals.id
  amount        numeric not null,
  validity_days int not null,
  is_paid       boolean not null default false,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- ── executive_reminders ───────────────────────────────────────────────────────
create table if not exists public.executive_reminders (
  id            uuid primary key default gen_random_uuid(),
  executive_id  uuid not null,
  type          text not null,              -- 'plan_expiry' | 'callback_followup'
  message       text not null,
  due_date      timestamptz not null,
  related_id    uuid,                       -- referral / callback id
  is_done       boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ── employer_referrals (deal pipeline) ────────────────────────────────────────
create table if not exists public.employer_referrals (
  id                 uuid primary key default gen_random_uuid(),
  executive_id       uuid not null,
  name               text,
  company            text,
  phone              text,
  email              text,
  status             text not null default 'lead',  -- 'lead' | 'plan_active' | 'expired'
  is_paid            boolean not null default false,
  amount             numeric,
  validity_days      int,
  plan_start         timestamptz,
  plan_end           timestamptz,
  source_callback_id uuid,
  employer_id        uuid,                  -- set when an employer/job is created
  created_at         timestamptz not null default now()
);

-- ── callback_requests — create if missing, then add the CRM columns ────────────
create table if not exists public.callback_requests (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  company        text,
  mobile         text,
  preferred_time text,
  message        text,
  status         text default 'yet_to_call',
  assigned_to    uuid,
  created_at     timestamptz not null default now()
);
alter table public.callback_requests
  add column if not exists notes                 text,
  add column if not exists called_at             timestamptz,
  add column if not exists converted_referral_id uuid;

-- Normalize any legacy statuses to the new vocabulary
update public.callback_requests set status = 'yet_to_call' where status is null or status = 'Pending';
update public.callback_requests set status = 'called'       where status = 'Called';
update public.callback_requests set status = 'converted'    where status = 'Converted';

-- ── RLS: on, with no public policies (service-role-only access) ────────────────
alter table public.payment_links       enable row level security;
alter table public.executive_reminders enable row level security;
alter table public.employer_referrals  enable row level security;
alter table public.callback_requests   enable row level security;

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists pl_exec_idx   on public.payment_links(executive_id);
create index if not exists pl_slug_idx   on public.payment_links(slug);
create index if not exists rem_exec_idx  on public.executive_reminders(executive_id, is_done, due_date);
create index if not exists er_exec_idx   on public.employer_referrals(executive_id, created_at desc);
create index if not exists cb_assign_idx on public.callback_requests(assigned_to, created_at desc);

commit;
