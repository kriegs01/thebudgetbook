-- Migration: Add status and deactivation_date to accounts tables
-- This enables soft deactivation of accounts instead of permanent deletion
--
-- Uses a multi-step approach for compatibility with all PostgreSQL/Supabase versions:
--   1. Add column as nullable (no NOT NULL yet) so existing rows aren't rejected
--   2. Backfill any NULL values to 'active'
--   3. Apply NOT NULL constraint
--   4. Add CHECK constraint separately
--
-- This prevents the "accounts appear deactivated" issue that can occur when
-- an inline NOT NULL DEFAULT ... CHECK statement is applied in certain
-- PostgreSQL/Supabase configurations.

-- ───────────────── accounts (production) ─────────────────

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deactivation_date JSONB;

-- Ensure every existing row has a valid status value
UPDATE accounts SET status = 'active' WHERE status IS NULL OR status NOT IN ('active', 'inactive');

-- Now enforce NOT NULL (all rows already have a value)
ALTER TABLE accounts ALTER COLUMN status SET NOT NULL;

-- Add CHECK constraint (drop first if it already exists to allow re-running)
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_status_check CHECK (status IN ('active', 'inactive'));

-- ───────────────── accounts_test (test environment) ──────

ALTER TABLE accounts_test ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE accounts_test ADD COLUMN IF NOT EXISTS deactivation_date JSONB;

UPDATE accounts_test SET status = 'active' WHERE status IS NULL OR status NOT IN ('active', 'inactive');

ALTER TABLE accounts_test ALTER COLUMN status SET NOT NULL;

ALTER TABLE accounts_test DROP CONSTRAINT IF EXISTS accounts_test_status_check;
ALTER TABLE accounts_test ADD CONSTRAINT accounts_test_status_check CHECK (status IN ('active', 'inactive'));
