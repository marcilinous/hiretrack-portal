-- v32: Job posting rules — new columns + free-trial job-limit guard.
--
-- Adds the two genuinely-new job fields (application_deadline, openings) and a
-- BEFORE INSERT trigger that enforces the free-trial limit at the database level,
-- so it cannot be bypassed from the client, the service key, or the SQL console.
-- All other fields reuse existing columns (job_type, experience, skills,
-- is_free_trial, posted_by_executive [stores the exec id]).
--
-- Idempotent / safe to re-run. Run in the Supabase SQL editor.

BEGIN;

-- 1. New columns (everything else already exists).
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS application_deadline date;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS openings int DEFAULT 1;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS job_type text DEFAULT 'Full Time'; -- harmless if present

-- 2. Bug 1 guard: a free-trial employer may hold at most job_limit jobs TOTAL
--    (any status — active, delisted, or expired). Toggling delisted no longer
--    frees up a slot. Only constrains is_free_trial employers, so paid/free
--    re-posting after expiry is unchanged.
CREATE OR REPLACE FUNCTION public.enforce_job_limit() RETURNS trigger AS $$
DECLARE
  emp RECORD;
  cnt int;
BEGIN
  SELECT plan, job_limit, is_free_trial INTO emp
  FROM public.employers WHERE id = NEW.employer_id;

  IF emp IS NULL THEN
    RETURN NEW;  -- unknown employer: don't block (FKs handle integrity)
  END IF;

  IF COALESCE(emp.is_free_trial, false) THEN
    SELECT count(*) INTO cnt FROM public.jobs WHERE employer_id = NEW.employer_id;
    IF cnt >= COALESCE(emp.job_limit, 1) THEN
      RAISE EXCEPTION 'JOB_LIMIT_TRIAL: Free trial allows only % job post(s). Upgrade to post more.',
        COALESCE(emp.job_limit, 1)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_job_limit ON public.jobs;
CREATE TRIGGER trg_enforce_job_limit
  BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_job_limit();

COMMIT;
