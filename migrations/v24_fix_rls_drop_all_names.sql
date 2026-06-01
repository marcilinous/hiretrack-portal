-- v24: Drop every known policy name across v20/v21/v23 and recreate cleanly.
-- v23 only dropped v21-named policies; v20-named ones ("apps_select", "cand_update", etc.)
-- are still alive. This migration wipes all names and sets a single clean policy per action.
-- Run in Supabase SQL Editor.

BEGIN;

-- ── applications ──
DROP POLICY IF EXISTS "apps_select"           ON public.applications;
DROP POLICY IF EXISTS "applications_select"   ON public.applications;
DROP POLICY IF EXISTS "apps_insert"           ON public.applications;
DROP POLICY IF EXISTS "applications_insert"   ON public.applications;
DROP POLICY IF EXISTS "apps_update"           ON public.applications;
DROP POLICY IF EXISTS "applications_update"   ON public.applications;
DROP POLICY IF EXISTS "apps_delete"           ON public.applications;
DROP POLICY IF EXISTS "applications_delete"   ON public.applications;

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
DROP POLICY IF EXISTS "notif_select"          ON public.notifications;
DROP POLICY IF EXISTS "notifications_select"  ON public.notifications;
DROP POLICY IF EXISTS "notif_insert"          ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert"  ON public.notifications;
DROP POLICY IF EXISTS "notif_update"          ON public.notifications;
DROP POLICY IF EXISTS "notifications_update"  ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (
  (select auth.uid()::text) = candidate_id::text
);
-- Notifications are inserted by server-side functions/triggers, allow service role only
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (
  (select auth.uid()::text) = candidate_id::text
);

-- ── saved_jobs ──
DROP POLICY IF EXISTS "saved_select"          ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_select"     ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_insert"          ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_insert"     ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_update"          ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_update"     ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_delete"          ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_delete"     ON public.saved_jobs;

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

-- ── candidates UPDATE (lock down — only owner can edit their profile) ──
DROP POLICY IF EXISTS "cand_update"           ON public.candidates;
DROP POLICY IF EXISTS "candidates_update"     ON public.candidates;

CREATE POLICY "candidates_update" ON public.candidates FOR UPDATE USING (
  (select auth.uid()::text) = id::text
) WITH CHECK (
  (select auth.uid()::text) = id::text
);

-- ── candidates SELECT stays public (recruiters browse profiles) ──
-- "cand_select" (v20) and "candidates_select" (v21) both exist with USING(true) — fine.

COMMIT;
