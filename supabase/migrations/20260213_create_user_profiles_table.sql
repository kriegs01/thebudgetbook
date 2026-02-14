-- Migration: Create User Profiles Table
-- This migration creates a user_profiles table to store additional user information
-- Date: 2026-02-13

-- ==================================================
-- STEP 1: Create user_profiles table
-- ==================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================================================
-- STEP 2: Create index for performance
-- ==================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- ==================================================
-- STEP 3: Enable Row Level Security
-- ==================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- ==================================================
-- STEP 4: Create RLS policies
-- ==================================================

-- Policy: Users can view their own profile
CREATE POLICY "Users can view their own profile"
ON user_profiles FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
ON user_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON user_profiles FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ==================================================
-- STEP 5: Create function to auto-update updated_at
-- ==================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==================================================
-- STEP 6: Create trigger for updated_at
-- ==================================================

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;

CREATE TRIGGER update_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==================================================
-- NOTES
-- ==================================================
-- 
-- 1. This table stores first_name and last_name for each user
-- 2. user_id is unique and references auth.users
-- 3. RLS policies ensure users can only access their own profile
-- 4. The application will create a profile entry during signup
-- 5. updated_at is automatically updated on any profile changes
