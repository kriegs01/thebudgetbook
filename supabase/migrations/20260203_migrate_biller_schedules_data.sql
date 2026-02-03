-- Migration: Migrate existing biller schedules to payment_schedules table
-- This migration extracts schedules from the JSONB array in billers table
-- and creates individual records in the payment_schedules table

-- Function to migrate biller schedules to payment_schedules table
DO $$
DECLARE
  biller_record RECORD;
  schedule_record JSONB;
  inserted_count INTEGER := 0;
  skipped_count INTEGER := 0;
BEGIN
  -- Loop through all billers
  FOR biller_record IN SELECT id, schedules FROM billers WHERE schedules IS NOT NULL LOOP
    -- Loop through each schedule in the JSONB array
    FOR schedule_record IN SELECT * FROM jsonb_array_elements(biller_record.schedules) LOOP
      -- Insert into payment_schedules table
      BEGIN
        INSERT INTO payment_schedules (
          month,
          year,
          expected_amount,
          amount_paid,
          receipt,
          date_paid,
          account_id,
          biller_id
        )
        SELECT
          schedule_record->>'month',
          CAST(schedule_record->>'year' AS INTEGER),
          CAST(schedule_record->>'expectedAmount' AS NUMERIC),
          CAST(COALESCE(schedule_record->>'amountPaid', '0') AS NUMERIC),
          schedule_record->>'receipt',
          CASE 
            WHEN schedule_record->>'datePaid' IS NOT NULL 
            THEN CAST(schedule_record->>'datePaid' AS DATE)
            ELSE NULL
          END,
          CASE 
            WHEN schedule_record->>'accountId' IS NOT NULL 
            THEN CAST(schedule_record->>'accountId' AS UUID)
            ELSE NULL
          END,
          biller_record.id
        ON CONFLICT (biller_id, month, year) DO NOTHING;
        
        -- Check if row was inserted
        IF FOUND THEN
          inserted_count := inserted_count + 1;
        ELSE
          skipped_count := skipped_count + 1;
          RAISE NOTICE 'Skipped duplicate schedule for biller % in % %', 
            biller_record.id, 
            schedule_record->>'month', 
            schedule_record->>'year';
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to migrate schedule for biller %: %', biller_record.id, SQLERRM;
          skipped_count := skipped_count + 1;
      END;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Successfully migrated % schedules, skipped % duplicates/errors', 
    inserted_count, skipped_count;
END $$;
