-- Migration: Remove schedules column from billers table
-- This migration removes the embedded schedules JSONB array from billers
-- since payment_schedules table is now the single source of truth

-- WARNING: Run this migration ONLY after:
-- 1. payment_schedules table has been created
-- 2. Data has been migrated from billers.schedules to payment_schedules table
-- 3. All application code has been updated to use payment_schedules table

-- Remove the schedules column
ALTER TABLE billers DROP COLUMN IF EXISTS schedules;

-- Add a comment explaining the change
COMMENT ON TABLE billers IS 'Billers table - payment schedules are now stored in the payment_schedules table';
