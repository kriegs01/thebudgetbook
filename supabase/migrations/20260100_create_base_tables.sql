-- Initial Schema Migration: Create Base Tables
-- This migration creates the core tables required by the Budget Book application.
-- Run this FIRST before any other migrations.
--
-- Tables created:
-- - accounts: Bank accounts (checking, savings, credit cards, loans)
-- - billers: Recurring bills and payments
-- - installments: Payment plans and installments
-- - savings: Savings jars/goals
-- - transactions: Financial transactions
--
-- Last updated: February 1, 2026

-- ============================================================================
-- ACCOUNTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank TEXT NOT NULL,
  classification TEXT NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  credit_limit NUMERIC,
  billing_date DATE,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE accounts IS 'Bank accounts including checking, savings, credit cards, and loans';
COMMENT ON COLUMN accounts.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN accounts.bank IS 'Bank or financial institution name';
COMMENT ON COLUMN accounts.classification IS 'Account type: Checking, Savings, Credit Card, Loan, Investment';
COMMENT ON COLUMN accounts.balance IS 'Current account balance';
COMMENT ON COLUMN accounts.type IS 'Debit or Credit';
COMMENT ON COLUMN accounts.credit_limit IS 'Credit limit for credit accounts (nullable)';
COMMENT ON COLUMN accounts.billing_date IS 'Billing date for credit accounts (nullable)';
COMMENT ON COLUMN accounts.due_date IS 'Payment due date for credit accounts (nullable)';

-- Create index
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_classification ON accounts(classification);

-- ============================================================================
-- BILLERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS billers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  due_date TEXT NOT NULL,
  expected_amount NUMERIC NOT NULL,
  timing TEXT NOT NULL,
  activation_date JSONB NOT NULL,
  deactivation_c JSONB,
  status TEXT NOT NULL,
  schedules JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Add comments
COMMENT ON TABLE billers IS 'Recurring bills and payment obligations';
COMMENT ON COLUMN billers.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN billers.name IS 'Biller name';
COMMENT ON COLUMN billers.category IS 'Category (e.g., Utilities, Subscriptions, Loans, Insurance)';
COMMENT ON COLUMN billers.due_date IS 'Day of month when payment is due';
COMMENT ON COLUMN billers.expected_amount IS 'Expected payment amount';
COMMENT ON COLUMN billers.timing IS 'Payment timing within month (1/2 or 2/2)';
COMMENT ON COLUMN billers.activation_date IS 'Date when biller becomes active (JSONB: {month, year})';
COMMENT ON COLUMN billers.deactivation_c IS 'Date when biller becomes inactive (JSONB: {month, year}, nullable)';
COMMENT ON COLUMN billers.status IS 'Active or inactive status';
COMMENT ON COLUMN billers.schedules IS 'Payment schedules array (JSONB, legacy field - use payment_schedules table instead)';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_billers_status ON billers(status);
CREATE INDEX IF NOT EXISTS idx_billers_category ON billers(category);

-- ============================================================================
-- INSTALLMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  monthly_amount NUMERIC NOT NULL,
  term_duration INTEGER NOT NULL,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
);

-- Add comments
COMMENT ON TABLE installments IS 'Payment plans and installment agreements';
COMMENT ON COLUMN installments.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN installments.name IS 'Installment plan name';
COMMENT ON COLUMN installments.total_amount IS 'Total amount to be paid';
COMMENT ON COLUMN installments.monthly_amount IS 'Monthly payment amount';
COMMENT ON COLUMN installments.term_duration IS 'Number of months in the term';
COMMENT ON COLUMN installments.paid_amount IS 'Amount paid so far';
COMMENT ON COLUMN installments.account_id IS 'Account used for payments';

-- Create index
CREATE INDEX IF NOT EXISTS idx_installments_account_id ON installments(account_id);

-- ============================================================================
-- SAVINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS savings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  current_balance NUMERIC NOT NULL DEFAULT 0
);

-- Add comments
COMMENT ON TABLE savings IS 'Savings jars/goals for tracking specific savings targets';
COMMENT ON COLUMN savings.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN savings.name IS 'Savings goal name';
COMMENT ON COLUMN savings.account_id IS 'Associated account';
COMMENT ON COLUMN savings.current_balance IS 'Current saved amount';

-- Create index
CREATE INDEX IF NOT EXISTS idx_savings_account_id ON savings(account_id);

-- ============================================================================
-- TRANSACTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date TIMESTAMP NOT NULL DEFAULT NOW(),
  amount NUMERIC NOT NULL,
  payment_method_id UUID NOT NULL REFERENCES accounts(id) ON DELETE SET NULL
);

-- Add comments
COMMENT ON TABLE transactions IS 'Financial transactions and payments';
COMMENT ON COLUMN transactions.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN transactions.name IS 'Transaction description';
COMMENT ON COLUMN transactions.date IS 'Transaction date and time';
COMMENT ON COLUMN transactions.amount IS 'Transaction amount';
COMMENT ON COLUMN transactions.payment_method_id IS 'Account used for payment';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method_id ON transactions(payment_method_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billers ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
-- WARNING: These policies allow anyone to read/write (no authentication required)
-- This is suitable for development/testing but should be updated for production
-- to restrict access based on user authentication (auth.uid())

-- Accounts policies
CREATE POLICY IF NOT EXISTS "Enable all for accounts" 
  ON accounts FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Billers policies
CREATE POLICY IF NOT EXISTS "Enable all for billers" 
  ON billers FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Installments policies
CREATE POLICY IF NOT EXISTS "Enable all for installments" 
  ON installments FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Savings policies
CREATE POLICY IF NOT EXISTS "Enable all for savings" 
  ON savings FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Transactions policies
CREATE POLICY IF NOT EXISTS "Enable all for transactions" 
  ON transactions FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to verify the migration succeeded:
--
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
--   AND tablename IN ('accounts', 'billers', 'installments', 'savings', 'transactions');
--
-- Should return 5 rows with all table names.
