-- Migration: Create payment_schedules table
-- This table stores all monthly payment schedules for Billers and Installments
-- Each payment schedule represents a unique period/month for a specific biller or installment
-- Run this in your Supabase SQL Editor

-- Create the payment_schedules table
CREATE TABLE IF NOT EXISTS payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign keys to either billers or installments (mutually exclusive - one must be null)
  biller_id UUID REFERENCES billers(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES installments(id) ON DELETE CASCADE,
  
  -- Schedule period (format: 'YYYY-MM', e.g., '2026-03')
  schedule_month TEXT NOT NULL,
  
  -- Expected payment amount for this period
  expected_amount NUMERIC(10, 2) NOT NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  -- Ensure exactly one of biller_id or installment_id is set
  CONSTRAINT check_single_reference CHECK (
    (biller_id IS NOT NULL AND installment_id IS NULL) OR
    (biller_id IS NULL AND installment_id IS NOT NULL)
  ),
  
  -- Ensure unique schedule per biller/installment per month
  CONSTRAINT unique_biller_schedule UNIQUE NULLS NOT DISTINCT (biller_id, schedule_month),
  CONSTRAINT unique_installment_schedule UNIQUE NULLS NOT DISTINCT (installment_id, schedule_month)
);

-- Add comments to document the columns
COMMENT ON TABLE payment_schedules IS 'Stores monthly payment schedules for Billers and Installments. Provides 1-1 mapping between schedules and transactions.';
COMMENT ON COLUMN payment_schedules.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN payment_schedules.biller_id IS 'Foreign key to billers table (null if this is an installment schedule)';
COMMENT ON COLUMN payment_schedules.installment_id IS 'Foreign key to installments table (null if this is a biller schedule)';
COMMENT ON COLUMN payment_schedules.schedule_month IS 'The month for this payment schedule (format: YYYY-MM, e.g., 2026-03)';
COMMENT ON COLUMN payment_schedules.expected_amount IS 'Expected payment amount for this schedule period';
COMMENT ON COLUMN payment_schedules.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN payment_schedules.updated_at IS 'Timestamp when the record was last updated';

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_payment_schedules_biller_id 
ON payment_schedules(biller_id) WHERE biller_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_schedules_installment_id 
ON payment_schedules(installment_id) WHERE installment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_schedules_schedule_month 
ON payment_schedules(schedule_month);

-- Create index for efficient lookups by biller and month
CREATE INDEX IF NOT EXISTS idx_payment_schedules_biller_month 
ON payment_schedules(biller_id, schedule_month) WHERE biller_id IS NOT NULL;

-- Create index for efficient lookups by installment and month
CREATE INDEX IF NOT EXISTS idx_payment_schedules_installment_month 
ON payment_schedules(installment_id, schedule_month) WHERE installment_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (adjust based on your auth needs)
-- WARNING: This policy allows anyone to read/write. 
-- In production, restrict based on user authentication!
CREATE POLICY "Enable all for payment_schedules" ON payment_schedules FOR ALL USING (true) WITH CHECK (true);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function
CREATE TRIGGER trigger_update_payment_schedules_updated_at
  BEFORE UPDATE ON payment_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_schedules_updated_at();
