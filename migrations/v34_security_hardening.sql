-- v34: Security hardening — scrub plaintext secret_codes in executives table.
--
-- The exec signup secret_code was stored as plaintext (the value of the
-- EXEC_SIGNUP_CODE env var). Since v34 the API hashes it via scrypt before
-- writing. This migration marks all existing plaintext codes as redacted so
-- old rows don't leak the active signup code if the DB is ever read directly.
--
-- Idempotent / safe to re-run. Run in the Supabase SQL editor.

BEGIN;

-- Redact any existing plaintext secret_codes (rows that do NOT start with
-- 'scrypt$' are legacy plaintext values from before this fix).
UPDATE public.executives
  SET secret_code = '[redacted-pre-v34]'
  WHERE secret_code IS NOT NULL
    AND secret_code NOT LIKE 'scrypt$%'
    AND secret_code NOT LIKE '[redacted%';

-- Add a partial index to speed up active executive lookups used by the CRM.
CREATE INDEX IF NOT EXISTS executives_active_email_idx
  ON public.executives (email)
  WHERE is_active = true;

COMMIT;
