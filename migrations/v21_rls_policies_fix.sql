-- v21: Consolidated Row-Level Security (RLS) Policy Fixes
-- Run in Supabase SQL Editor as superuser / table owner.
-- Idempotent: safe to run.

BEGIN;

-- 1. admin_settings
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_settings_select" ON public.admin_settings;
DROP POLICY IF EXISTS "admin_settings_insert" ON public.admin_settings;
DROP POLICY IF EXISTS "admin_settings_update" ON public.admin_settings;
DROP POLICY IF EXISTS "admin_settings_delete" ON public.admin_settings;

CREATE POLICY "admin_settings_select" ON public.admin_settings FOR SELECT USING (true);
CREATE POLICY "admin_settings_insert" ON public.admin_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "admin_settings_update" ON public.admin_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "admin_settings_delete" ON public.admin_settings FOR DELETE USING (true);


-- 2. applications
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "applications_select" ON public.applications;
DROP POLICY IF EXISTS "applications_insert" ON public.applications;
DROP POLICY IF EXISTS "applications_update" ON public.applications;
DROP POLICY IF EXISTS "applications_delete" ON public.applications;

CREATE POLICY "applications_select" ON public.applications FOR SELECT USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL) OR 
  ((select auth.uid()::text) IN (SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text))
);
CREATE POLICY "applications_insert" ON public.applications FOR INSERT WITH CHECK (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "applications_update" ON public.applications FOR UPDATE USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL) OR 
  ((select auth.uid()::text) IN (SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text))
) WITH CHECK (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL) OR 
  ((select auth.uid()::text) IN (SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text))
);
CREATE POLICY "applications_delete" ON public.applications FOR DELETE USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);


-- 3. callback_requests
ALTER TABLE public.callback_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "callback_requests_select" ON public.callback_requests;
DROP POLICY IF EXISTS "callback_requests_insert" ON public.callback_requests;
DROP POLICY IF EXISTS "callback_requests_update" ON public.callback_requests;
DROP POLICY IF EXISTS "callback_requests_delete" ON public.callback_requests;

CREATE POLICY "callback_requests_select" ON public.callback_requests FOR SELECT USING (true);
CREATE POLICY "callback_requests_insert" ON public.callback_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "callback_requests_update" ON public.callback_requests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "callback_requests_delete" ON public.callback_requests FOR DELETE USING (true);


-- 4. candidates
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "candidates_select" ON public.candidates;
DROP POLICY IF EXISTS "candidates_insert" ON public.candidates;
DROP POLICY IF EXISTS "candidates_update" ON public.candidates;
DROP POLICY IF EXISTS "candidates_delete" ON public.candidates;

CREATE POLICY "candidates_select" ON public.candidates FOR SELECT USING (true);
CREATE POLICY "candidates_insert" ON public.candidates FOR INSERT WITH CHECK (
  ((select auth.uid()::text) = id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "candidates_update" ON public.candidates FOR UPDATE USING (
  ((select auth.uid()::text) = id::text) OR 
  ((select auth.uid()) IS NULL)
) WITH CHECK (
  ((select auth.uid()::text) = id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "candidates_delete" ON public.candidates FOR DELETE USING (
  ((select auth.uid()::text) = id::text) OR 
  ((select auth.uid()) IS NULL)
);


-- 5. conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete" ON public.conversations;

CREATE POLICY "conversations_select" ON public.conversations FOR SELECT USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT WITH CHECK (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "conversations_update" ON public.conversations FOR UPDATE USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
) WITH CHECK (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "conversations_delete" ON public.conversations FOR DELETE USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
);


-- 6. employers
ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employers_select" ON public.employers;
DROP POLICY IF EXISTS "employers_insert" ON public.employers;
DROP POLICY IF EXISTS "employers_update" ON public.employers;
DROP POLICY IF EXISTS "employers_delete" ON public.employers;

CREATE POLICY "employers_select" ON public.employers FOR SELECT USING (true);
CREATE POLICY "employers_insert" ON public.employers FOR INSERT WITH CHECK (
  ((select auth.uid()::text) = id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "employers_update" ON public.employers FOR UPDATE USING (
  ((select auth.uid()::text) = id::text) OR 
  ((select auth.uid()) IS NULL)
) WITH CHECK (
  ((select auth.uid()::text) = id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "employers_delete" ON public.employers FOR DELETE USING (
  ((select auth.uid()::text) = id::text) OR 
  ((select auth.uid()) IS NULL)
);


-- 7. executives
ALTER TABLE public.executives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "executives_select" ON public.executives;
DROP POLICY IF EXISTS "executives_insert" ON public.executives;
DROP POLICY IF EXISTS "executives_update" ON public.executives;
DROP POLICY IF EXISTS "executives_delete" ON public.executives;

CREATE POLICY "executives_select" ON public.executives FOR SELECT USING (true);
CREATE POLICY "executives_insert" ON public.executives FOR INSERT WITH CHECK (true);
CREATE POLICY "executives_update" ON public.executives FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "executives_delete" ON public.executives FOR DELETE USING (true);


-- 8. feed_likes
ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feed_likes_select" ON public.feed_likes;
DROP POLICY IF EXISTS "feed_likes_insert" ON public.feed_likes;
DROP POLICY IF EXISTS "feed_likes_update" ON public.feed_likes;
DROP POLICY IF EXISTS "feed_likes_delete" ON public.feed_likes;

CREATE POLICY "feed_likes_select" ON public.feed_likes FOR SELECT USING (
  ((select auth.uid()::text) = user_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "feed_likes_insert" ON public.feed_likes FOR INSERT WITH CHECK (
  ((select auth.uid()::text) = user_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "feed_likes_update" ON public.feed_likes FOR UPDATE USING (
  ((select auth.uid()::text) = user_id::text) OR 
  ((select auth.uid()) IS NULL)
) WITH CHECK (
  ((select auth.uid()::text) = user_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "feed_likes_delete" ON public.feed_likes FOR DELETE USING (
  ((select auth.uid()::text) = user_id::text) OR 
  ((select auth.uid()) IS NULL)
);


-- 9. feed_posts
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feed_posts_select" ON public.feed_posts;
DROP POLICY IF EXISTS "feed_posts_insert" ON public.feed_posts;
DROP POLICY IF EXISTS "feed_posts_update" ON public.feed_posts;
DROP POLICY IF EXISTS "feed_posts_delete" ON public.feed_posts;

CREATE POLICY "feed_posts_select" ON public.feed_posts FOR SELECT USING (true);
CREATE POLICY "feed_posts_insert" ON public.feed_posts FOR INSERT WITH CHECK (
  ((select auth.uid()::text) = author_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "feed_posts_update" ON public.feed_posts FOR UPDATE USING (
  ((select auth.uid()::text) = author_id::text) OR 
  ((select auth.uid()) IS NULL)
) WITH CHECK (
  ((select auth.uid()::text) = author_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "feed_posts_delete" ON public.feed_posts FOR DELETE USING (
  ((select auth.uid()::text) = author_id::text) OR 
  ((select auth.uid()) IS NULL)
);


-- 10. interview_reviews
ALTER TABLE public.interview_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "interview_reviews_select" ON public.interview_reviews;
DROP POLICY IF EXISTS "interview_reviews_insert" ON public.interview_reviews;
DROP POLICY IF EXISTS "interview_reviews_update" ON public.interview_reviews;
DROP POLICY IF EXISTS "interview_reviews_delete" ON public.interview_reviews;

CREATE POLICY "interview_reviews_select" ON public.interview_reviews FOR SELECT USING (true);
CREATE POLICY "interview_reviews_insert" ON public.interview_reviews FOR INSERT WITH CHECK (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "interview_reviews_update" ON public.interview_reviews FOR UPDATE USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
) WITH CHECK (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "interview_reviews_delete" ON public.interview_reviews FOR DELETE USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);


-- 11. job_views
ALTER TABLE public.job_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_views_select" ON public.job_views;
DROP POLICY IF EXISTS "job_views_insert" ON public.job_views;
DROP POLICY IF EXISTS "job_views_update" ON public.job_views;
DROP POLICY IF EXISTS "job_views_delete" ON public.job_views;

CREATE POLICY "job_views_select" ON public.job_views FOR SELECT USING (
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "job_views_insert" ON public.job_views FOR INSERT WITH CHECK (true);
CREATE POLICY "job_views_update" ON public.job_views FOR UPDATE USING (
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
) WITH CHECK (
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "job_views_delete" ON public.job_views FOR DELETE USING (
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
);


-- 12. jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jobs_select" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete" ON public.jobs;

CREATE POLICY "jobs_select" ON public.jobs FOR SELECT USING (true);
CREATE POLICY "jobs_insert" ON public.jobs FOR INSERT WITH CHECK (
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "jobs_update" ON public.jobs FOR UPDATE USING (
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
) WITH CHECK (
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "jobs_delete" ON public.jobs FOR DELETE USING (
  ((select auth.uid()::text) = employer_id::text) OR 
  ((select auth.uid()) IS NULL)
);


-- 13. messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;
DROP POLICY IF EXISTS "messages_delete" ON public.messages;

CREATE POLICY "messages_select" ON public.messages FOR SELECT USING (
  ((select auth.uid()) IS NULL) OR 
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id::text = conversation_id::text 
    AND (((select auth.uid()::text) = candidate_id::text) OR ((select auth.uid()::text) = employer_id::text))
  )
);
CREATE POLICY "messages_insert" ON public.messages FOR INSERT WITH CHECK (
  ((select auth.uid()) IS NULL) OR 
  (
    ((select auth.uid()::text) = sender_id::text) AND 
    EXISTS (
      SELECT 1 FROM public.conversations 
      WHERE id::text = conversation_id::text 
      AND (((select auth.uid()::text) = candidate_id::text) OR ((select auth.uid()::text) = employer_id::text))
    )
  )
);
CREATE POLICY "messages_update" ON public.messages FOR UPDATE USING (
  ((select auth.uid()) IS NULL) OR 
  (
    ((select auth.uid()::text) = sender_id::text) AND 
    EXISTS (
      SELECT 1 FROM public.conversations 
      WHERE id::text = conversation_id::text 
      AND (((select auth.uid()::text) = candidate_id::text) OR ((select auth.uid()::text) = employer_id::text))
    )
  )
) WITH CHECK (
  ((select auth.uid()) IS NULL) OR 
  (
    ((select auth.uid()::text) = sender_id::text) AND 
    EXISTS (
      SELECT 1 FROM public.conversations 
      WHERE id::text = conversation_id::text 
      AND (((select auth.uid()::text) = candidate_id::text) OR ((select auth.uid()::text) = employer_id::text))
    )
  )
);
CREATE POLICY "messages_delete" ON public.messages FOR DELETE USING (
  ((select auth.uid()) IS NULL) OR 
  (
    ((select auth.uid()::text) = sender_id::text) AND 
    EXISTS (
      SELECT 1 FROM public.conversations 
      WHERE id::text = conversation_id::text 
      AND (((select auth.uid()::text) = candidate_id::text) OR ((select auth.uid()::text) = employer_id::text))
    )
  )
);


-- 14. notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
) WITH CHECK (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);


-- 15. saved_jobs
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saved_jobs_select" ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_insert" ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_update" ON public.saved_jobs;
DROP POLICY IF EXISTS "saved_jobs_delete" ON public.saved_jobs;

CREATE POLICY "saved_jobs_select" ON public.saved_jobs FOR SELECT USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "saved_jobs_insert" ON public.saved_jobs FOR INSERT WITH CHECK (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "saved_jobs_update" ON public.saved_jobs FOR UPDATE USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
) WITH CHECK (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);
CREATE POLICY "saved_jobs_delete" ON public.saved_jobs FOR DELETE USING (
  ((select auth.uid()::text) = candidate_id::text) OR 
  ((select auth.uid()) IS NULL)
);

COMMIT;
