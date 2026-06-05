-- v33: Employer pricing system — tiers, add-on posts, payment records, slot guard.
--
-- Reuses existing employer columns (job_limit = "job_slots", plan_expires_at =
-- "plan_end", is_free_trial = "is_free_plan"); only adds plan_start + two new tables.
-- Remaps legacy plan names by price BEFORE applying the CHECK so no row violates it.
-- Idempotent / safe to re-run. Run in the Supabase SQL editor.

BEGIN;

-- 1. Remap legacy tiers by price, normalise unknowns, then constrain `plan`.
UPDATE public.employers SET plan = 'basic'  WHERE plan = 'starter';        -- ₹499
UPDATE public.employers SET plan = 'growth' WHERE plan = 'pro';            -- old pro ₹999 -> growth
UPDATE public.employers SET plan = 'free'
  WHERE plan IS NULL OR plan NOT IN ('free','basic','growth','pro','enterprise');

ALTER TABLE public.employers DROP CONSTRAINT IF EXISTS employers_plan_check;
ALTER TABLE public.employers
  ADD CONSTRAINT employers_plan_check CHECK (plan IN ('free','basic','growth','pro','enterprise'));
ALTER TABLE public.employers ALTER COLUMN plan SET DEFAULT 'free';

-- Only genuinely-new column (rest reuse existing columns).
ALTER TABLE public.employers ADD COLUMN IF NOT EXISTS plan_start timestamptz;

-- 2. Add-on job-post purchases (1 extra slot each, valid until plan_expires_at).
CREATE TABLE IF NOT EXISTS public.addon_posts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_id  uuid REFERENCES public.employers(id),
  payment_id   text,
  amount       int DEFAULT 199,
  job_id       uuid REFERENCES public.jobs(id),
  purchased_at timestamptz DEFAULT now(),
  valid_until  timestamptz,   -- = employer.plan_expires_at at purchase time
  is_used      boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS addon_posts_employer_idx ON public.addon_posts (employer_id);

-- 3. Payment records (plans + add-ons).
CREATE TABLE IF NOT EXISTS public.employer_payments (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_id         uuid REFERENCES public.employers(id),
  razorpay_order_id   text,
  razorpay_payment_id text,
  plan                text,
  amount              int,
  is_addon            boolean DEFAULT false,
  status              text DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employer_payments_employer_idx ON public.employer_payments (employer_id);

-- 4. RLS: owner reads their own rows; all writes happen via the service key (bypasses RLS).
ALTER TABLE public.addon_posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS addon_posts_select ON public.addon_posts;
CREATE POLICY addon_posts_select ON public.addon_posts FOR SELECT
  USING ((select auth.uid()::text) = employer_id::text);
DROP POLICY IF EXISTS employer_payments_select ON public.employer_payments;
CREATE POLICY employer_payments_select ON public.employer_payments FOR SELECT
  USING ((select auth.uid()::text) = employer_id::text);

-- 5. Slot guard (replaces v32's free-trial-only check): every employer is capped at
--    job_limit + (valid, unexpired add-on posts) ACTIVE (non-delisted, unexpired) jobs.
--    Non-bypassable backstop for the client-side canPostJob().
CREATE OR REPLACE FUNCTION public.enforce_job_limit() RETURNS trigger AS $$
DECLARE
  emp RECORD;
  active_cnt int;
  addon_cnt int;
BEGIN
  SELECT plan, job_limit, is_free_trial, plan_expires_at INTO emp
  FROM public.employers WHERE id = NEW.employer_id;
  IF emp IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO active_cnt FROM public.jobs
   WHERE employer_id = NEW.employer_id
     AND delisted = false
     AND (expires_at IS NULL OR expires_at > now());

  SELECT count(*) INTO addon_cnt FROM public.addon_posts
   WHERE employer_id = NEW.employer_id AND valid_until > now();

  IF active_cnt >= COALESCE(emp.job_limit, 1) + COALESCE(addon_cnt, 0) THEN
    RAISE EXCEPTION 'JOB_SLOTS_FULL: plan allows % active job post(s). Upgrade or buy an add-on post.',
      COALESCE(emp.job_limit, 1) USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_job_limit ON public.jobs;
CREATE TRIGGER trg_enforce_job_limit
  BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_job_limit();

COMMIT;
