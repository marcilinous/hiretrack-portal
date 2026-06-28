-- v36: Public-safe views + gated talent-search RPC (PII lockdown, part 1 of 2).
--
-- WHY: candidates_select / employers_select were `USING (true)`, so ANY holder of
-- the anon key (even logged-out) could read every candidate's email + mobile and
-- every employer's contact info via a direct REST call. v37 tightens those base
-- policies to owner + relationship only. THIS migration adds the safe read paths
-- the public UI needs, so nothing breaks when v37 lands:
--   * candidates_public / employers_public — only non-sensitive columns, readable
--     by anon (public profile pages, the homepage candidate counter).
--   * search_talent() — the employer "Find Talent" browse. Returns safe columns for
--     every candidate, but reveals `mobile` ONLY when the calling employer has an
--     active paid plan OR the candidate has applied to one of their jobs.
--
-- The views are owned by `postgres` (BYPASSRLS) and intentionally expose a fixed,
-- safe column projection — this is the column-level equivalent the base-table RLS
-- can't express. The Supabase linter may flag them as "security definer views";
-- that is the intended design here.
--
-- Idempotent / safe to re-run. Apply BEFORE v37. Run in the Supabase SQL editor.

BEGIN;

-- ── 1. candidates_public ─────────────────────────────────────────────────────
-- Safe columns only: NO email, mobile, resume_url/resume_data, or any contact PII.
DROP VIEW IF EXISTS public.candidates_public;
CREATE VIEW public.candidates_public AS
  SELECT id, name, jobtitle, city, experience, current_company,
         preferred_job_type, notice_period, expected_salary, about,
         skills, photo_url, created_at, boosted_until
  FROM public.candidates
  WHERE name IS NOT NULL;

GRANT SELECT ON public.candidates_public TO anon, authenticated;

-- ── 2. employers_public ──────────────────────────────────────────────────────
-- Public company-profile fields only: NO email or mobile.
DROP VIEW IF EXISTS public.employers_public;
CREATE VIEW public.employers_public AS
  SELECT id, company, contact_name, city, company_logo,
         plan, plan_expires_at, created_at
  FROM public.employers;

GRANT SELECT ON public.employers_public TO anon, authenticated;

-- ── 3. Contact-visibility helper ─────────────────────────────────────────────
-- True when the employer may see a candidate's mobile: active paid plan, OR the
-- candidate applied to one of the employer's jobs.
CREATE OR REPLACE FUNCTION public._employer_can_see_contact(p_employer uuid, p_candidate uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_employer IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.employers e
        WHERE e.id = p_employer
          AND e.plan IN ('basic', 'growth', 'pro', 'enterprise')
          AND (e.plan_expires_at IS NULL OR e.plan_expires_at > now())
      )
      OR EXISTS (
        SELECT 1
        FROM public.applications a
        JOIN public.jobs j ON j.id = a.job_id
        WHERE a.candidate_id = p_candidate
          AND j.employer_id = p_employer
      )
    );
$$;

-- ── 4. search_talent() ───────────────────────────────────────────────────────
-- Employer "Find Talent" browse. Drop-in for the old
-- `from('candidates').select(...).limit(200)` query: returns up to 200 candidates,
-- boosted first. `mobile` is gated per-row via the helper above. Client keeps doing
-- keyword/city/experience filtering on the result set.
CREATE OR REPLACE FUNCTION public.search_talent()
RETURNS TABLE (
  id            uuid,
  name          text,
  jobtitle      text,
  city          text,
  experience    text,
  skills        text[],
  photo_url     text,
  boosted_until timestamptz,
  mobile        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.name, c.jobtitle, c.city, c.experience,
    c.skills, c.photo_url, c.boosted_until,
    CASE
      WHEN public._employer_can_see_contact(auth.uid(), c.id) THEN c.mobile
      ELSE NULL
    END AS mobile
  FROM public.candidates c
  WHERE c.name IS NOT NULL
  ORDER BY c.boosted_until DESC NULLS LAST
  LIMIT 200;
$$;

-- Only logged-in users (employers) may browse talent; anon cannot.
REVOKE ALL ON FUNCTION public.search_talent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_talent() TO authenticated;

-- ── 5. employer_lookup() ─────────────────────────────────────────────────────
-- employer-auth.html step 1 runs BEFORE login (anon) to greet returning employers
-- and branch to login vs. register. Once employers_select is owner-only, anon can't
-- read the table, so expose just the minimum (existence + first name) via a definer
-- function. (Account-existence was already inferable from the old flow.)
CREATE OR REPLACE FUNCTION public.employer_lookup(p_email text)
RETURNS TABLE (id uuid, contact_name text, company text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, contact_name, company
  FROM public.employers
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.employer_lookup(text) TO anon, authenticated;

COMMIT;

-- Verification:
--   -- as anon: views return safe columns, no email/mobile present
--   select * from public.candidates_public limit 1;
--   select * from public.employers_public limit 1;
--   -- as a free employer with no applicants: mobile is NULL
--   select id, name, mobile from public.search_talent() limit 5;
