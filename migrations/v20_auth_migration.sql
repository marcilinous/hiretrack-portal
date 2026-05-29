-- v20: Standard Supabase Auth & RLS Migration
-- Run in Supabase SQL Editor as superuser / table owner.
-- Idempotent: safe to run.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Capture all foreign key constraints referencing candidates and employers
CREATE TEMP TABLE temp_fk_constraints AS
SELECT 
    conrelid::regclass::text AS table_name,
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE contype = 'f' 
  AND confrelid::regclass::text IN ('public.candidates', 'public.employers', 'candidates', 'employers');

-- Drop foreign key constraints dynamically to avoid violation during key updates
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT * FROM temp_fk_constraints LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.table_name, r.constraint_name);
    END LOOP;
END $$;

-- 1. Migrate Existing Candidates to auth.users
DO $$
DECLARE
    r RECORD;
    new_uid UUID;
    existing_uid UUID;
BEGIN
    -- Disable user triggers (system triggers like FK constraints are already dropped temporarily)
    ALTER TABLE IF EXISTS public.applications DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.conversations DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.messages DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.feed_posts DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.feed_likes DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.interview_reviews DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.candidates DISABLE TRIGGER USER;

    FOR r IN SELECT * FROM public.candidates WHERE email IS NOT NULL AND password IS NOT NULL AND id NOT IN (SELECT id FROM auth.users) LOOP
        -- Check if user already exists in auth.users by email
        SELECT id INTO existing_uid FROM auth.users WHERE email = r.email;
        
        IF existing_uid IS NULL THEN
            new_uid := gen_random_uuid();
            
            -- Insert into auth.users with encrypted password (bcrypt)
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at,
                role, aud, raw_user_meta_data, created_at, updated_at,
                raw_app_meta_data, is_super_admin, phone, phone_confirmed_at,
                last_sign_in_at
            ) VALUES (
                new_uid,
                '00000000-0000-0000-0000-000000000000',
                r.email,
                crypt(r.password, gen_salt('bf', 10)),
                now(),
                'authenticated',
                'authenticated',
                jsonb_build_object('role', 'candidate', 'name', r.name, 'mobile', r.mobile, 'city', r.city),
                COALESCE(r.created_at, now()),
                now(),
                '{"provider":"email","providers":["email"]}',
                false,
                r.mobile,
                now(),
                now()
            );
        ELSE
            new_uid := existing_uid;
        END IF;
        
        UPDATE public.applications SET candidate_id = new_uid WHERE candidate_id = r.id;
        UPDATE public.conversations SET candidate_id = new_uid WHERE candidate_id::text = r.id::text;
        UPDATE public.messages SET sender_id = new_uid::text WHERE sender_id::text = r.id::text AND sender_type = 'candidate';
        UPDATE public.feed_likes SET user_id = new_uid WHERE user_id = r.id;
        UPDATE public.feed_posts SET author_id = new_uid WHERE author_id::text = r.id::text AND author_type = 'candidate';
        UPDATE public.interview_reviews SET candidate_id = new_uid WHERE candidate_id = r.id;
        
        -- Swap the candidate record's ID
        UPDATE public.candidates SET id = new_uid WHERE id = r.id;
    END LOOP;

    -- Re-enable user triggers
    ALTER TABLE IF EXISTS public.applications ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.conversations ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.messages ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.feed_posts ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.feed_likes ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.interview_reviews ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.candidates ENABLE TRIGGER USER;
END $$;

-- 2. Migrate Existing Employers to auth.users
DO $$
DECLARE
    r RECORD;
    new_uid UUID;
    existing_uid UUID;
BEGIN
    ALTER TABLE IF EXISTS public.jobs DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.conversations DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.messages DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.feed_posts DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.job_views DISABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.employers DISABLE TRIGGER USER;

    FOR r IN SELECT * FROM public.employers WHERE email IS NOT NULL AND password IS NOT NULL AND id NOT IN (SELECT id FROM auth.users) LOOP
        -- Check if user already exists in auth.users by email
        SELECT id INTO existing_uid FROM auth.users WHERE email = r.email;

        IF existing_uid IS NULL THEN
            new_uid := gen_random_uuid();
            
            INSERT INTO auth.users (
                id, instance_id, email, encrypted_password, email_confirmed_at,
                role, aud, raw_user_meta_data, created_at, updated_at,
                raw_app_meta_data, is_super_admin, phone, phone_confirmed_at,
                last_sign_in_at
            ) VALUES (
                new_uid,
                '00000000-0000-0000-0000-000000000000',
                r.email,
                crypt(r.password, gen_salt('bf', 10)),
                now(),
                'authenticated',
                'authenticated',
                jsonb_build_object('role', 'employer', 'company', r.company, 'contact_name', r.contact_name),
                COALESCE(r.created_at, now()),
                now(),
                '{"provider":"email","providers":["email"]}',
                false,
                r.mobile,
                now(),
                now()
            );
        ELSE
            new_uid := existing_uid;
        END IF;
        
        UPDATE public.jobs SET employer_id = new_uid WHERE employer_id = r.id;
        UPDATE public.conversations SET employer_id = new_uid WHERE employer_id::text = r.id::text;
        UPDATE public.messages SET sender_id = new_uid::text WHERE sender_id::text = r.id::text AND sender_type = 'employer';
        UPDATE public.feed_posts SET author_id = new_uid WHERE author_id::text = r.id::text AND author_type = 'company';
        UPDATE public.job_views SET employer_id = new_uid WHERE employer_id = r.id;
        
        UPDATE public.employers SET id = new_uid WHERE id = r.id;
    END LOOP;

    ALTER TABLE IF EXISTS public.jobs ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.conversations ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.messages ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.feed_posts ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.job_views ENABLE TRIGGER USER;
    ALTER TABLE IF EXISTS public.employers ENABLE TRIGGER USER;
END $$;


-- 3. Create Trigger Function for Profile Synchronization on New Signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF (new.raw_user_meta_data->>'role' = 'candidate') THEN
    INSERT INTO public.candidates (
      id, name, email, mobile, city, experience, jobtitle, skills,
      resume_url, resume_name, about, current_company, preferred_job_type,
      expected_salary, notice_period, created_at
    ) VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'name', 'New Candidate'),
      new.email,
      COALESCE(new.raw_user_meta_data->>'mobile', ''),
      COALESCE(new.raw_user_meta_data->>'city', ''),
      COALESCE(new.raw_user_meta_data->>'experience', ''),
      COALESCE(new.raw_user_meta_data->>'jobtitle', ''),
      COALESCE((new.raw_user_meta_data->'skills')::jsonb, '[]'::jsonb),
      COALESCE(new.raw_user_meta_data->>'resume_url', ''),
      COALESCE(new.raw_user_meta_data->>'resume_name', ''),
      COALESCE(new.raw_user_meta_data->>'about', ''),
      COALESCE(new.raw_user_meta_data->>'current_company', ''),
      COALESCE(new.raw_user_meta_data->>'preferred_job_type', ''),
      COALESCE(new.raw_user_meta_data->>'expected_salary', ''),
      COALESCE(new.raw_user_meta_data->>'notice_period', ''),
      now()
    ) ON CONFLICT (id) DO NOTHING;
  ELSIF (new.raw_user_meta_data->>'role' = 'employer') THEN
    INSERT INTO public.employers (
      id, company, contact_name, email, mobile, city, industry, plan, job_limit, day_limit, created_at
    ) VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'company', 'New Company'),
      COALESCE(new.raw_user_meta_data->>'contact_name', 'Employer'),
      new.email,
      COALESCE(new.raw_user_meta_data->>'mobile', ''),
      COALESCE(new.raw_user_meta_data->>'city', ''),
      COALESCE(new.raw_user_meta_data->>'industry', 'Other'),
      'free',
      1,
      15,
      now()
    ) ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove duplicate triggers if re-running
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 4. Enable Row Level Security (RLS) on Core Tables
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;


-- 5. Establish RLS Policies

-- ── candidates ──
DROP POLICY IF EXISTS "cand_select" ON public.candidates;
DROP POLICY IF EXISTS "cand_insert" ON public.candidates;
DROP POLICY IF EXISTS "cand_update" ON public.candidates;

-- Candidates can be viewed by anyone (recruiters search them)
CREATE POLICY "cand_select" ON public.candidates FOR SELECT USING (true);
-- Profile creation is handled by database trigger (definer), but keep policy for safety
CREATE POLICY "cand_insert" ON public.candidates FOR INSERT WITH CHECK (auth.uid() = id);
-- Only the owner candidate can update their profile
CREATE POLICY "cand_update" ON public.candidates FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- ── employers ──
DROP POLICY IF EXISTS "emp_select" ON public.employers;
DROP POLICY IF EXISTS "emp_insert" ON public.employers;
DROP POLICY IF EXISTS "emp_update" ON public.employers;

CREATE POLICY "emp_select" ON public.employers FOR SELECT USING (true);
CREATE POLICY "emp_insert" ON public.employers FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "emp_update" ON public.employers FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- ── jobs ──
DROP POLICY IF EXISTS "jobs_select" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete" ON public.jobs;

-- Public can select jobs
CREATE POLICY "jobs_select" ON public.jobs FOR SELECT USING (true);
-- Only authenticated employers can post jobs under their own id
CREATE POLICY "jobs_insert" ON public.jobs FOR INSERT WITH CHECK (auth.uid() = employer_id);
-- Only the owning employer can update/delete their jobs
CREATE POLICY "jobs_update" ON public.jobs FOR UPDATE USING (auth.uid() = employer_id) WITH CHECK (auth.uid() = employer_id);
CREATE POLICY "jobs_delete" ON public.jobs FOR DELETE USING (auth.uid() = employer_id);


-- ── applications ──
DROP POLICY IF EXISTS "apps_select" ON public.applications;
DROP POLICY IF EXISTS "apps_insert" ON public.applications;
DROP POLICY IF EXISTS "apps_update" ON public.applications;

-- Candidates can view their own applications, employers can view applications for their posted jobs
CREATE POLICY "apps_select" ON public.applications FOR SELECT USING (
  auth.uid() = candidate_id 
  OR auth.uid() IN (SELECT employer_id FROM public.jobs WHERE id::text = job_id)
);
-- Candidates can insert their own applications
CREATE POLICY "apps_insert" ON public.applications FOR INSERT WITH CHECK (auth.uid() = candidate_id);
-- Candidates/Employers can update status (employers change state, candidate cancel app)
CREATE POLICY "apps_update" ON public.applications FOR UPDATE USING (
  auth.uid() = candidate_id 
  OR auth.uid() IN (SELECT employer_id FROM public.jobs WHERE id::text = job_id)
);


-- ── conversations ──
DROP POLICY IF EXISTS "conv_select" ON public.conversations;
DROP POLICY IF EXISTS "conv_insert" ON public.conversations;
DROP POLICY IF EXISTS "conv_update" ON public.conversations;

CREATE POLICY "conv_select" ON public.conversations FOR SELECT USING (
  auth.uid()::text = candidate_id OR auth.uid()::text = employer_id
);
CREATE POLICY "conv_insert" ON public.conversations FOR INSERT WITH CHECK (
  auth.uid()::text = candidate_id OR auth.uid()::text = employer_id
);
CREATE POLICY "conv_update" ON public.conversations FOR UPDATE USING (
  auth.uid()::text = candidate_id OR auth.uid()::text = employer_id
);


-- ── messages ──
DROP POLICY IF EXISTS "msg_select" ON public.messages;
DROP POLICY IF EXISTS "msg_insert" ON public.messages;

CREATE POLICY "msg_select" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = conversation_id 
    AND (auth.uid()::text = candidate_id OR auth.uid()::text = employer_id)
  )
);
CREATE POLICY "msg_insert" ON public.messages FOR INSERT WITH CHECK (
  auth.uid()::text = sender_id 
  AND EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = conversation_id 
    AND (auth.uid()::text = candidate_id OR auth.uid()::text = employer_id)
  )
);

-- Recreate foreign key constraints dynamically
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT * FROM temp_fk_constraints LOOP
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.table_name, r.constraint_name, r.constraint_def);
    END LOOP;
END $$;

COMMIT;
