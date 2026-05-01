-- Add is_archived and archive_status columns to the installments table
ALTER TABLE installments
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

ALTER TABLE installments
ADD COLUMN IF NOT EXISTS archive_status TEXT;

-- Add an index on is_archived for faster filtering of active/archived items
CREATE INDEX IF NOT EXISTS idx_installments_is_archived ON installments(is_archived);

COMMENT ON COLUMN installments.is_archived IS 'Indicates if the installment is archived (completed, terminated, etc.)';
COMMENT ON COLUMN installments.archive_status IS 'The reason for archiving (e.g., completed, terminated, transferred)';

-- Also add the columns to the test table for consistency
ALTER TABLE installments_test
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

ALTER TABLE installments_test
ADD COLUMN IF NOT EXISTS archive_status TEXT;