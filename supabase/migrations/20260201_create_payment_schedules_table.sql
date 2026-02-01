-- Migration: Create payment_schedules table
-- This table stores unique payment schedules for all Billers and Installments
-- Prevents duplicate and misapplied payments through unique constraints

-- Create the payment_schedules table
CREATE TABLE IF NOT EXISTS payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to either a biller or installment (exactly one must be set)
  biller_id UUID REFERENCES billers(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES installments(id) ON DELETE CASCADE,
  
  -- Schedule month and year
  schedule_month TEXT NOT NULL, -- e.g., "January", "February"
  schedule_year TEXT NOT NULL,  -- e.g., "2024", "2025"
  
  -- Payment details
  expected_amount NUMERIC(10, 2) NOT NULL,
  amount_paid NUMERIC(10, 2),
  date_paid DATE,
  receipt TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  
  -- Timing within the month (for filtering/grouping)
  timing TEXT CHECK (timing IN ('1/2', '2/2')),
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints to ensure data integrity
  CONSTRAINT check_one_parent CHECK (
    (biller_id IS NOT NULL AND installment_id IS NULL) OR
    (biller_id IS NULL AND installment_id IS NOT NULL)
  ),
  CONSTRAINT unique_biller_schedule UNIQUE (biller_id, schedule_month, schedule_year),
  CONSTRAINT unique_installment_schedule UNIQUE (installment_id, schedule_month, schedule_year)
);

-- Add comments to document the table and columns
COMMENT ON TABLE payment_schedules IS 'Stores unique payment schedules for Billers and Installments to prevent duplicate payments';
COMMENT ON COLUMN payment_schedules.id IS 'Unique identifier (UUID) for this payment schedule';
COMMENT ON COLUMN payment_schedules.biller_id IS 'Foreign key to billers table (null if this is an installment schedule)';
COMMENT ON COLUMN payment_schedules.installment_id IS 'Foreign key to installments table (null if this is a biller schedule)';
COMMENT ON COLUMN payment_schedules.schedule_month IS 'Month name for this payment schedule';
COMMENT ON COLUMN payment_schedules.schedule_year IS 'Year for this payment schedule';
COMMENT ON COLUMN payment_schedules.expected_amount IS 'Expected payment amount for this schedule';
COMMENT ON COLUMN payment_schedules.amount_paid IS 'Actual amount paid (null if not yet paid)';
COMMENT ON COLUMN payment_schedules.date_paid IS 'Date when payment was made (null if not yet paid)';
COMMENT ON COLUMN payment_schedules.receipt IS 'Receipt identifier or file reference';
COMMENT ON COLUMN payment_schedules.account_id IS 'Account used for payment (null if not yet paid)';
COMMENT ON COLUMN payment_schedules.timing IS 'Payment timing within the month (1/2 or 2/2)';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_schedules_biller_id ON payment_schedules(biller_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_installment_id ON payment_schedules(installment_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_schedule_month_year ON payment_schedules(schedule_month, schedule_year);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_date_paid ON payment_schedules(date_paid);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_timing ON payment_schedules(timing);

-- Create index for querying unpaid schedules
CREATE INDEX IF NOT EXISTS idx_payment_schedules_unpaid ON payment_schedules(biller_id, installment_id) 
  WHERE amount_paid IS NULL;

-- Enable Row Level Security
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (adjust based on your auth needs)
-- WARNING: This policy allows anyone to read/write. 
-- In production, restrict based on user authentication!
CREATE POLICY "Enable all for payment_schedules" ON payment_schedules FOR ALL USING (true) WITH CHECK (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_payment_schedules_updated_at
  BEFORE UPDATE ON payment_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_schedules_updated_at();
