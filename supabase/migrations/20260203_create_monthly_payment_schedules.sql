-- Migration: Create monthly_payment_schedules table
-- This table stores individual monthly payment schedules for billers and installments
-- Each biller and installment will create separate schedule records for each payment period
-- Run this in your Supabase SQL Editor

-- Create the monthly_payment_schedules table
CREATE TABLE IF NOT EXISTS monthly_payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to source item (biller or installment)
  source_type TEXT NOT NULL CHECK (source_type IN ('biller', 'installment')),
  source_id UUID NOT NULL,
  
  -- Schedule period
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  payment_number INTEGER, -- For installments: tracks which payment in sequence (1, 2, 3...)
  
  -- Payment details
  expected_amount NUMERIC(10, 2) NOT NULL,
  amount_paid NUMERIC(10, 2) DEFAULT 0,
  
  -- Payment information
  receipt TEXT,
  date_paid DATE,
  account_id UUID, -- Reference to the account used for payment
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'overdue')),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique schedule per source item, month, and year
  CONSTRAINT unique_schedule_per_period UNIQUE (source_type, source_id, month, year)
);

-- Add comments to document the columns
COMMENT ON TABLE monthly_payment_schedules IS 'Stores monthly payment schedules for billers and installments with unique tracking IDs';
COMMENT ON COLUMN monthly_payment_schedules.id IS 'Unique identifier (UUID) for the payment schedule';
COMMENT ON COLUMN monthly_payment_schedules.source_type IS 'Type of source: "biller" or "installment"';
COMMENT ON COLUMN monthly_payment_schedules.source_id IS 'UUID reference to the biller or installment';
COMMENT ON COLUMN monthly_payment_schedules.month IS 'Month name (e.g., January, February, March)';
COMMENT ON COLUMN monthly_payment_schedules.year IS 'Year as integer (e.g., 2026)';
COMMENT ON COLUMN monthly_payment_schedules.payment_number IS 'Payment sequence number for installments (1, 2, 3, etc.)';
COMMENT ON COLUMN monthly_payment_schedules.expected_amount IS 'Expected payment amount for this period';
COMMENT ON COLUMN monthly_payment_schedules.amount_paid IS 'Amount actually paid for this period';
COMMENT ON COLUMN monthly_payment_schedules.receipt IS 'Receipt reference or file path';
COMMENT ON COLUMN monthly_payment_schedules.date_paid IS 'Date when payment was made';
COMMENT ON COLUMN monthly_payment_schedules.account_id IS 'UUID of account used for payment';
COMMENT ON COLUMN monthly_payment_schedules.status IS 'Payment status: pending, paid, partial, or overdue';
COMMENT ON COLUMN monthly_payment_schedules.created_at IS 'Timestamp when the schedule was created';
COMMENT ON COLUMN monthly_payment_schedules.updated_at IS 'Timestamp when the schedule was last updated';

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_payment_schedules_source 
ON monthly_payment_schedules(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_period 
ON monthly_payment_schedules(year, month);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_status 
ON monthly_payment_schedules(status);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_account 
ON monthly_payment_schedules(account_id) WHERE account_id IS NOT NULL;

-- Create trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_monthly_payment_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_monthly_payment_schedules_updated_at
BEFORE UPDATE ON monthly_payment_schedules
FOR EACH ROW
EXECUTE FUNCTION update_monthly_payment_schedules_updated_at();

-- Enable Row Level Security
ALTER TABLE monthly_payment_schedules ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (adjust based on your auth needs)
-- ⚠️ SECURITY WARNING: This policy allows unrestricted read/write access!
-- This is suitable for development/testing ONLY.
-- 
-- For PRODUCTION, you MUST implement proper authentication-based policies.
-- Example production policies:
--
-- 1. User-based access (if you have user authentication):
--    CREATE POLICY "Users can manage their own schedules" ON monthly_payment_schedules
--    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--
-- 2. Organization-based access (if you have multi-tenancy):
--    CREATE POLICY "Users can access org schedules" ON monthly_payment_schedules
--    FOR ALL USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid()));
--
-- 3. Role-based access:
--    CREATE POLICY "Admins can manage all schedules" ON monthly_payment_schedules
--    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
--
-- Remove or replace this policy before deploying to production!
CREATE POLICY "Enable all for monthly_payment_schedules" ON monthly_payment_schedules 
FOR ALL USING (true) WITH CHECK (true);
