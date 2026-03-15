-- Migration: Add 'credit_payment' to valid transaction types
-- This allows biller/budget payments linked to a credit account to record
-- a credit_payment transaction that reduces the outstanding balance and
-- restores available credit on the linked credit account.

-- Drop the existing constraint (it does not include 'credit_payment')
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS valid_transaction_type;

-- Re-add the constraint with 'credit_payment' included
ALTER TABLE transactions
ADD CONSTRAINT valid_transaction_type
CHECK (transaction_type IN ('payment', 'withdraw', 'transfer', 'loan', 'cash_in', 'loan_payment', 'credit_payment'));

-- Update the column comment to reflect the new type
COMMENT ON COLUMN transactions.transaction_type IS 'Type of transaction: payment (default), withdraw, transfer, loan, cash_in, loan_payment, credit_payment';
