-- Migration: Create budget_setups table
-- This table stores persistent budget setup configurations
-- Run this in your Supabase SQL Editor

-- Create the budget_setups table
CREATE TABLE IF NOT EXISTS budget_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  timing TEXT NOT NULL,
  status TEXT NOT NULL,
  total_amount FLOAT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments to document the columns
COMMENT ON TABLE budget_setups IS 'Stores budget setup configurations with categorized items and monthly planning data';
COMMENT ON COLUMN budget_setups.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN budget_setups.month IS 'Month name (e.g., January, February)';
COMMENT ON COLUMN budget_setups.timing IS 'Budget timing period (1/2 or 2/2)';
COMMENT ON COLUMN budget_setups.status IS 'Current status of the budget setup (e.g., Active, Saved, Completed)';
COMMENT ON COLUMN budget_setups.total_amount IS 'Total amount allocated in this budget setup';
COMMENT ON COLUMN budget_setups.data IS 'JSON object containing categorized setup items';
COMMENT ON COLUMN budget_setups.created_at IS 'Timestamp when the record was created';

-- Create index for faster queries on month and timing
CREATE INDEX IF NOT EXISTS idx_budget_setups_month_timing 
ON budget_setups(month, timing);

-- Create index on created_at for chronological queries
CREATE INDEX IF NOT EXISTS idx_budget_setups_created_at 
ON budget_setups(created_at DESC);
