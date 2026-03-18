-- Migration: Add wallet_id column to the main transactions table
-- Date: 2026-03-17
-- Context: The previous wallets migration (20260317_add_wallets_rls.sql) only added
-- wallet_id to transactions_test. The main transactions table also needs this column
-- so that stash top-up transactions can be linked to a wallet in production.

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES wallets (id);
