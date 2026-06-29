-- v45: Enterprise inline contact form fields
--
-- Adds callback_at + contact_pref to leads so the new enterprise form on
-- pricing.html can capture either a requested callback slot or a calendar
-- block preference. pincode/city stay nullable (enterprise leads skip them).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS callback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_pref TEXT
    CHECK (contact_pref IS NULL OR contact_pref IN ('callback', 'calendar', 'email'));

CREATE INDEX IF NOT EXISTS leads_segment_status_idx
  ON public.leads (segment, status) WHERE status = 'new';
