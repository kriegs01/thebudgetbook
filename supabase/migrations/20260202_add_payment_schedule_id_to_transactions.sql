-- Add payment_schedule_id to transactions table for direct linkage
-- This enables accurate paid status tracking without fuzzy matching

-- Add the payment_schedule_id column (nullable for backward compatibility with existing transactions)
ALTER TABLE transactions
ADD COLUMN payment_schedule_id UUID REFERENCES payment_schedules(id) ON DELETE SET NULL;

-- Add index for better query performance when looking up transactions by schedule
CREATE INDEX idx_transactions_payment_schedule_id 
ON transactions(payment_schedule_id);

-- Add comment explaining the purpose
COMMENT ON COLUMN transactions.payment_schedule_id IS 'Links transaction to the payment schedule it settles. Required for accurate paid status tracking.';

-- Note: Existing transactions will have NULL payment_schedule_id
-- A separate migration script can backfill these based on fuzzy matching if needed
