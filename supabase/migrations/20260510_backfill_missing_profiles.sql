-- =============================================================================
-- Safe, One-Time Backfill for Missing User Profiles
-- This script is now CORRECTED to match the final table schema.
-- It creates profiles for users who signed up before the auto-creation
-- trigger was in place. It is safe to run multiple times.
-- =============================================================================

-- Insert a profile for any user in auth.users that does not have one yet.
-- This script matches the schema where `user_profiles.id` is the primary key
-- and a direct foreign key to `auth.users.id`.
INSERT INTO public.user_profiles (id, first_name, last_name)
SELECT
    u.id, -- Use the user's auth ID as the primary key
    u.raw_user_meta_data ->> 'first_name',
    u.raw_user_meta_data ->> 'last_name'
FROM
    auth.users u
WHERE
    -- This ensures we only insert for users who are missing a profile.
    -- It makes the script safe to run even if some users already have profiles.
    u.id NOT IN (SELECT id FROM public.user_profiles);
