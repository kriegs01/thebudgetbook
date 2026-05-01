-- Add settings JSONB column to user_profiles table if it doesn't exist
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;