-- Add role column to user_profiles table (defaulting everyone to 'user')
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Add constraint to ensure only valid roles are used
ALTER TABLE user_profiles 
ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('user', 'admin'));