-- Migration: Add pin_protected_features to user_profiles table
-- 
-- Stores the array of feature IDs that the user has protected with their PIN.
-- This allows the protected features configuration to sync across devices.

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS pin_protected_features JSONB DEFAULT '["danger_zone", "test_environment"]'::jsonb;