-- v47: Pricing-page callback fields
--
-- callback_requests grows three fields so the pricing.html enterprise
-- form (and the bottom-of-page Request Callback CTA) can post into the
-- same pipeline the executive dashboard already shows:
--   * email          — captured by pricing form, useful for sales follow-up
--   * plan_interest  — which plan card the user was on (or 'general')
--   * source         — where the request originated (callback_page |
--                      pricing_enterprise | pricing_general)
--
-- preferred_time stays NOT NULL — the API defaults it to 'ASAP' when the
-- caller doesn't pick a slot.

ALTER TABLE public.callback_requests
  ADD COLUMN IF NOT EXISTS email          TEXT,
  ADD COLUMN IF NOT EXISTS plan_interest  TEXT,
  ADD COLUMN IF NOT EXISTS source         TEXT NOT NULL DEFAULT 'callback_page'
    CHECK (source IN ('callback_page', 'pricing_enterprise', 'pricing_general'));

CREATE INDEX IF NOT EXISTS callback_requests_source_idx
  ON public.callback_requests (source);
