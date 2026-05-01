-- Add pin_settings column to user_profiles table to persist security preferences
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS pin_settings JSONB DEFAULT '{}'::jsonb;