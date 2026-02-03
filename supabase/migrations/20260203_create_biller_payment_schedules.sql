-- Migration: Create biller_payment_schedules table
-- This table stores individual payment schedules for billers with explicit paid status
-- Each payment entry is linked to its parent biller via foreign key

-- Create the biller_payment_schedules table
CREATE TABLE IF NOT EXISTS biller_payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biller_id UUID NOT NULL REFERENCES billers(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  year TEXT NOT NULL,
  expected_amount NUMERIC(10, 2) NOT NULL,
  amount_paid NUMERIC(10, 2),
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  date_paid DATE,
  receipt TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_biller_month_year UNIQUE (biller_id, month, year)
);

-- Add comments to document the columns
COMMENT ON TABLE biller_payment_schedules IS 'Stores individual payment schedules for billers with explicit paid status tracking';
COMMENT ON COLUMN biller_payment_schedules.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN biller_payment_schedules.biller_id IS 'Foreign key to billers table';
COMMENT ON COLUMN biller_payment_schedules.month IS 'Month name (e.g., January, February)';
COMMENT ON COLUMN biller_payment_schedules.year IS 'Year (e.g., 2026)';
COMMENT ON COLUMN biller_payment_schedules.expected_amount IS 'Expected payment amount';
COMMENT ON COLUMN biller_payment_schedules.amount_paid IS 'Actual amount paid (nullable until payment is made)';
COMMENT ON COLUMN biller_payment_schedules.paid IS 'Explicit paid status - TRUE when payment is recorded, FALSE otherwise';
COMMENT ON COLUMN biller_payment_schedules.date_paid IS 'Date when payment was made';
COMMENT ON COLUMN biller_payment_schedules.receipt IS 'Receipt file name or reference';
COMMENT ON COLUMN biller_payment_schedules.account_id IS 'Account used for payment';
COMMENT ON COLUMN biller_payment_schedules.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN biller_payment_schedules.updated_at IS 'Timestamp when the record was last updated';

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_biller_payment_schedules_biller_id 
ON biller_payment_schedules(biller_id);

CREATE INDEX IF NOT EXISTS idx_biller_payment_schedules_month_year 
ON biller_payment_schedules(month, year);

CREATE INDEX IF NOT EXISTS idx_biller_payment_schedules_paid 
ON biller_payment_schedules(paid);

CREATE INDEX IF NOT EXISTS idx_biller_payment_schedules_created_at 
ON biller_payment_schedules(created_at DESC);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_biller_payment_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_biller_payment_schedules_updated_at
BEFORE UPDATE ON biller_payment_schedules
FOR EACH ROW
EXECUTE FUNCTION update_biller_payment_schedules_updated_at();

-- Enable Row Level Security
ALTER TABLE biller_payment_schedules ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (adjust based on your auth needs)
-- WARNING: This policy allows anyone to read/write. 
-- In production, restrict based on user authentication!
CREATE POLICY "Enable all for biller_payment_schedules" 
ON biller_payment_schedules FOR ALL 
USING (true) WITH CHECK (true);
