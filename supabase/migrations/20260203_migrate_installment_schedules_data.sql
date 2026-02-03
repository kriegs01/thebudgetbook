-- Migration: Generate installment payment schedules
-- This script generates payment schedules for existing installments based on:
-- - start_date: Starting month/year for the installment
-- - term_duration: Number of months for the installment
-- - monthly_amount: Amount for each payment

-- Function to generate installment payment schedules
CREATE OR REPLACE FUNCTION generate_installment_payment_schedules()
RETURNS void AS $$
DECLARE
  inst_record RECORD;
  term_months INTEGER;
  start_year INTEGER;
  start_month INTEGER;
  payment_num INTEGER;
  payment_date DATE;
  month_names TEXT[] := ARRAY['January', 'February', 'March', 'April', 'May', 'June', 
                               'July', 'August', 'September', 'October', 'November', 'December'];
BEGIN
  -- Loop through all installments that have a start_date
  FOR inst_record IN 
    SELECT id, start_date, term_duration, monthly_amount, paid_amount, account_id
    FROM installments
    WHERE start_date IS NOT NULL
  LOOP
    -- Extract term duration (assumes format like "12 months" or just "12")
    term_months := (regexp_replace(inst_record.term_duration::TEXT, '[^0-9]', '', 'g'))::INTEGER;
    
    -- Parse start date (YYYY-MM format)
    start_year := EXTRACT(YEAR FROM inst_record.start_date::DATE);
    start_month := EXTRACT(MONTH FROM inst_record.start_date::DATE);
    
    -- Generate payment schedule for each month
    FOR payment_num IN 1..term_months LOOP
      -- Calculate payment date
      payment_date := (inst_record.start_date::DATE + INTERVAL '1 month' * (payment_num - 1));
      
      -- Calculate if this payment should be marked as paid based on paid_amount
      -- Assume payments are made sequentially from the first payment
      DECLARE
        is_paid BOOLEAN;
        payments_made INTEGER;
      BEGIN
        -- Calculate how many full payments have been made
        IF inst_record.paid_amount >= inst_record.monthly_amount THEN
          payments_made := FLOOR(inst_record.paid_amount / inst_record.monthly_amount);
        ELSE
          payments_made := 0;
        END IF;
        
        -- Mark as paid if this payment number is within the paid count
        is_paid := payment_num <= payments_made;
        
        -- Insert payment schedule
        INSERT INTO installment_payment_schedules (
          installment_id,
          payment_number,
          month,
          year,
          expected_amount,
          amount_paid,
          paid,
          date_paid,
          account_id,
          due_date,
          created_at
        )
        VALUES (
          inst_record.id,
          payment_num,
          month_names[EXTRACT(MONTH FROM payment_date)::INTEGER],
          EXTRACT(YEAR FROM payment_date)::TEXT,
          inst_record.monthly_amount,
          CASE WHEN is_paid THEN inst_record.monthly_amount ELSE NULL END,
          is_paid,
          CASE WHEN is_paid THEN payment_date ELSE NULL END,
          inst_record.account_id,
          payment_date,
          NOW()
        )
        ON CONFLICT (installment_id, payment_number) DO NOTHING;
      END;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the function to generate schedules
SELECT generate_installment_payment_schedules();

-- Clean up the function (optional - comment out if you want to keep it)
DROP FUNCTION IF EXISTS generate_installment_payment_schedules();

-- Add comment about migration
COMMENT ON TABLE installment_payment_schedules IS 'Stores individual payment schedules for installments with explicit paid status tracking. Generated from installment start_date, term_duration, and paid_amount.';
