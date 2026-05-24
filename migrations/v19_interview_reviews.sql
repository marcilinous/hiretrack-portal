-- v19: Interview experience reviews from candidates about companies

CREATE TABLE IF NOT EXISTS interview_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id text NOT NULL,
  employer_id  text NOT NULL,
  job_id       text,
  job_title    text,
  rating       integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  difficulty   text NOT NULL CHECK (difficulty IN ('Easy','Medium','Hard')),
  got_offer    text NOT NULL CHECK (got_offer IN ('Yes','No','Pending')),
  experience   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ir_employer_idx  ON interview_reviews (employer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ir_candidate_idx ON interview_reviews (candidate_id);

-- One review per candidate per job
CREATE UNIQUE INDEX IF NOT EXISTS ir_unique_idx ON interview_reviews (candidate_id, job_id);

ALTER TABLE interview_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ir_select" ON interview_reviews FOR SELECT USING (true);
CREATE POLICY "ir_insert" ON interview_reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "ir_update" ON interview_reviews FOR UPDATE USING (true) WITH CHECK (true);
