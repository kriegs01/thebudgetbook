-- Migration: Add start_date column to installments table
-- This allows tracking when installment plans begin
-- Run this in your Supabase SQL Editor

-- Add start_date column to installments table
ALTER TABLE installments 
ADD COLUMN IF NOT EXISTS start_date DATE;

-- Add index for faster filtering by start date
CREATE INDEX IF NOT EXISTS idx_installments_start_date 
ON installments(start_date);

-- Add comment to document the column
COMMENT ON COLUMN installments.start_date IS 'Start date of the installment plan (YYYY-MM-DD format). Used to determine when installment should first appear in budget planning.';

-- Note: This column is nullable to maintain backward compatibility with existing records
-- Installments without a start_date will always be displayed (legacy behavior)
