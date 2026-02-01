-- Migration: Add payment_schedule_id to transactions table
-- This links transactions to their specific payment schedules
-- Ensures payments are tracked and prevents duplicates

-- Add payment_schedule_id column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS payment_schedule_id UUID REFERENCES payment_schedules(id) ON DELETE SET NULL;

-- Create unique index to prevent duplicate payments for the same schedule
-- This is the key constraint that prevents double payments
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_payment_schedule 
ON transactions(payment_schedule_id) 
WHERE payment_schedule_id IS NOT NULL;

-- Create index for faster queries by payment schedule
CREATE INDEX IF NOT EXISTS idx_transactions_payment_schedule_id 
ON transactions(payment_schedule_id);

-- Add comment to document the column
COMMENT ON COLUMN transactions.payment_schedule_id IS 'Links transaction to a specific payment schedule, preventing duplicate payments';
