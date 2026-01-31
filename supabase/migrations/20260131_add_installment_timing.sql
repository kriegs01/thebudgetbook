-- PROTOTYPE Migration: Add timing column to installments table
-- This adds the timing field to track when in the month installment payments are due
-- Run this in your Supabase SQL Editor

-- Add timing column to installments table
ALTER TABLE installments 
ADD COLUMN IF NOT EXISTS timing TEXT CHECK (timing IN ('1/2', '2/2'));

-- Add index for faster filtering by timing
CREATE INDEX IF NOT EXISTS idx_installments_timing 
ON installments(timing);

-- Add comment to document the column
COMMENT ON COLUMN installments.timing IS 'PROTOTYPE: Payment timing within the month (1/2 for first half, 2/2 for second half)';

-- Note: This column is nullable to maintain backward compatibility with existing records
-- Default value is not set to allow users to explicitly specify timing for each installment
