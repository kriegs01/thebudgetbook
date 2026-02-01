-- Backfill Script: Generate payment schedules for existing Installments
-- This is a ONE-OFF migration script to create payment_schedules entries
-- for all existing installments based on their start_date and term_duration
-- 
-- IMPORTANT: Run this AFTER creating the payment_schedules table
-- IMPORTANT: Run this AFTER backfilling Biller schedules
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
  installment_record RECORD;
  month_offset INTEGER;
  schedule_month TEXT;
  schedule_year TEXT;
  schedule_date DATE;
  insert_count INTEGER := 0;
  total_schedules INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting backfill of payment schedules for Installments...';
  
  -- Loop through all installments
  FOR installment_record IN 
    SELECT 
      id, 
      name, 
      monthly_amount, 
      term_duration,
      timing,
      start_date,
      paid_amount,
      total_amount
    FROM installments
    WHERE start_date IS NOT NULL -- Only process installments with a start date
  LOOP
    RAISE NOTICE 'Processing Installment: % (ID: %)', installment_record.name, installment_record.id;
    
    -- Generate schedules for each month of the term
    FOR month_offset IN 0..(installment_record.term_duration - 1)
    LOOP
      -- Calculate the schedule date
      schedule_date := installment_record.start_date + (month_offset || ' months')::INTERVAL;
      schedule_month := TO_CHAR(schedule_date, 'Month');
      schedule_month := TRIM(schedule_month); -- Remove trailing spaces
      schedule_year := TO_CHAR(schedule_date, 'YYYY');
      
      total_schedules := total_schedules + 1;
      
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
        NULL, -- biller_id is NULL for installment schedules
        installment_record.id,
        schedule_month,
        schedule_year,
        installment_record.monthly_amount,
        NULL, -- amount_paid will be NULL initially; actual payment data needs manual reconciliation
        NULL, -- date_paid will be NULL initially
        NULL, -- receipt will be NULL initially
        NULL, -- account_id will be NULL initially
        installment_record.timing
      WHERE NOT EXISTS (
        -- Check if schedule already exists
        SELECT 1 FROM payment_schedules ps
        WHERE ps.installment_id = installment_record.id
          AND ps.schedule_month = schedule_month
          AND ps.schedule_year = schedule_year
      )
      ON CONFLICT (installment_id, schedule_month, schedule_year) DO NOTHING;
      
      -- Check if insert was successful
      IF FOUND THEN
        insert_count := insert_count + 1;
      END IF;
    END LOOP;
    
    RAISE NOTICE 'Generated % schedules for Installment: %', installment_record.term_duration, installment_record.name;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete! Created % new payment schedule records for Installments.', insert_count;
  RAISE NOTICE 'Total schedules processed: %', total_schedules;
  RAISE NOTICE 'To verify, run: SELECT COUNT(*) FROM payment_schedules WHERE installment_id IS NOT NULL;';
  RAISE NOTICE '';
  RAISE NOTICE 'NOTE: Installment payment history (amount_paid, date_paid) needs manual reconciliation.';
  RAISE NOTICE 'The paid_amount on installments table represents cumulative payments but does not';
  RAISE NOTICE 'specify which monthly schedules were paid. Please review and update schedules accordingly.';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error during backfill: % %', SQLERRM, SQLSTATE;
END $$;
