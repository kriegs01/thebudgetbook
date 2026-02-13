-- Migration: Add User Authentication
-- This migration adds user_id columns to all tables and updates RLS policies for multi-user support
-- Date: 2026-02-13

-- ==================================================
-- STEP 1: Add user_id columns to all tables
-- ==================================================

-- Add user_id to accounts table
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to billers table
ALTER TABLE billers 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to installments table
ALTER TABLE installments 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to savings table
ALTER TABLE savings 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to budget_setups table
ALTER TABLE budget_setups 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to monthly_payment_schedules table
ALTER TABLE monthly_payment_schedules 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ==================================================
-- STEP 2: Add user_id columns to test tables
-- ==================================================

-- Add user_id to test tables
ALTER TABLE accounts_test 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE billers_test 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE installments_test 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE savings_test 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE transactions_test 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE budget_setups_test 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE monthly_payment_schedules_test 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ==================================================
-- STEP 3: Create indexes for performance
-- ==================================================

-- Create indexes on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_billers_user_id ON billers(user_id);
CREATE INDEX IF NOT EXISTS idx_installments_user_id ON installments(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_user_id ON savings(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_setups_user_id ON budget_setups(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_payment_schedules_user_id ON monthly_payment_schedules(user_id);

-- Create indexes on test tables
CREATE INDEX IF NOT EXISTS idx_accounts_test_user_id ON accounts_test(user_id);
CREATE INDEX IF NOT EXISTS idx_billers_test_user_id ON billers_test(user_id);
CREATE INDEX IF NOT EXISTS idx_installments_test_user_id ON installments_test(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_test_user_id ON savings_test(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_test_user_id ON transactions_test(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_setups_test_user_id ON budget_setups_test(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_payment_schedules_test_user_id ON monthly_payment_schedules_test(user_id);

-- ==================================================
-- STEP 4: Update Row Level Security (RLS) policies
-- ==================================================

-- Drop existing permissive policies for production tables
DROP POLICY IF EXISTS "Enable all for accounts" ON accounts;
DROP POLICY IF EXISTS "Enable all for billers" ON billers;
DROP POLICY IF EXISTS "Enable all for installments" ON installments;
DROP POLICY IF EXISTS "Enable all for savings" ON savings;
DROP POLICY IF EXISTS "Enable all for transactions" ON transactions;
DROP POLICY IF EXISTS "Enable all for budget_setups" ON budget_setups;
DROP POLICY IF EXISTS "Enable all for monthly_payment_schedules" ON monthly_payment_schedules;

-- Drop existing permissive policies for test tables
DROP POLICY IF EXISTS "Enable all for accounts_test" ON accounts_test;
DROP POLICY IF EXISTS "Enable all for billers_test" ON billers_test;
DROP POLICY IF EXISTS "Enable all for installments_test" ON installments_test;
DROP POLICY IF EXISTS "Enable all for savings_test" ON savings_test;
DROP POLICY IF EXISTS "Enable all for transactions_test" ON transactions_test;
DROP POLICY IF EXISTS "Enable all for budget_setups_test" ON budget_setups_test;
DROP POLICY IF EXISTS "Enable all for monthly_payment_schedules_test" ON monthly_payment_schedules_test;

-- Create user-specific policies for production tables
CREATE POLICY "Users can manage their own accounts" 
ON accounts FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own billers" 
ON billers FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own installments" 
ON installments FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own savings" 
ON savings FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own transactions" 
ON transactions FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own budget_setups" 
ON budget_setups FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own payment schedules" 
ON monthly_payment_schedules FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Create user-specific policies for test tables
CREATE POLICY "Users can manage their own accounts_test" 
ON accounts_test FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own billers_test" 
ON billers_test FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own installments_test" 
ON installments_test FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own savings_test" 
ON savings_test FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own transactions_test" 
ON transactions_test FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own budget_setups_test" 
ON budget_setups_test FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own payment schedules_test" 
ON monthly_payment_schedules_test FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- ==================================================
-- NOTES
-- ==================================================
-- 
-- 1. Existing data will have user_id = NULL
-- 2. The application will automatically migrate NULL user_id data to the first user who logs in
-- 3. After running this migration, enable Email Auth in Supabase Dashboard:
--    - Go to Authentication > Providers
--    - Enable Email provider
--    - Configure email templates if needed
-- 4. Test the migration in a development environment first
-- 5. Backup your database before running this in production
