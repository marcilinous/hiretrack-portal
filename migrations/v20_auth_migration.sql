-- v20: Standard Supabase Auth & RLS Migration
-- Run in Supabase SQL Editor as superuser / table owner.
-- Idempotent: safe to run.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function to perform type-safe column updates dynamically at runtime
CREATE OR REPLACE FUNCTION public.migrate_column_uuid(
    p_table_name text,
    p_column_name text,
    p_old_id text,
    p_new_uid uuid,
    p_extra_where text DEFAULT ''
) RETURNS void AS $$
DECLARE
    v_data_type text;
    v_sql text;
BEGIN
    SELECT data_type INTO v_data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name;
      
    IF v_data_type IS NULL THEN
        RETURN;
    END IF;
    
    IF v_data_type = 'uuid' THEN
        BEGIN
            v_sql := format(
                'UPDATE public.%I SET %I = %L WHERE %I = %L %s',
                p_table_name, p_column_name, p_new_uid, p_column_name, p_old_id::uuid, COALESCE(p_extra_where, '')
            );
            EXECUTE v_sql;
        EXCEPTION WHEN others THEN
            -- Ignore if old ID is not in valid UUID format for this column
        END;
    ELSE
        v_sql := format(
            'UPDATE public.%I SET %I = %L WHERE %I = %L %s',
            p_table_name, p_column_name, p_new_uid::text, p_column_name, p_old_id, COALESCE(p_extra_where, '')
        );
        EXECUTE v_sql;
    END IF;
END;
$$ LANGUAGE plpgsql;

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
    v_instance_id UUID;
BEGIN
    -- Dynamically fetch instance_id from Supabase instances
    SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
    IF v_instance_id IS NULL THEN
        v_instance_id := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;

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
                raw_app_meta_data, is_super_admin, last_sign_in_at,
                confirmation_token, email_change, email_change_token_new, recovery_token
            ) VALUES (
                new_uid,
                v_instance_id,
                r.email,
                crypt(r.password, gen_salt('bf', 10)),
                now(),
                'authenticated',
                'authenticated',
                jsonb_build_object('role', 'candidate', 'name', r.name, 'mobile', r.mobile, 'city', r.city),
                COALESCE(r.created_at, now()),
                now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                false,
                now(),
                '', '', '', ''
            );
        ELSE
            new_uid := existing_uid;
        END IF;
        
        -- Migrate columns using our helper function
        PERFORM public.migrate_column_uuid('applications', 'candidate_id', r.id::text, new_uid);
        PERFORM public.migrate_column_uuid('conversations', 'candidate_id', r.id::text, new_uid);
        PERFORM public.migrate_column_uuid('messages', 'sender_id', r.id::text, new_uid, 'AND sender_type = ''candidate''');
        PERFORM public.migrate_column_uuid('feed_likes', 'user_id', r.id::text, new_uid);
        PERFORM public.migrate_column_uuid('feed_posts', 'author_id', r.id::text, new_uid, 'AND author_type = ''candidate''');
        PERFORM public.migrate_column_uuid('interview_reviews', 'candidate_id', r.id::text, new_uid);
        PERFORM public.migrate_column_uuid('notifications', 'candidate_id', r.id::text, new_uid);
        
        -- Swap the candidate record's ID
        PERFORM public.migrate_column_uuid('candidates', 'id', r.id::text, new_uid);
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
    v_instance_id UUID;
BEGIN
    -- Dynamically fetch instance_id from Supabase instances
    SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
    IF v_instance_id IS NULL THEN
        v_instance_id := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;

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
                raw_app_meta_data, is_super_admin, last_sign_in_at,
                confirmation_token, email_change, email_change_token_new, recovery_token
            ) VALUES (
                new_uid,
                v_instance_id,
                r.email,
                crypt(r.password, gen_salt('bf', 10)),
                now(),
                'authenticated',
                'authenticated',
                jsonb_build_object('role', 'employer', 'company', r.company, 'contact_name', r.contact_name),
                COALESCE(r.created_at, now()),
                now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                false,
                now(),
                '', '', '', ''
            );
        ELSE
            new_uid := existing_uid;
        END IF;
        
        -- Migrate columns using our helper function
        PERFORM public.migrate_column_uuid('jobs', 'employer_id', r.id::text, new_uid);
        PERFORM public.migrate_column_uuid('conversations', 'employer_id', r.id::text, new_uid);
        PERFORM public.migrate_column_uuid('messages', 'sender_id', r.id::text, new_uid, 'AND sender_type = ''employer''');
        PERFORM public.migrate_column_uuid('feed_posts', 'author_id', r.id::text, new_uid, 'AND author_type = ''company''');
        PERFORM public.migrate_column_uuid('job_views', 'employer_id', r.id::text, new_uid);
        PERFORM public.migrate_column_uuid('interview_reviews', 'employer_id', r.id::text, new_uid);
        
        -- Swap the employer record's ID
        PERFORM public.migrate_column_uuid('employers', 'id', r.id::text, new_uid);
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
CREATE POLICY "cand_insert" ON public.candidates FOR INSERT WITH CHECK (auth.uid()::text = id::text);
-- Only the owner candidate can update their profile
CREATE POLICY "cand_update" ON public.candidates FOR UPDATE USING (auth.uid()::text = id::text) WITH CHECK (auth.uid()::text = id::text);


-- ── employers ──
DROP POLICY IF EXISTS "emp_select" ON public.employers;
DROP POLICY IF EXISTS "emp_insert" ON public.employers;
DROP POLICY IF EXISTS "emp_update" ON public.employers;

CREATE POLICY "emp_select" ON public.employers FOR SELECT USING (true);
CREATE POLICY "emp_insert" ON public.employers FOR INSERT WITH CHECK (auth.uid()::text = id::text);
CREATE POLICY "emp_update" ON public.employers FOR UPDATE USING (auth.uid()::text = id::text) WITH CHECK (auth.uid()::text = id::text);


-- ── jobs ──
DROP POLICY IF EXISTS "jobs_select" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete" ON public.jobs;

-- Public can select jobs
CREATE POLICY "jobs_select" ON public.jobs FOR SELECT USING (true);
-- Only authenticated employers can post jobs under their own id
CREATE POLICY "jobs_insert" ON public.jobs FOR INSERT WITH CHECK (auth.uid()::text = employer_id::text);
-- Only the owning employer can update/delete their jobs
CREATE POLICY "jobs_update" ON public.jobs FOR UPDATE USING (auth.uid()::text = employer_id::text) WITH CHECK (auth.uid()::text = employer_id::text);
CREATE POLICY "jobs_delete" ON public.jobs FOR DELETE USING (auth.uid()::text = employer_id::text);


-- ── applications ──
DROP POLICY IF EXISTS "apps_select" ON public.applications;
DROP POLICY IF EXISTS "apps_insert" ON public.applications;
DROP POLICY IF EXISTS "apps_update" ON public.applications;

-- Candidates can view their own applications, employers can view applications for their posted jobs
CREATE POLICY "apps_select" ON public.applications FOR SELECT USING (
  auth.uid()::text = candidate_id::text 
  OR auth.uid()::text IN (SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text)
);
-- Candidates can insert their own applications
CREATE POLICY "apps_insert" ON public.applications FOR INSERT WITH CHECK (auth.uid()::text = candidate_id::text);
-- Candidates/Employers can update status (employers change state, candidate cancel app)
CREATE POLICY "apps_update" ON public.applications FOR UPDATE USING (
  auth.uid()::text = candidate_id::text 
  OR auth.uid()::text IN (SELECT employer_id::text FROM public.jobs WHERE id::text = job_id::text)
);


-- ── conversations ──
DROP POLICY IF EXISTS "conv_select" ON public.conversations;
DROP POLICY IF EXISTS "conv_insert" ON public.conversations;
DROP POLICY IF EXISTS "conv_update" ON public.conversations;

CREATE POLICY "conv_select" ON public.conversations FOR SELECT USING (
  auth.uid()::text = candidate_id::text OR auth.uid()::text = employer_id::text
);
CREATE POLICY "conv_insert" ON public.conversations FOR INSERT WITH CHECK (
  auth.uid()::text = candidate_id::text OR auth.uid()::text = employer_id::text
);
CREATE POLICY "conv_update" ON public.conversations FOR UPDATE USING (
  auth.uid()::text = candidate_id::text OR auth.uid()::text = employer_id::text
);


-- ── messages ──
DROP POLICY IF EXISTS "msg_select" ON public.messages;
DROP POLICY IF EXISTS "msg_insert" ON public.messages;

CREATE POLICY "msg_select" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id::text = conversation_id::text 
    AND (auth.uid()::text = candidate_id::text OR auth.uid()::text = employer_id::text)
  )
);
CREATE POLICY "msg_insert" ON public.messages FOR INSERT WITH CHECK (
  auth.uid()::text = sender_id::text 
  AND EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id::text = conversation_id::text 
    AND (auth.uid()::text = candidate_id::text OR auth.uid()::text = employer_id::text)
  )
);

-- Clean up any orphaned references in child tables before restoring FK constraints to ensure it succeeds
DELETE FROM public.applications WHERE candidate_id NOT IN (SELECT id FROM public.candidates);
DELETE FROM public.jobs WHERE employer_id NOT IN (SELECT id FROM public.employers);
DELETE FROM public.notifications WHERE candidate_id::text NOT IN (SELECT id::text FROM public.candidates);
DELETE FROM public.interview_reviews WHERE candidate_id::text NOT IN (SELECT id::text FROM public.candidates) OR employer_id::text NOT IN (SELECT id::text FROM public.employers);

-- Recreate foreign key constraints dynamically
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT * FROM temp_fk_constraints LOOP
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.table_name, r.constraint_name, r.constraint_def);
    END LOOP;
END $$;

-- Fix any previously migrated users who have NULL values in token columns (due to earlier script executions)
UPDATE auth.users 
SET 
    confirmation_token = COALESCE(confirmation_token, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    recovery_token = COALESCE(recovery_token, '');

-- Drop the temporary migration helper function
DROP FUNCTION IF EXISTS public.migrate_column_uuid(text, text, text, uuid, text);

COMMIT;
