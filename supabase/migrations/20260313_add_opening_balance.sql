-- Migration: Add opening_balance to accounts table
-- 
-- Root-cause fix for the double-counting bug:
-- The old `balance` column was used as both the "opening balance seed" AND was sometimes
-- corrupted by the edit form (which wrote the calculated running balance back as the seed).
-- When balance = corrupted running balance AND we recalculate `balance - sum(transactions)`,
-- the transactions are subtracted twice, doubling the result.
--
-- Solution: Add a dedicated `opening_balance` column that is the ONLY immutable seed.
-- Set it to 0 for all existing accounts (clean slate).  Users who started with a
-- non-zero opening balance that is NOT recorded as a transaction can re-enter it via
-- the Edit Account form.  For the majority of users whose all money is tracked as
-- transactions (e.g. salary as Cash In), 0 is the correct opening balance.
--
-- The `balance` column is preserved for backward compatibility but is no longer used
-- as a calculation seed by the app.

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0 NOT NULL;

-- Also add to test table if it exists
ALTER TABLE IF EXISTS accounts_test
ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0 NOT NULL;

COMMENT ON COLUMN accounts.opening_balance IS 'Immutable opening balance seed. Always 0 for accounts where all money is tracked as transactions. Set once at account creation; the app never overwrites it with calculated values.';

-- Existing accounts get opening_balance = 0 (DEFAULT 0 already handles new inserts).
-- No UPDATE needed because the column DEFAULT applies to all existing rows when added.
