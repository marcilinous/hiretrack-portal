-- v42: Unlock-gated talent browse
--
-- Switches the talent-browse PII gate from "any active paid plan"
-- to "candidate applied to one of your jobs OR you've unlocked them
-- via employer_unlock_log". An active plan is still required to spend
-- an unlock (the /api/unlock endpoint enforces that), but plan alone
-- no longer auto-reveals every candidate.
--
-- Also adds `email` to search_talent() so the unlock can reveal both
-- contact channels at once, and updates the plan whitelist to include
-- the new 6-tier plan IDs (depends on v41).

BEGIN;

-- ── 1. New contact-visibility helper ─────────────────────────────────────────
-- True when the employer may see a candidate's mobile/email:
--   * the candidate applied to one of the employer's jobs (free, as before)
--   * OR the employer has an entry in employer_unlock_log for this candidate
-- Note: the unlock log row is created server-side by /api/unlock?action=reveal,
-- which enforces the plan + daily quota check before inserting.
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
        SELECT 1
        FROM public.applications a
        JOIN public.jobs j ON j.id = a.job_id
        WHERE a.candidate_id = p_candidate
          AND j.employer_id = p_employer
      )
      OR EXISTS (
        SELECT 1
        FROM public.employer_unlock_log eul
        WHERE eul.employer_id = p_employer
          AND eul.candidate_id = p_candidate
      )
    );
$$;

-- ── 2. search_talent() — include email, keep mobile gated ────────────────────
DROP FUNCTION IF EXISTS public.search_talent();

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
  mobile        text,
  email         text
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
    END AS mobile,
    CASE
      WHEN public._employer_can_see_contact(auth.uid(), c.id) THEN c.email
      ELSE NULL
    END AS email
  FROM public.candidates c
  WHERE c.name IS NOT NULL
  ORDER BY c.boosted_until DESC NULLS LAST
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.search_talent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_talent() TO authenticated;

COMMIT;

-- Verification:
--   -- as employer with active plan but no unlocks: mobile/email NULL
--   select id, name, mobile, email from public.search_talent() limit 5;
--
--   -- after POST /api/unlock?action=reveal {employerId, candidateId}:
--   --   the chosen candidate's row should now return mobile + email
--
--   -- candidates that applied to one of your jobs: still revealed free
