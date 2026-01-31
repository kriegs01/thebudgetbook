-- ENHANCEMENT: Add linked_account_id to billers table
-- This allows Loans-category billers to dynamically pull amounts from credit account transaction history
-- using real billing cycle windows instead of calendar months.

-- Add the linked_account_id column as a nullable UUID foreign key to accounts table
ALTER TABLE billers 
ADD COLUMN IF NOT EXISTS linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Add index for better query performance when filtering billers by linked account
CREATE INDEX IF NOT EXISTS idx_billers_linked_account_id ON billers(linked_account_id);

-- Add comment to document the purpose
COMMENT ON COLUMN billers.linked_account_id IS 'Links Loans-category billers to credit accounts for dynamic billing cycle-based amount calculation';
