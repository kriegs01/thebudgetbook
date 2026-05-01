-- Add borrower_name column to production transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS borrower_name TEXT;

-- Add borrower_name column to test environment transactions table
ALTER TABLE transactions_test ADD COLUMN IF NOT EXISTS borrower_name TEXT;