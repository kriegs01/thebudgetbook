-- Add archive/lifecycle fields to budget_setups
-- is_archived: true when the budget is closed/read-only
-- closed_at:   timestamp of the last Close action
-- reopened_at: timestamp of the last Reopen action

ALTER TABLE budget_setups
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz;
