-- Migration: Rename month and year columns to schedule_month and schedule_year
-- This ensures field names match the exact specification in the requirements

-- Rename columns
ALTER TABLE payment_schedules 
  RENAME COLUMN month TO schedule_month;

ALTER TABLE payment_schedules 
  RENAME COLUMN year TO schedule_year;

-- Update indexes to reflect new column names
DROP INDEX IF EXISTS idx_payment_schedules_month_year;
CREATE INDEX IF NOT EXISTS idx_payment_schedules_schedule_month_year 
ON payment_schedules(schedule_month, schedule_year);

DROP INDEX IF EXISTS idx_payment_schedules_biller_month_year;
CREATE INDEX IF NOT EXISTS idx_payment_schedules_biller_schedule_month_year 
ON payment_schedules(biller_id, schedule_month, schedule_year) WHERE biller_id IS NOT NULL;

DROP INDEX IF EXISTS idx_payment_schedules_installment_month_year;
CREATE INDEX IF NOT EXISTS idx_payment_schedules_installment_schedule_month_year 
ON payment_schedules(installment_id, schedule_month, schedule_year) WHERE installment_id IS NOT NULL;

-- Update unique constraints
ALTER TABLE payment_schedules 
  DROP CONSTRAINT IF EXISTS unique_biller_month_year;
ALTER TABLE payment_schedules 
  ADD CONSTRAINT unique_biller_schedule_month_year 
  UNIQUE (biller_id, schedule_month, schedule_year);

ALTER TABLE payment_schedules 
  DROP CONSTRAINT IF EXISTS unique_installment_month_year;
ALTER TABLE payment_schedules 
  ADD CONSTRAINT unique_installment_schedule_month_year 
  UNIQUE (installment_id, schedule_month, schedule_year);

-- Update column comments
COMMENT ON COLUMN payment_schedules.schedule_month IS 'Month name (e.g., January, February)';
COMMENT ON COLUMN payment_schedules.schedule_year IS 'Year (e.g., 2026)';
