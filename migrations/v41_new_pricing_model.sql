-- v41: New pricing model — 6-tier plans with contact unlocks
-- Plans: starter (₹499/10d), growth (₹999/25d), pro (₹1499/mo),
--        pro_plus (₹2499/mo), enterprise_a (₹4999/mo), enterprise_b (₹9999/mo)

-- Add day_unlock_limit to track per-day contact unlock quota
ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS day_unlock_limit INTEGER DEFAULT 0;

-- Seed unlock limits for any employers already on old plan names
UPDATE employers SET day_unlock_limit = 10  WHERE plan = 'basic'        AND day_unlock_limit = 0;
UPDATE employers SET day_unlock_limit = 25  WHERE plan = 'growth'       AND day_unlock_limit = 0;
UPDATE employers SET day_unlock_limit = 35  WHERE plan = 'pro'          AND day_unlock_limit = 0;

-- Remap legacy plan names to new scheme
-- old basic (1 post/mo) → starter (closest equivalent: 1 post/10d)
UPDATE employers SET plan = 'starter', day_limit = 10, job_limit = 1, day_unlock_limit = 10
  WHERE plan = 'basic';

-- old pro (6 posts/mo at ₹2499) → pro_plus (5 posts/mo at ₹2499, closest)
UPDATE employers SET plan = 'pro_plus', day_unlock_limit = 50
  WHERE plan = 'pro' AND job_limit >= 5;

-- Ensure new plan values accepted by any enum check (none in schema — plans stored as text)
-- No enum changes needed.

-- Contact unlocks tracking table
CREATE TABLE IF NOT EXISTS employer_unlock_log (
  id            BIGSERIAL PRIMARY KEY,
  employer_id   UUID        NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
  candidate_id  UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  job_id        UUID        REFERENCES jobs(id) ON DELETE SET NULL,
  UNIQUE (employer_id, candidate_id)  -- one unlock per candidate per employer lifetime
);

-- Index for daily quota queries
CREATE INDEX IF NOT EXISTS idx_unlock_log_employer_date
  ON employer_unlock_log (employer_id, unlocked_at);

-- RLS: employers can only see their own unlock log
ALTER TABLE employer_unlock_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employer_unlock_log_select" ON employer_unlock_log;
CREATE POLICY "employer_unlock_log_select"
  ON employer_unlock_log FOR SELECT
  USING (
    employer_id = (
      SELECT id FROM employers WHERE id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "employer_unlock_log_insert" ON employer_unlock_log;
CREATE POLICY "employer_unlock_log_insert"
  ON employer_unlock_log FOR INSERT
  WITH CHECK (
    employer_id = (
      SELECT id FROM employers WHERE id = auth.uid() LIMIT 1
    )
  );
