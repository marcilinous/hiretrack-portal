-- v22: Fix password column NOT NULL constraints for Supabase Auth migration compatibility.
-- Dropping NOT NULL on password columns is required because new users register via Supabase Auth
-- and their plaintext passwords are not stored in the public profiles tables anymore.
-- Run in Supabase SQL Editor.

BEGIN;

-- 1. Drop NOT NULL constraint on candidates.password
ALTER TABLE public.candidates ALTER COLUMN password DROP NOT NULL;

-- 2. Drop NOT NULL constraint on employers.password
ALTER TABLE public.employers ALTER COLUMN password DROP NOT NULL;

COMMIT;
