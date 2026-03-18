-- Add archive lifecycle columns to budget_setups table.
-- is_archived: true when the budget has been closed/archived.
-- closed_at:   timestamp when the budget was closed.
-- reopened_at: timestamp when the budget was last reopened.

ALTER TABLE budget_setups
  ADD COLUMN IF NOT EXISTS is_archived  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at  timestamptz;
