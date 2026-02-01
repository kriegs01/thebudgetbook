-- Migration: Add payment_schedule_id to transactions table
-- This links transactions to specific payment schedules for duplicate prevention
-- Run this in your Supabase SQL Editor

-- Add payment_schedule_id column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS payment_schedule_id UUID REFERENCES payment_schedules(id) ON DELETE SET NULL;

-- Add comment to document the column
COMMENT ON COLUMN transactions.payment_schedule_id IS 'Foreign key to payment_schedules table. Links transaction to specific biller/installment payment schedule.';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transactions_payment_schedule_id 
ON transactions(payment_schedule_id);

-- Create unique constraint to prevent duplicate payments for the same schedule
-- This is the key constraint that prevents duplicate payments
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_payment_schedule 
ON transactions(payment_schedule_id) WHERE payment_schedule_id IS NOT NULL;

-- Note: The unique index uses a partial index (WHERE payment_schedule_id IS NOT NULL)
-- to allow multiple transactions without a payment_schedule_id (for backward compatibility
-- and for transactions not related to billers/installments)
