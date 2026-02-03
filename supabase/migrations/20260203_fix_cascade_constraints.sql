-- Migration: Ensure payment_schedules foreign keys have ON DELETE CASCADE
-- This ensures that deleting a biller or installment automatically deletes
-- all associated payment schedules

-- First, drop existing constraints if they exist
ALTER TABLE payment_schedules
  DROP CONSTRAINT IF EXISTS payment_schedules_biller_id_fkey;

ALTER TABLE payment_schedules
  DROP CONSTRAINT IF EXISTS payment_schedules_installment_id_fkey;

ALTER TABLE payment_schedules
  DROP CONSTRAINT IF EXISTS payment_schedules_account_id_fkey;

-- Re-add constraints with proper CASCADE behavior
ALTER TABLE payment_schedules
  ADD CONSTRAINT payment_schedules_biller_id_fkey
    FOREIGN KEY (biller_id) REFERENCES billers(id) ON DELETE CASCADE;

ALTER TABLE payment_schedules
  ADD CONSTRAINT payment_schedules_installment_id_fkey
    FOREIGN KEY (installment_id) REFERENCES installments(id) ON DELETE CASCADE;

ALTER TABLE payment_schedules
  ADD CONSTRAINT payment_schedules_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;

-- Add comment explaining the cascade behavior
COMMENT ON CONSTRAINT payment_schedules_biller_id_fkey ON payment_schedules 
  IS 'Cascade delete: removing a biller removes all its payment schedules';
  
COMMENT ON CONSTRAINT payment_schedules_installment_id_fkey ON payment_schedules 
  IS 'Cascade delete: removing an installment removes all its payment schedules';
