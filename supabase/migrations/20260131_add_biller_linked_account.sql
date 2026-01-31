-- Migration: Add linked_account_id to billers table
-- Purpose: Allow billers to be linked to credit card accounts for automatic payment schedule sync
-- Date: 2026-01-31

-- Add linked_account_id column to billers table
ALTER TABLE billers 
ADD COLUMN IF NOT EXISTS linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Add comment to explain the column purpose
COMMENT ON COLUMN billers.linked_account_id IS 'Optional link to a credit card Account - enables automatic sync of credit card transaction totals to payment schedules';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_billers_linked_account ON billers(linked_account_id);
