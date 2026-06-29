-- v43: Job boost system
--
-- Each paid plan ships with a monthly allowance of "Hot Job" boosts. A boost
-- pins jobs.boosted_until to (now() + 5 days) and is tracked in job_boost_log
-- so we can enforce the monthly quota and show usage on the dashboard.
--
-- Plan allowances (from pricing.html):
--   starter:      0 / month
--   growth:       2 / month
--   pro:          3 / month
--   pro_plus:     5 / month
--   enterprise_a: 10 / month
--   enterprise_b: 999 / month (effectively unlimited)

BEGIN;

-- 1. Boost column on jobs (drives talent-grid sort + employer/candidate UI badges)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS boosted_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_boosted_until
  ON public.jobs (boosted_until DESC NULLS LAST)
  WHERE boosted_until IS NOT NULL;

-- 2. Per-plan monthly boost allowance on employers
ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS month_boost_limit INTEGER DEFAULT 0;

UPDATE public.employers SET month_boost_limit = 0   WHERE plan = 'starter'      AND month_boost_limit = 0;
UPDATE public.employers SET month_boost_limit = 2   WHERE plan = 'growth'       AND month_boost_limit = 0;
UPDATE public.employers SET month_boost_limit = 3   WHERE plan = 'pro'          AND month_boost_limit = 0;
UPDATE public.employers SET month_boost_limit = 5   WHERE plan = 'pro_plus'     AND month_boost_limit = 0;
UPDATE public.employers SET month_boost_limit = 10  WHERE plan = 'enterprise_a' AND month_boost_limit = 0;
UPDATE public.employers SET month_boost_limit = 999 WHERE plan = 'enterprise_b' AND month_boost_limit = 0;

-- 3. Boost log — one row per boost activation, used for monthly quota counting
CREATE TABLE IF NOT EXISTS public.job_boost_log (
  id           BIGSERIAL PRIMARY KEY,
  employer_id  UUID        NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  job_id       UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  boosted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_boost_log_employer_date
  ON public.job_boost_log (employer_id, boosted_at);

-- 4. RLS — employers see only their own boost log; writes go via service key
ALTER TABLE public.job_boost_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_boost_log_select" ON public.job_boost_log;
CREATE POLICY "job_boost_log_select"
  ON public.job_boost_log FOR SELECT
  USING (employer_id = auth.uid());

DROP POLICY IF EXISTS "job_boost_log_insert" ON public.job_boost_log;
CREATE POLICY "job_boost_log_insert"
  ON public.job_boost_log FOR INSERT
  WITH CHECK (employer_id = auth.uid());

COMMIT;
