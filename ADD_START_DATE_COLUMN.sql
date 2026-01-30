-- Migration: Add start_date column to installments table
-- Run this in your Supabase SQL Editor if the start_date column doesn't exist

-- Add start_date column to installments table
ALTER TABLE installments 
ADD COLUMN IF NOT EXISTS start_date DATE;

-- Optional: Add comment to document the column
COMMENT ON COLUMN installments.start_date IS 'Start date of the installment plan (YYYY-MM-DD format)';
