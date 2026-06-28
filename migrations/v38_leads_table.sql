-- v38: B2B lead-qualification funnel storage.
--
-- Backs the LeadQualificationFunnel (callback.html). The "standard" flow (1–50
-- annual roles) POSTs to /api/leads, which inserts here via the service key. The
-- "enterprise" flow (50+) skips this table and books directly via Cal.com.
--
-- RLS is ENABLED with NO policy: anon/authenticated are fully denied; only the
-- service-role key (api/leads.js, api/exec.js, admin) can read/write — same model
-- as callback_requests / executives. Idempotent. Run in the Supabase SQL editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.leads (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name           text NOT NULL,
  company        text NOT NULL,
  work_email     text NOT NULL,
  -- Raw volume bucket chosen in step 1 ('1-10' | '11-50' | '50+').
  annual_volume  text NOT NULL CHECK (annual_volume IN ('1-10', '11-50', '50+')),
  -- Derived routing segment ('standard' | 'enterprise').
  segment        text NOT NULL DEFAULT 'standard' CHECK (segment IN ('standard', 'enterprise')),
  source         text NOT NULL DEFAULT 'lead_funnel',
  status         text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'won', 'lost')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx     ON public.leads (status) WHERE status = 'new';

-- Service-role-only: RLS on, no policy => anon/authenticated denied, service key bypasses.
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verification:
--   select id, segment, status from public.leads order by created_at desc limit 5;
