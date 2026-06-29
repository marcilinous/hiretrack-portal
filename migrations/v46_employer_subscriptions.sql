-- v46: Recurring subscriptions for annual billing
--
-- Holds the Razorpay subscription handle and lifecycle status for each
-- annual-billing customer. `cycle` records whether the customer chose
-- monthly EMI (12 payments / year) or annual upfront (1 payment / year),
-- both with auto-renewal handled by Razorpay.

CREATE TABLE IF NOT EXISTS public.employer_subscriptions (
  id                        BIGSERIAL PRIMARY KEY,
  employer_id               UUID        NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  plan_id                   TEXT        NOT NULL,
  cycle                     TEXT        NOT NULL CHECK (cycle IN ('monthly', 'annual')),
  razorpay_subscription_id  TEXT        NOT NULL UNIQUE,
  razorpay_plan_id          TEXT        NOT NULL,
  status                    TEXT        NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'authenticated', 'active', 'paused', 'cancelled', 'completed', 'expired')),
  total_count               INTEGER,
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  started_at                TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subs_employer_active_idx
  ON public.employer_subscriptions (employer_id, status)
  WHERE status IN ('active', 'authenticated');

ALTER TABLE public.employer_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subs_select_own" ON public.employer_subscriptions;
CREATE POLICY "subs_select_own"
  ON public.employer_subscriptions FOR SELECT
  USING (employer_id = auth.uid());
