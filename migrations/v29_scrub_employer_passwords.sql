-- v29: Scrub dead plaintext passwords from public profile tables.
--
-- WHY: employer-auth.html historically fetched `employers.*` (incl. the plaintext
-- `password` column) to the browser and compared it client-side. Combined with the
-- public `emp_select USING (true)` RLS policy, ANY holder of the anon key could read
-- every employer's plaintext password. Authentication now runs entirely through
-- Supabase Auth (GoTrue), whose real credential lives in `auth.users.encrypted_password`
-- (bcrypt, populated by the v20 migration / admin user-create). The plaintext
-- `employers.password` column is therefore dead, redundant data — nothing reads it.
--
-- This migration removes the exposed secret values while KEEPING the column (employers
-- can also log in via email OTP; no schema change, no app `select('*')` breakage).
--
-- Idempotent and safe to re-run. Run in the Supabase SQL Editor.

BEGIN;

-- Optional snapshot for reversibility/paranoia (the hashed credential already exists
-- in auth.users, so this is not strictly required). Uncomment to keep a backup:
-- CREATE TABLE IF NOT EXISTS public._employer_password_backup AS
--   SELECT id, password, now() AS backed_up_at
--   FROM public.employers WHERE password IS NOT NULL;

-- 1. Employers (the reported vulnerability).
UPDATE public.employers
   SET password = NULL
 WHERE password IS NOT NULL;

-- 2. Candidates carry the same dead plaintext column behind candidates_select
--    USING (true). Candidate auth is out of scope for this change, but scrubbing the
--    redundant secret here is equally safe (CandidateAuth uses Supabase Auth, not this
--    column). Comment out if you prefer to handle candidates separately.
UPDATE public.candidates
   SET password = NULL
 WHERE password IS NOT NULL;

COMMIT;

-- Verification (run as anon / with the anon key):
--   select password from public.employers limit 5;   -- all NULL
--   select id, company, contact_name from public.employers limit 5;  -- still works
