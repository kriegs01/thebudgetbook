-- Backfill Script: Generate payment schedules for existing Billers
-- This is a ONE-OFF migration script to create payment_schedules entries
-- for all existing billers that have schedules stored in the JSON schedules field
-- 
-- IMPORTANT: Run this AFTER creating the payment_schedules table
-- IMPORTANT: This script is safe to run multiple times (idempotent)
--
-- How to run:
-- 1. Open your Supabase SQL Editor
-- 2. Copy and paste this entire script
-- 3. Click "Run" to execute
-- 4. Verify the output shows successful insertions
--
-- When to remove:
-- After confirming all production data has been backfilled successfully,
-- this script can be removed from the repository (estimated: 1-2 months after deployment)

DO $$
DECLARE
  biller_record RECORD;
  schedule_item JSONB;
  schedule_count INTEGER := 0;
  insert_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting backfill of payment schedules for Billers...';
  
  -- Loop through all billers
  FOR biller_record IN 
    SELECT id, name, schedules, timing, expected_amount
    FROM billers
    WHERE schedules IS NOT NULL
  LOOP
    RAISE NOTICE 'Processing Biller: % (ID: %)', biller_record.name, biller_record.id;
    schedule_count := 0;
    
    -- Loop through each schedule in the JSON array
    FOR schedule_item IN 
      SELECT * FROM jsonb_array_elements(biller_record.schedules)
    LOOP
      schedule_count := schedule_count + 1;
      
      -- Insert payment schedule if it doesn't already exist
      INSERT INTO payment_schedules (
        biller_id,
        installment_id,
        schedule_month,
        schedule_year,
        expected_amount,
        amount_paid,
        date_paid,
        receipt,
        account_id,
        timing
      )
      SELECT
        biller_record.id,
        NULL, -- installment_id is NULL for biller schedules
        schedule_item->>'month',
        schedule_item->>'year',
        COALESCE((schedule_item->>'expectedAmount')::NUMERIC, biller_record.expected_amount),
        (schedule_item->>'amountPaid')::NUMERIC,
        (schedule_item->>'datePaid')::DATE,
        schedule_item->>'receipt',
        (schedule_item->>'accountId')::UUID,
        biller_record.timing
      WHERE NOT EXISTS (
        -- Check if schedule already exists
        SELECT 1 FROM payment_schedules ps
        WHERE ps.biller_id = biller_record.id
          AND ps.schedule_month = schedule_item->>'month'
          AND ps.schedule_year = schedule_item->>'year'
      )
      ON CONFLICT (biller_id, schedule_month, schedule_year) DO NOTHING;
      
      -- Check if insert was successful
      IF FOUND THEN
        insert_count := insert_count + 1;
      END IF;
    END LOOP;
    
    RAISE NOTICE 'Processed % schedules for Biller: %', schedule_count, biller_record.name;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete! Created % new payment schedule records for Billers.', insert_count;
  RAISE NOTICE 'To verify, run: SELECT COUNT(*) FROM payment_schedules WHERE biller_id IS NOT NULL;';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error during backfill: % %', SQLERRM, SQLSTATE;
END $$;
