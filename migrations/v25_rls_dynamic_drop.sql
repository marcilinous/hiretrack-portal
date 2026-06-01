-- v25: Dynamically drop EVERY policy on sensitive tables then recreate cleanly.
-- Previous migrations only dropped policies by known names; any policy created
-- directly in the Supabase dashboard or with an unexpected name was left behind.
-- This migration queries pg_policies to drop them all, then recreates correct ones.

BEGIN;

-- Drop ALL policies on applications, notifications, saved_jobs (any name)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('applications', 'notifications', 'saved_jobs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;

  -- Drop only UPDATE policies on candidates (SELECT stays public)
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'candidates' AND cmd = 'UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.candidates', r.policyname);
  END LOOP;
END $$;

-- ── applications ──
CREATE POLICY "applications_select" ON public.applications FOR SELECT USING (
  (select auth.uid()::text) = candidate_id::text
  OR (select auth.uid()::text) IN (
    SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text
  )
);
CREATE POLICY "applications_insert" ON public.applications FOR INSERT WITH CHECK (
  (select auth.uid()::text) = candidate_id::text
);
CREATE POLICY "applications_update" ON public.applications FOR UPDATE USING (
  (select auth.uid()::text) = candidate_id::text
  OR (select auth.uid()::text) IN (
    SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text
  )
) WITH CHECK (
  (select auth.uid()::text) = candidate_id::text
  OR (select auth.uid()::text) IN (
    SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text
  )
);
CREATE POLICY "applications_delete" ON public.applications FOR DELETE USING (
  (select auth.uid()::text) = candidate_id::text
);

-- ── notifications ──
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (
  (select auth.uid()::text) = candidate_id::text
);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (
  (select auth.uid()::text) = candidate_id::text
);

-- ── saved_jobs ──
CREATE POLICY "saved_jobs_select" ON public.saved_jobs FOR SELECT USING (
  (select auth.uid()::text) = candidate_id::text
);
CREATE POLICY "saved_jobs_insert" ON public.saved_jobs FOR INSERT WITH CHECK (
  (select auth.uid()::text) = candidate_id::text
);
CREATE POLICY "saved_jobs_update" ON public.saved_jobs FOR UPDATE USING (
  (select auth.uid()::text) = candidate_id::text
) WITH CHECK (
  (select auth.uid()::text) = candidate_id::text
);
CREATE POLICY "saved_jobs_delete" ON public.saved_jobs FOR DELETE USING (
  (select auth.uid()::text) = candidate_id::text
);

-- ── candidates UPDATE ──
CREATE POLICY "candidates_update" ON public.candidates FOR UPDATE USING (
  (select auth.uid()::text) = id::text
) WITH CHECK (
  (select auth.uid()::text) = id::text
);

COMMIT;
