-- Migration: Add RLS policies for wallets table and create wallets_test table
-- Date: 2026-03-17
-- Context: The wallets table was created manually without RLS policies,
-- causing a 42501 (permission denied) error on insert. This migration
-- enables RLS and adds user-scoped policies matching the existing convention
-- used by accounts, billers, savings, transactions, etc.

-- ==================================================
-- STEP 1: Enable RLS on the wallets table
-- ==================================================

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

-- ==================================================
-- STEP 2: Add user-scoped RLS policy for wallets
-- ==================================================

DROP POLICY IF EXISTS "Users can manage their own wallets" ON wallets;

CREATE POLICY "Users can manage their own wallets"
ON wallets FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ==================================================
-- STEP 3: Create wallets_test table (test environment)
-- ==================================================

CREATE TABLE IF NOT EXISTS wallets_test (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  name text NOT NULL,
  amount numeric(14,2) NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts_test (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallets_test_user_id ON wallets_test(user_id);

ALTER TABLE wallets_test ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own wallets_test" ON wallets_test;

CREATE POLICY "Users can manage their own wallets_test"
ON wallets_test FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ==================================================
-- STEP 4: Add wallet_id column to transactions_test
-- ==================================================

ALTER TABLE transactions_test
ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES wallets_test (id);

-- ==================================================
-- NOTES
-- ==================================================
--
-- Run this migration in the Supabase SQL editor or via the CLI.
-- No data changes are required; this migration only adds security policies
-- and the test-environment mirror of the wallets table.
