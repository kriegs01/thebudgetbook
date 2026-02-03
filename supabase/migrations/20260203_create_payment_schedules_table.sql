-- Migration: Create payment_schedules table
-- This table stores payment schedule records for billers and installments
-- as the single source of truth for payment tracking

-- Create the payment_schedules table
CREATE TABLE IF NOT EXISTS payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  expected_amount NUMERIC NOT NULL,
  amount_paid NUMERIC DEFAULT 0,
  receipt TEXT,
  date_paid DATE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  biller_id UUID REFERENCES billers(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES installments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure each schedule belongs to either a biller or installment, not both
  CONSTRAINT payment_schedules_entity_check CHECK (
    (biller_id IS NOT NULL AND installment_id IS NULL) OR
    (biller_id IS NULL AND installment_id IS NOT NULL)
  ),
  
  -- Ensure unique schedules per month/year for each biller or installment
  CONSTRAINT unique_biller_month_year UNIQUE (biller_id, month, year),
  CONSTRAINT unique_installment_month_year UNIQUE (installment_id, month, year)
);

-- Add comments to document the columns
COMMENT ON TABLE payment_schedules IS 'Unified payment schedules for billers and installments - single source of truth for payment tracking';
COMMENT ON COLUMN payment_schedules.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN payment_schedules.month IS 'Month name (e.g., January, February)';
COMMENT ON COLUMN payment_schedules.year IS 'Year (e.g., 2026)';
COMMENT ON COLUMN payment_schedules.expected_amount IS 'Expected payment amount for this period';
COMMENT ON COLUMN payment_schedules.amount_paid IS 'Actual amount paid (0 if unpaid)';
COMMENT ON COLUMN payment_schedules.receipt IS 'Receipt identifier or reference (optional)';
COMMENT ON COLUMN payment_schedules.date_paid IS 'Date when payment was made (NULL if unpaid)';
COMMENT ON COLUMN payment_schedules.account_id IS 'Account used for payment (NULL if unpaid)';
COMMENT ON COLUMN payment_schedules.biller_id IS 'Foreign key to billers table (NULL if this is an installment schedule)';
COMMENT ON COLUMN payment_schedules.installment_id IS 'Foreign key to installments table (NULL if this is a biller schedule)';
COMMENT ON COLUMN payment_schedules.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN payment_schedules.updated_at IS 'Timestamp when the record was last updated';

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_payment_schedules_biller_id 
ON payment_schedules(biller_id);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_installment_id 
ON payment_schedules(installment_id);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_month_year 
ON payment_schedules(month, year);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_biller_month_year 
ON payment_schedules(biller_id, month, year) WHERE biller_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_schedules_installment_month_year 
ON payment_schedules(installment_id, month, year) WHERE installment_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (adjust based on your auth needs)
-- WARNING: This policy allows anyone to read/write. 
-- In production, restrict based on user authentication!
CREATE POLICY "Enable all for payment_schedules" 
ON payment_schedules FOR ALL USING (true) WITH CHECK (true);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function before updates
CREATE TRIGGER set_payment_schedules_updated_at
BEFORE UPDATE ON payment_schedules
FOR EACH ROW
EXECUTE FUNCTION update_payment_schedules_updated_at();
