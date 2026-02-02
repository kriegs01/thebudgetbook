-- Migration: Make installments.account_id nullable
-- Reason: Prevents "invalid input syntax for type uuid: ''" errors
-- When users create installments without selecting an account, the field should be NULL instead of empty string

-- Make account_id nullable
ALTER TABLE installments 
  ALTER COLUMN account_id DROP NOT NULL;

-- Add a comment explaining why it's nullable
COMMENT ON COLUMN installments.account_id IS 'Payment account UUID (nullable) - allows installments without a specific payment account';

-- Verification: Check if the column is now nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'installments'
      AND column_name = 'account_id'
      AND is_nullable = 'YES'
  ) THEN
    RAISE NOTICE '✓ Migration successful: installments.account_id is now nullable';
  ELSE
    RAISE WARNING '✗ Migration may have failed: installments.account_id is still NOT NULL';
  END IF;
END $$;
