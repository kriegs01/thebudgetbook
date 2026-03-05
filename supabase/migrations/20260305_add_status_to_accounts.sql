-- Migration: Add status and deactivation_date to accounts tables
-- This enables soft deactivation of accounts instead of permanent deletion

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deactivation_date JSONB;

-- Also update the test table so the test environment stays in sync
ALTER TABLE accounts_test ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
ALTER TABLE accounts_test ADD COLUMN IF NOT EXISTS deactivation_date JSONB;
