-- Migration: Add payment_schedule_id to transactions table
-- This links transactions to monthly payment schedules for installments and billers
-- Run this in your Supabase SQL Editor

-- Add payment_schedule_id column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS payment_schedule_id UUID REFERENCES monthly_payment_schedules(id) ON DELETE SET NULL;

-- Add index for faster lookups by payment schedule
CREATE INDEX IF NOT EXISTS idx_transactions_payment_schedule 
ON transactions(payment_schedule_id);

-- Add comment to document the column
COMMENT ON COLUMN transactions.payment_schedule_id IS 'Links transaction to a monthly payment schedule. When transaction is deleted, the payment schedule status should be reverted.';

-- Note: This column is nullable to maintain backward compatibility with existing transactions
-- New installment and biller payments should link to their payment schedules
