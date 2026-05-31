-- Migration: Fix User Relations and Backfill Profiles
-- This script performs two critical fixes:
-- 1. Corrects the foreign key on the 'friendships' table to point to 'public.user_profiles'.
-- 2. Backfills missing 'user_profiles' for any existing users in 'auth.users'.

-- =============================================================================
-- STEP 1: Correct the 'friendships' table foreign key constraints.
-- This makes the friendships table consistent with the desired architecture.
-- =============================================================================

-- Drop the potentially incorrect foreign key constraints if they exist
ALTER TABLE public.friendships DROP CONSTRAINT IF EXISTS friendships_user_id_fkey;
ALTER TABLE public.friendships DROP CONSTRAINT IF EXISTS friendships_friend_id_fkey;

-- Add the CORRECT foreign key constraints pointing to public.user_profiles
ALTER TABLE public.friendships ADD CONSTRAINT friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.friendships ADD CONSTRAINT friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;


-- =============================================================================
-- STEP 2: Safe, One-Time Backfill for Missing User Profiles
-- This creates profiles for users who signed up before the auto-creation
-- trigger was in place. It is safe to run multiple times.
-- =============================================================================

INSERT INTO public.user_profiles (id, first_name, last_name)
SELECT
    u.id,
    u.raw_user_meta_data ->> 'first_name',
    u.raw_user_meta_data ->> 'last_name'
FROM
    auth.users u
WHERE
    -- This ensures we only insert for users who are missing a profile.
    u.id NOT IN (SELECT id FROM public.user_profiles);
