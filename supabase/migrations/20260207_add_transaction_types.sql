-- Migration: Add transaction_type and notes to transactions table
-- This enables different types of manual transactions for account management

-- Add transaction_type column
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS transaction_type TEXT DEFAULT 'payment';

-- Add notes column for additional context
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add related_transaction_id for linking transfer transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS related_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- Add constraint to ensure valid transaction types
ALTER TABLE transactions
ADD CONSTRAINT valid_transaction_type 
CHECK (transaction_type IN ('payment', 'withdraw', 'transfer', 'loan', 'cash_in', 'loan_payment'));

-- Create index for faster queries by transaction type
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);

-- Create index for related transactions (transfers and loan payments)
CREATE INDEX IF NOT EXISTS idx_transactions_related ON transactions(related_transaction_id);

COMMENT ON COLUMN transactions.transaction_type IS 'Type of transaction: payment (default), withdraw, transfer, loan, cash_in, loan_payment';
COMMENT ON COLUMN transactions.notes IS 'Additional notes or context for the transaction';
COMMENT ON COLUMN transactions.related_transaction_id IS 'Links related transactions (e.g., transfer pairs, loan and its payments)';
