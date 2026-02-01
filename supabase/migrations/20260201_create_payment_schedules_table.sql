-- Create payment_schedules table to replace billers.schedules JSONB array
-- This enables proper relational querying and foreign key constraints

CREATE TABLE IF NOT EXISTS payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biller_id UUID NOT NULL REFERENCES billers(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  year TEXT NOT NULL,
  expected_amount NUMERIC NOT NULL,
  amount_paid NUMERIC,
  receipt TEXT,
  date_paid DATE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one schedule per biller per month/year
  CONSTRAINT unique_biller_month_year UNIQUE (biller_id, month, year)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_schedules_biller_id ON payment_schedules(biller_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_month_year ON payment_schedules(month, year);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_account_id ON payment_schedules(account_id);

-- Enable Row Level Security
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (adjust based on your auth needs)
-- WARNING: This policy allows anyone to read/write.
-- In production, restrict based on user authentication!
CREATE POLICY "Enable all for payment_schedules" ON payment_schedules FOR ALL USING (true) WITH CHECK (true);

-- Add comment to document the purpose
COMMENT ON TABLE payment_schedules IS 'Stores payment schedules for billers with one row per biller per month/year';
COMMENT ON COLUMN payment_schedules.biller_id IS 'Foreign key to billers table';
COMMENT ON COLUMN payment_schedules.month IS 'Month name (e.g., January, February)';
COMMENT ON COLUMN payment_schedules.year IS 'Year as string (e.g., 2024, 2025)';
COMMENT ON COLUMN payment_schedules.expected_amount IS 'Expected payment amount for this month';
COMMENT ON COLUMN payment_schedules.amount_paid IS 'Actual amount paid (null if unpaid)';
COMMENT ON COLUMN payment_schedules.receipt IS 'Receipt file name or path';
COMMENT ON COLUMN payment_schedules.date_paid IS 'Date when payment was made';
COMMENT ON COLUMN payment_schedules.account_id IS 'Account used for payment (payment method)';

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function before update
CREATE TRIGGER trigger_update_payment_schedules_timestamp
BEFORE UPDATE ON payment_schedules
FOR EACH ROW
EXECUTE FUNCTION update_payment_schedules_updated_at();
