-- v44: unlock_usage_daily() RPC for the employer-dashboard analytics chart
-- Returns daily unlock counts over the last 30 days for the calling employer.
-- SECURITY DEFINER scopes results to auth.uid() so no employer can read another.

CREATE OR REPLACE FUNCTION public.unlock_usage_daily()
RETURNS TABLE (day date, unlocks bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT (current_date - i)::date AS day
    FROM generate_series(0, 29) AS i
  )
  SELECT
    d.day,
    COALESCE(COUNT(eul.id), 0) AS unlocks
  FROM days d
  LEFT JOIN public.employer_unlock_log eul
    ON eul.employer_id = auth.uid()
   AND eul.unlocked_at >= d.day::timestamptz
   AND eul.unlocked_at <  (d.day + 1)::timestamptz
  GROUP BY d.day
  ORDER BY d.day ASC;
$$;

REVOKE ALL ON FUNCTION public.unlock_usage_daily() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_usage_daily() TO authenticated;
