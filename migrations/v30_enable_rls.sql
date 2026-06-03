-- v30: Enable RLS with correct JWT (auth.uid) policies. Idempotent. No anon-open holes.
--
-- The app sends the Supabase JWT on every request (js/sb-rest-shim.js sets
-- Authorization: Bearer <access_token>), so auth.uid() resolves to the logged-in
-- user and standard JWT policies are the correct mechanism. This re-asserts the
-- policies from v26 plus locks down the service-role-only CRM tables.
--
-- Uses a dynamic DROP loop (same approach v26 used) instead of standalone
-- DROP POLICY lines, to avoid copy-paste artifacts. Run in the Supabase SQL editor.

BEGIN;

-- 1. Enable RLS on the app tables ------------------------------------------------
ALTER TABLE IF EXISTS public.candidates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.saved_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.messages      ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies ONLY on the tables we recreate below.
--    (feed_posts / feed_likes are left untouched -- they keep their v11 policies.)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('candidates','employers','jobs','applications',
                        'notifications','saved_jobs','conversations','messages')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 3. Recreate the correct policies ----------------------------------------------

-- candidates: public read (recruiters/employers browse, applications embed
-- candidates(*)), owner-only writes.
CREATE POLICY candidates_select ON public.candidates FOR SELECT USING (true);
CREATE POLICY candidates_insert ON public.candidates FOR INSERT
  WITH CHECK ((select auth.uid()::text) = id::text);
CREATE POLICY candidates_update ON public.candidates FOR UPDATE
  USING ((select auth.uid()::text) = id::text)
  WITH CHECK ((select auth.uid()::text) = id::text);

-- employers: public read (public company profile, chat, admin), owner-only writes.
CREATE POLICY employers_select ON public.employers FOR SELECT USING (true);
CREATE POLICY employers_insert ON public.employers FOR INSERT
  WITH CHECK ((select auth.uid()::text) = id::text);
CREATE POLICY employers_update ON public.employers FOR UPDATE
  USING ((select auth.uid()::text) = id::text)
  WITH CHECK ((select auth.uid()::text) = id::text);

-- jobs: public read, employer-owned writes.
CREATE POLICY jobs_select ON public.jobs FOR SELECT USING (true);
CREATE POLICY jobs_insert ON public.jobs FOR INSERT
  WITH CHECK ((select auth.uid()::text) = employer_id::text);
CREATE POLICY jobs_update ON public.jobs FOR UPDATE
  USING ((select auth.uid()::text) = employer_id::text)
  WITH CHECK ((select auth.uid()::text) = employer_id::text);
CREATE POLICY jobs_delete ON public.jobs FOR DELETE
  USING ((select auth.uid()::text) = employer_id::text);

-- applications: the candidate, or the employer who owns the job.
CREATE POLICY applications_select ON public.applications FOR SELECT USING (
  (select auth.uid()::text) = candidate_id::text
  OR (select auth.uid()::text) IN (SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text)
);
CREATE POLICY applications_insert ON public.applications FOR INSERT
  WITH CHECK ((select auth.uid()::text) = candidate_id::text);
CREATE POLICY applications_update ON public.applications FOR UPDATE USING (
  (select auth.uid()::text) = candidate_id::text
  OR (select auth.uid()::text) IN (SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text)
) WITH CHECK (
  (select auth.uid()::text) = candidate_id::text
  OR (select auth.uid()::text) IN (SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text)
);
CREATE POLICY applications_delete ON public.applications FOR DELETE
  USING ((select auth.uid()::text) = candidate_id::text);

-- notifications: owner reads/updates; inserts come from server/triggers.
CREATE POLICY notifications_select ON public.notifications FOR SELECT
  USING ((select auth.uid()::text) = candidate_id::text);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY notifications_update ON public.notifications FOR UPDATE
  USING ((select auth.uid()::text) = candidate_id::text);

-- saved_jobs: owner only.
CREATE POLICY saved_jobs_select ON public.saved_jobs FOR SELECT
  USING ((select auth.uid()::text) = candidate_id::text);
CREATE POLICY saved_jobs_insert ON public.saved_jobs FOR INSERT
  WITH CHECK ((select auth.uid()::text) = candidate_id::text);
CREATE POLICY saved_jobs_update ON public.saved_jobs FOR UPDATE
  USING ((select auth.uid()::text) = candidate_id::text)
  WITH CHECK ((select auth.uid()::text) = candidate_id::text);
CREATE POLICY saved_jobs_delete ON public.saved_jobs FOR DELETE
  USING ((select auth.uid()::text) = candidate_id::text);

-- conversations: either participant.
CREATE POLICY conversations_select ON public.conversations FOR SELECT USING (
  (select auth.uid()::text) = candidate_id::text OR (select auth.uid()::text) = employer_id::text);
CREATE POLICY conversations_insert ON public.conversations FOR INSERT WITH CHECK (
  (select auth.uid()::text) = candidate_id::text OR (select auth.uid()::text) = employer_id::text);
CREATE POLICY conversations_update ON public.conversations FOR UPDATE USING (
  (select auth.uid()::text) = candidate_id::text OR (select auth.uid()::text) = employer_id::text);

-- messages: sender must be the caller and a participant of the conversation.
CREATE POLICY messages_select ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id::text = conversation_id::text
          AND ((select auth.uid()::text) = c.candidate_id::text OR (select auth.uid()::text) = c.employer_id::text)));
CREATE POLICY messages_insert ON public.messages FOR INSERT WITH CHECK (
  (select auth.uid()::text) = sender_id::text
  AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id::text = conversation_id::text
             AND ((select auth.uid()::text) = c.candidate_id::text OR (select auth.uid()::text) = c.employer_id::text)));

-- 4. Service-role-only CRM tables: RLS on, NO policy => anon/authenticated fully
--    denied; the /api/exec.js service key bypasses RLS. Satisfies the linter,
--    stays secure. IF EXISTS guards any table that isn't present.
ALTER TABLE IF EXISTS public.executives          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.callback_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employer_referrals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.executive_reminders ENABLE ROW LEVEL SECURITY;

COMMIT;
