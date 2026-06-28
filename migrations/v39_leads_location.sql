-- v39: Add location (pincode → city/sub-city) to the lead-qualification funnel.
--
-- The standard flow now collects a 6-digit pincode that dynamically resolves to
-- city + sub-city via the India Post API (PincodeUtil), matching candidates/
-- employers which already carry pincode/city/subcity. Idempotent — run in the
-- Supabase SQL editor.

BEGIN;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pincode text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS city    text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS subcity text;

CREATE INDEX IF NOT EXISTS leads_city_idx ON public.leads (city);

COMMIT;

-- Verification:
--   select id, city, subcity, pincode from public.leads order by created_at desc limit 5;
