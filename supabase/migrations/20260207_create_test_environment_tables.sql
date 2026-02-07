-- Migration: Create test environment tables
-- This creates duplicate tables with _test suffix for safe testing without affecting production data

-- Create test tables (duplicates of production tables)

-- Accounts test table
CREATE TABLE IF NOT EXISTS accounts_test (
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

-- Billers test table
CREATE TABLE IF NOT EXISTS billers_test (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  due_date TEXT NOT NULL,
  expected_amount NUMERIC NOT NULL,
  timing TEXT NOT NULL,
  activation_date JSONB NOT NULL,
  deactivation_c JSONB,
  status TEXT NOT NULL,
  schedules JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_account_id UUID REFERENCES accounts_test(id) ON DELETE SET NULL
);

-- Installments test table
CREATE TABLE IF NOT EXISTS installments_test (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  monthly_amount NUMERIC NOT NULL,
  term_duration INTEGER NOT NULL,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  account_id UUID REFERENCES accounts_test(id) ON DELETE CASCADE,
  start_date DATE,
  timing TEXT
);

-- Savings test table
CREATE TABLE IF NOT EXISTS savings_test (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  account_id UUID REFERENCES accounts_test(id) ON DELETE CASCADE,
  current_balance NUMERIC NOT NULL DEFAULT 0
);

-- Transactions test table
CREATE TABLE IF NOT EXISTS transactions_test (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date TIMESTAMP NOT NULL DEFAULT NOW(),
  amount NUMERIC NOT NULL,
  payment_method_id UUID REFERENCES accounts_test(id) ON DELETE SET NULL,
  payment_schedule_id UUID
);

-- Budget Setups test table
CREATE TABLE IF NOT EXISTS budget_setups_test (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  timing TEXT NOT NULL,
  status TEXT NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_month_timing_test UNIQUE (month, timing)
);

-- Monthly Payment Schedules test table
CREATE TABLE IF NOT EXISTS monthly_payment_schedules_test (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('biller', 'installment')),
  source_id UUID NOT NULL,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  payment_number INTEGER,
  expected_amount NUMERIC(10, 2) NOT NULL,
  amount_paid NUMERIC(10, 2) DEFAULT 0,
  receipt TEXT,
  date_paid DATE,
  account_id UUID REFERENCES accounts_test(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'partial', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) for test tables
ALTER TABLE accounts_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE billers_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_setups_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_payment_schedules_test ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (same as production tables)
CREATE POLICY "Enable all for accounts_test" ON accounts_test FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for billers_test" ON billers_test FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for installments_test" ON installments_test FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for savings_test" ON savings_test FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for transactions_test" ON transactions_test FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for budget_setups_test" ON budget_setups_test FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for monthly_payment_schedules_test" ON monthly_payment_schedules_test FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for test tables (same as production)
CREATE INDEX IF NOT EXISTS idx_transactions_test_payment_method ON transactions_test(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_transactions_test_date ON transactions_test(date);
CREATE INDEX IF NOT EXISTS idx_transactions_test_schedule ON transactions_test(payment_schedule_id);

-- Enable real-time for test transactions (if needed)
ALTER TABLE transactions_test REPLICA IDENTITY FULL;

COMMENT ON TABLE accounts_test IS 'Test environment duplicate of accounts table';
COMMENT ON TABLE billers_test IS 'Test environment duplicate of billers table';
COMMENT ON TABLE installments_test IS 'Test environment duplicate of installments table';
COMMENT ON TABLE savings_test IS 'Test environment duplicate of savings table';
COMMENT ON TABLE transactions_test IS 'Test environment duplicate of transactions table';
COMMENT ON TABLE budget_setups_test IS 'Test environment duplicate of budget_setups table';
COMMENT ON TABLE monthly_payment_schedules_test IS 'Test environment duplicate of monthly_payment_schedules table';
