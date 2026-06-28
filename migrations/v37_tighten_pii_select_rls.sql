-- v37: Tighten candidates/employers SELECT RLS (PII lockdown, part 2 of 2).
--
-- WHY: candidates_select / employers_select were `USING (true)` — full public read
-- of every row, including email + mobile, to anyone with the anon key. This replaces
-- those with "owner OR relationship" policies:
--   * candidates: the candidate themselves, OR an employer who either has an
--     application from them (to one of the employer's jobs) or a conversation with
--     them.
--   * employers: the employer themselves, OR a candidate who applied to one of their
--     jobs or has a conversation with them.
--
-- Public/browse reads now go through the v36 objects (candidates_public,
-- employers_public, search_talent(), employer_lookup()), which are owned by a
-- BYPASSRLS role and expose only safe columns — so they are unaffected by this.
--
-- PRECONDITION: apply v36 first, and deploy the frontend that reads from the v36
-- views/RPC, BEFORE applying this. Otherwise public profile pages, the homepage
-- counter, Find Talent, and employer-auth step 1 will read empty.
--
-- Idempotent / safe to re-run. Run in the Supabase SQL editor.

BEGIN;

-- RLS is already enabled on both tables (v20/v30); assert it for safety.
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employers  ENABLE ROW LEVEL SECURITY;

-- ── candidates: owner OR related employer ────────────────────────────────────
DROP POLICY IF EXISTS candidates_select ON public.candidates;
DROP POLICY IF EXISTS cand_select       ON public.candidates;  -- legacy (v20)
CREATE POLICY candidates_select ON public.candidates FOR SELECT USING (
  (select auth.uid()::text) = id::text
  OR EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    WHERE a.candidate_id = candidates.id
      AND j.employer_id::text = (select auth.uid()::text)
  )
  OR EXISTS (
    SELECT 1 FROM public.conversations cv
    WHERE cv.candidate_id = candidates.id
      AND cv.employer_id::text = (select auth.uid()::text)
  )
);

-- ── employers: owner OR related candidate ────────────────────────────────────
DROP POLICY IF EXISTS employers_select ON public.employers;
DROP POLICY IF EXISTS emp_select       ON public.employers;  -- legacy (v20)
CREATE POLICY employers_select ON public.employers FOR SELECT USING (
  (select auth.uid()::text) = id::text
  OR EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.applications a ON a.job_id = j.id
    WHERE j.employer_id = employers.id
      AND a.candidate_id::text = (select auth.uid()::text)
  )
  OR EXISTS (
    SELECT 1 FROM public.conversations cv
    WHERE cv.employer_id = employers.id
      AND cv.candidate_id::text = (select auth.uid()::text)
  )
);

COMMIT;

-- Verification:
--   -- as anon (anon key, no JWT): these now return ZERO rows
--   select id, email, mobile from public.candidates limit 5;
--   select id, email from public.employers limit 5;
--   -- but the safe view still works for anon:
--   select id, name from public.candidates_public limit 5;
--   -- as a logged-in employer: applicants to your jobs are still visible
--   select c.* from public.applications a
--     join public.candidates c on c.id = a.candidate_id
--    where a.job_id in (select id from public.jobs where employer_id = auth.uid());
