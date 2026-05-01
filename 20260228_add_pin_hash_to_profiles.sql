-- Add pin_hash column to user_profiles table
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS pin_hash TEXT;

COMMENT ON COLUMN public.user_profiles.pin_hash IS 'Stores the SHA-256 hash of the user''s security PIN.';