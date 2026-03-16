-- Migration: Add scheduled_increases to billers table
--
-- Adds a JSONB column to store scheduled future amount changes for Fixed,
-- Utilities, and Subscriptions billers.  Each element in the array is an
-- object of the shape { "effectiveDate": "YYYY-MM-DD", "amount": <number> }.
--
-- Loans billers and all other categories store an empty array or NULL here;
-- the application ignores this column for those categories.
--
-- The column is nullable and defaults to an empty JSON array so that:
--   a) Existing rows remain valid without a back-fill.
--   b) Application code can safely read `scheduled_increases ?? []`.

ALTER TABLE billers
ADD COLUMN IF NOT EXISTS scheduled_increases JSONB DEFAULT '[]'::jsonb;

-- Mirror the column in the test table if it exists
ALTER TABLE IF EXISTS billers_test
ADD COLUMN IF NOT EXISTS scheduled_increases JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN billers.scheduled_increases IS 'Array of scheduled future amount changes: [{ "effectiveDate": "YYYY-MM-DD", "amount": 0 }, ...]. Used by Fixed, Utilities, and Subscriptions billers only.';
