-- Migration script to transfer legacy schedule data from billers.schedules JSONB to payment_schedules table
-- This script is idempotent - it checks for existing records before inserting

DO $$
DECLARE
  biller_record RECORD;
  schedule_item JSONB;
  schedule_month TEXT;
  schedule_year TEXT;
  schedule_expected_amount NUMERIC;
  schedule_amount_paid NUMERIC;
  schedule_receipt TEXT;
  schedule_date_paid DATE;
  schedule_account_id UUID;
  existing_count INTEGER;
BEGIN
  -- Loop through all billers
  FOR biller_record IN 
    SELECT id, name, schedules 
    FROM billers 
    WHERE schedules IS NOT NULL 
      AND jsonb_array_length(schedules) > 0
  LOOP
    RAISE NOTICE 'Processing biller: % (ID: %)', biller_record.name, biller_record.id;
    
    -- Loop through each schedule in the JSONB array
    FOR schedule_item IN 
      SELECT * FROM jsonb_array_elements(biller_record.schedules)
    LOOP
      -- Extract schedule fields (id is not used in migration)
      schedule_month := schedule_item->>'month';
      schedule_year := schedule_item->>'year';
      schedule_expected_amount := (schedule_item->>'expectedAmount')::NUMERIC;
      
      -- Handle optional fields with null checks
      schedule_amount_paid := NULLIF(schedule_item->>'amountPaid', '')::NUMERIC;
      schedule_receipt := NULLIF(schedule_item->>'receipt', '');
      schedule_date_paid := NULLIF(schedule_item->>'datePaid', '')::DATE;
      schedule_account_id := NULLIF(schedule_item->>'accountId', '')::UUID;
      
      -- Check if this schedule already exists in payment_schedules
      SELECT COUNT(*) INTO existing_count
      FROM payment_schedules
      WHERE biller_id = biller_record.id
        AND schedule_month = schedule_month
        AND schedule_year = schedule_year;
      
      -- Only insert if it doesn't exist (idempotent)
      IF existing_count = 0 THEN
        INSERT INTO payment_schedules (
          biller_id,
          schedule_month,
          schedule_year,
          expected_amount,
          amount_paid,
          receipt,
          date_paid,
          account_id
        ) VALUES (
          biller_record.id,
          schedule_month,
          schedule_year,
          schedule_expected_amount,
          schedule_amount_paid,
          schedule_receipt,
          schedule_date_paid,
          schedule_account_id
        );
        
        RAISE NOTICE '  - Inserted schedule: % %', schedule_month, schedule_year;
      ELSE
        RAISE NOTICE '  - Skipped existing schedule: % %', schedule_month, schedule_year;
      END IF;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Migration completed successfully';
END $$;

-- Verify migration by comparing counts
DO $$
DECLARE
  jsonb_schedules_count INTEGER;
  table_schedules_count INTEGER;
BEGIN
  -- Count schedules in JSONB
  SELECT SUM(jsonb_array_length(schedules))::INTEGER INTO jsonb_schedules_count
  FROM billers
  WHERE schedules IS NOT NULL;
  
  -- Count schedules in payment_schedules table
  SELECT COUNT(*)::INTEGER INTO table_schedules_count
  FROM payment_schedules;
  
  RAISE NOTICE 'Verification:';
  RAISE NOTICE '  - Total schedules in billers.schedules JSONB: %', COALESCE(jsonb_schedules_count, 0);
  RAISE NOTICE '  - Total schedules in payment_schedules table: %', COALESCE(table_schedules_count, 0);
  
  IF COALESCE(jsonb_schedules_count, 0) = COALESCE(table_schedules_count, 0) THEN
    RAISE NOTICE '  - ✓ Migration successful: counts match';
  ELSE
    RAISE WARNING '  - ⚠ Warning: counts do not match. Please review.';
  END IF;
END $$;
