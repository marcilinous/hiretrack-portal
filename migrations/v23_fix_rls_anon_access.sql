-- v23: Fix RLS policies — remove open anon access on sensitive tables
-- v21 accidentally added "OR auth.uid() IS NULL" to sensitive tables,
-- making applications, notifications, saved_jobs, and candidates UPDATE
-- publicly readable/writable by anyone without authentication.
-- Run in Supabase SQL Editor.

BEGIN;

-- ── applications ──
DROP POLICY IF EXISTS "applications_select" ON public.applications;
DROP POLICY IF EXISTS "applications_insert" ON public.applications;
DROP POLICY IF EXISTS "applications_update" ON public.applications;
DROP POLICY IF EXISTS "applications_delete" ON public.applications;

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
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (
  (select auth.uid()::text) = candidate_id::text
);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (
  (select auth.uid()::text) = candidate_id::text
);

-- ── saved_jobs ──
DROP POLICY IF EXISTS "saved_jobs_select" ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_insert" ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_update" ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_delete" ON public.saved_jobs;

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

-- ── candidates UPDATE (was allowing anon updates — anyone could edit any profile) ──
DROP POLICY IF EXISTS "candidates_update" ON public.candidates;
DROP POLICY IF EXISTS "cand_update" ON public.candidates;

CREATE POLICY "candidates_update" ON public.candidates FOR UPDATE USING (
  (select auth.uid()::text) = id::text
) WITH CHECK (
  (select auth.uid()::text) = id::text
);

-- ── candidates SELECT — keep public (recruiters search profiles) ──
-- Both "cand_select" (v20) and "candidates_select" (v21) exist; both are USING(true). No change needed.

COMMIT;
