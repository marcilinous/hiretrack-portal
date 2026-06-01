-- v26: Full RLS rebuild — drop EVERY policy on every table, then recreate.
-- Fixes all residual policies from v20/v21/v23/v24/v25 that may still be active.
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards throughout).
-- Run in Supabase SQL Editor.

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- STEP 1: Drop ALL policies on ALL public tables dynamically
-- ══════════════════════════════════════════════════════════════
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════
-- STEP 2: Ensure RLS is enabled on all sensitive tables
-- ══════════════════════════════════════════════════════════════
ALTER TABLE public.candidates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages         ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- STEP 3: Recreate all policies cleanly
-- ══════════════════════════════════════════════════════════════

-- ── candidates ──
-- Public read (employers browse profiles, freshSync works without auth)
CREATE POLICY "candidates_select"
  ON public.candidates FOR SELECT USING (true);

-- Only the candidate can insert/update their own row
CREATE POLICY "candidates_insert"
  ON public.candidates FOR INSERT
  WITH CHECK ((select auth.uid()::text) = id::text);

CREATE POLICY "candidates_update"
  ON public.candidates FOR UPDATE
  USING     ((select auth.uid()::text) = id::text)
  WITH CHECK ((select auth.uid()::text) = id::text);

-- ── employers ──
CREATE POLICY "employers_select"
  ON public.employers FOR SELECT USING (true);

CREATE POLICY "employers_insert"
  ON public.employers FOR INSERT
  WITH CHECK ((select auth.uid()::text) = id::text);

CREATE POLICY "employers_update"
  ON public.employers FOR UPDATE
  USING     ((select auth.uid()::text) = id::text)
  WITH CHECK ((select auth.uid()::text) = id::text);

-- ── jobs ──
CREATE POLICY "jobs_select"
  ON public.jobs FOR SELECT USING (true);

CREATE POLICY "jobs_insert"
  ON public.jobs FOR INSERT
  WITH CHECK ((select auth.uid()::text) = employer_id::text);

CREATE POLICY "jobs_update"
  ON public.jobs FOR UPDATE
  USING     ((select auth.uid()::text) = employer_id::text)
  WITH CHECK ((select auth.uid()::text) = employer_id::text);

CREATE POLICY "jobs_delete"
  ON public.jobs FOR DELETE
  USING ((select auth.uid()::text) = employer_id::text);

-- ── applications ──
-- Candidates see their own; employers see apps for their jobs
CREATE POLICY "applications_select"
  ON public.applications FOR SELECT USING (
    (select auth.uid()::text) = candidate_id::text
    OR (select auth.uid()::text) IN (
      SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text
    )
  );

CREATE POLICY "applications_insert"
  ON public.applications FOR INSERT
  WITH CHECK ((select auth.uid()::text) = candidate_id::text);

CREATE POLICY "applications_update"
  ON public.applications FOR UPDATE USING (
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

CREATE POLICY "applications_delete"
  ON public.applications FOR DELETE
  USING ((select auth.uid()::text) = candidate_id::text);

-- ── notifications ──
CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  USING ((select auth.uid()::text) = candidate_id::text);

-- Notifications are written by server/triggers
CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE
  USING ((select auth.uid()::text) = candidate_id::text);

-- ── saved_jobs ──
CREATE POLICY "saved_jobs_select"
  ON public.saved_jobs FOR SELECT
  USING ((select auth.uid()::text) = candidate_id::text);

CREATE POLICY "saved_jobs_insert"
  ON public.saved_jobs FOR INSERT
  WITH CHECK ((select auth.uid()::text) = candidate_id::text);

CREATE POLICY "saved_jobs_update"
  ON public.saved_jobs FOR UPDATE
  USING     ((select auth.uid()::text) = candidate_id::text)
  WITH CHECK ((select auth.uid()::text) = candidate_id::text);

CREATE POLICY "saved_jobs_delete"
  ON public.saved_jobs FOR DELETE
  USING ((select auth.uid()::text) = candidate_id::text);

-- ── conversations ──
CREATE POLICY "conversations_select"
  ON public.conversations FOR SELECT USING (
    (select auth.uid()::text) = candidate_id::text
    OR (select auth.uid()::text) = employer_id::text
  );

CREATE POLICY "conversations_insert"
  ON public.conversations FOR INSERT WITH CHECK (
    (select auth.uid()::text) = candidate_id::text
    OR (select auth.uid()::text) = employer_id::text
  );

CREATE POLICY "conversations_update"
  ON public.conversations FOR UPDATE USING (
    (select auth.uid()::text) = candidate_id::text
    OR (select auth.uid()::text) = employer_id::text
  );

-- ── messages ──
CREATE POLICY "messages_select"
  ON public.messages FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id::text = conversation_id::text
        AND (
          (select auth.uid()::text) = candidate_id::text
          OR (select auth.uid()::text) = employer_id::text
        )
    )
  );

CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT WITH CHECK (
    (select auth.uid()::text) = sender_id::text
    AND EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id::text = conversation_id::text
        AND (
          (select auth.uid()::text) = candidate_id::text
          OR (select auth.uid()::text) = employer_id::text
        )
    )
  );

COMMIT;
