-- Add date range columns to support dynamic budget frequencies (Weekly, Fortnightly, etc.)
ALTER TABLE budget_setups 
ADD COLUMN IF NOT EXISTS period_start DATE,
ADD COLUMN IF NOT EXISTS period_end DATE;

-- Keep the test environment in sync
ALTER TABLE budget_setups_test 
ADD COLUMN IF NOT EXISTS period_start DATE,
ADD COLUMN IF NOT EXISTS period_end DATE;
