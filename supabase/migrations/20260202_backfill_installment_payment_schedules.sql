-- Migration script to backfill payment_schedules for existing installments
-- This creates payment schedule rows for all installments that don't have them yet
-- This script is idempotent - it checks for existing records before inserting

DO $$
DECLARE
  installment_record RECORD;
  schedule_count INTEGER;
  total_installments INTEGER := 0;
  total_schedules_created INTEGER := 0;
  current_month INTEGER;
  current_year INTEGER;
  schedule_date DATE;
  month_name TEXT;
  month_names TEXT[] := ARRAY['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
BEGIN
  RAISE NOTICE 'Starting backfill of payment_schedules for installments...';
  RAISE NOTICE '';
  
  -- Loop through all installments
  FOR installment_record IN 
    SELECT id, name, start_date, term_duration, monthly_amount
    FROM installments
    WHERE start_date IS NOT NULL AND term_duration > 0
    ORDER BY name
  LOOP
    total_installments := total_installments + 1;
    RAISE NOTICE 'Processing installment: % (ID: %)', installment_record.name, installment_record.id;
    RAISE NOTICE '  Start date: %, Term: % months, Monthly: %', 
      installment_record.start_date, installment_record.term_duration, installment_record.monthly_amount;
    
    -- Extract starting month and year from start_date
    current_month := EXTRACT(MONTH FROM installment_record.start_date);
    current_year := EXTRACT(YEAR FROM installment_record.start_date);
    
    schedule_count := 0;
    
    -- Generate schedules for the full term
    FOR i IN 0..(installment_record.term_duration - 1) LOOP
      -- Calculate the schedule date
      schedule_date := installment_record.start_date + (i || ' months')::INTERVAL;
      current_month := EXTRACT(MONTH FROM schedule_date);
      current_year := EXTRACT(YEAR FROM schedule_date);
      month_name := month_names[current_month];
      
      -- Check if this schedule already exists
      IF NOT EXISTS (
        SELECT 1 FROM payment_schedules
        WHERE installment_id = installment_record.id
          AND schedule_month = month_name
          AND schedule_year = current_year::TEXT
      ) THEN
        -- Insert the payment schedule
        INSERT INTO payment_schedules (
          installment_id,
          biller_id,
          schedule_month,
          schedule_year,
          expected_amount,
          amount_paid,
          receipt,
          date_paid,
          account_id
        ) VALUES (
          installment_record.id,
          NULL, -- installments don't have biller_id
          month_name,
          current_year::TEXT,
          installment_record.monthly_amount,
          NULL, -- not paid yet
          NULL,
          NULL,
          NULL
        );
        
        schedule_count := schedule_count + 1;
        total_schedules_created := total_schedules_created + 1;
      END IF;
    END LOOP;
    
    IF schedule_count > 0 THEN
      RAISE NOTICE '  ✓ Created % schedules', schedule_count;
    ELSE
      RAISE NOTICE '  → All schedules already exist';
    END IF;
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'BACKFILL STATISTICS:';
  RAISE NOTICE '  - Total installments processed: %', total_installments;
  RAISE NOTICE '  - Total schedules created: %', total_schedules_created;
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';
  
  IF total_schedules_created = 0 THEN
    RAISE NOTICE '✓ No new schedules needed - all installments already have payment schedules';
  ELSE
    RAISE NOTICE '✓ Successfully backfilled % payment schedules', total_schedules_created;
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error during backfill: %', SQLERRM;
END $$;

-- Verification: Check installment payment schedule coverage
DO $$
DECLARE
  installments_count INTEGER;
  installments_with_schedules INTEGER;
  total_schedules INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'VERIFICATION:';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  
  -- Count total installments
  SELECT COUNT(*) INTO installments_count
  FROM installments
  WHERE start_date IS NOT NULL AND term_duration > 0;
  
  -- Count installments that have payment schedules
  SELECT COUNT(DISTINCT installment_id) INTO installments_with_schedules
  FROM payment_schedules
  WHERE installment_id IS NOT NULL;
  
  -- Count total payment schedules for installments
  SELECT COUNT(*) INTO total_schedules
  FROM payment_schedules
  WHERE installment_id IS NOT NULL;
  
  RAISE NOTICE '  - Total installments: %', installments_count;
  RAISE NOTICE '  - Installments with schedules: %', installments_with_schedules;
  RAISE NOTICE '  - Total payment schedules: %', total_schedules;
  
  IF installments_count = installments_with_schedules THEN
    RAISE NOTICE '  ✓ All installments have payment schedules';
  ELSE
    RAISE WARNING '  ⚠ Some installments may be missing schedules';
    RAISE NOTICE '  Check installments without start_date or with term_duration = 0';
  END IF;
  
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
