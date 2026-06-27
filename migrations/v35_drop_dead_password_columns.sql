-- v35: Drop the dead plaintext `password` columns from candidates and employers.
--
-- WHY: authentication runs entirely through Supabase Auth (GoTrue) since v20 —
-- the real credential lives in auth.users.encrypted_password (bcrypt). The legacy
-- public.candidates.password / public.employers.password columns:
--   * had their NOT NULL constraint dropped in v22,
--   * were scrubbed to NULL in v29,
--   * are read by NOTHING in the live app (the only `password` reads in api/ are
--     against the separate `executives` table, hashed via scrypt in v34).
-- They are pure dead weight and a foot-gun (a future `select('*')` could re-expose
-- the column name in payloads). This completes ARCHITECTURE.md §9 step 4
-- ("Remove the legacy password columns").
--
-- Idempotent / safe to re-run. Run in the Supabase SQL editor.

BEGIN;

ALTER TABLE public.candidates DROP COLUMN IF EXISTS password;
ALTER TABLE public.employers  DROP COLUMN IF EXISTS password;

COMMIT;

-- Verification:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name in ('candidates','employers')
--      and column_name = 'password';   -- returns 0 rows
