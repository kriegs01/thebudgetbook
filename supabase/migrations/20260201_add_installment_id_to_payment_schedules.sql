-- Add installment_id to payment_schedules table to support both billers and installments
-- This enables unified payment tracking for all payment types

-- Add the installment_id column as a nullable UUID foreign key
ALTER TABLE payment_schedules 
ADD COLUMN IF NOT EXISTS installment_id UUID REFERENCES installments(id) ON DELETE CASCADE;

-- Add index for better query performance when filtering by installment
CREATE INDEX IF NOT EXISTS idx_payment_schedules_installment_id ON payment_schedules(installment_id);

-- Update the unique constraint to be flexible for both billers and installments
-- Drop the old constraint
ALTER TABLE payment_schedules 
DROP CONSTRAINT IF EXISTS unique_biller_month_year;

-- Add new constraint that works for both billers and installments
-- Either biller_id or installment_id must be provided (but not both)
ALTER TABLE payment_schedules
ADD CONSTRAINT check_biller_or_installment 
CHECK (
  (biller_id IS NOT NULL AND installment_id IS NULL) OR 
  (biller_id IS NULL AND installment_id IS NOT NULL)
);

-- Add unique constraint for biller schedules
CREATE UNIQUE INDEX IF NOT EXISTS unique_biller_schedule 
ON payment_schedules (biller_id, schedule_month, schedule_year) 
WHERE biller_id IS NOT NULL;

-- Add unique constraint for installment schedules
CREATE UNIQUE INDEX IF NOT EXISTS unique_installment_schedule 
ON payment_schedules (installment_id, schedule_month, schedule_year) 
WHERE installment_id IS NOT NULL;

-- Add comment to document the purpose
COMMENT ON COLUMN payment_schedules.installment_id IS 'Foreign key to installments table - either biller_id or installment_id must be set, but not both';

-- Update table comment
COMMENT ON TABLE payment_schedules IS 'Stores payment schedules for billers and installments with one row per entity per month/year';
