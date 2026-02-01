-- Test script to verify payment_schedules table exists and is working
-- Run this in Supabase SQL Editor

-- 1. Check if payment_schedules table exists
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'payment_schedules'
ORDER BY ordinal_position;

-- 2. Check if transactions has payment_schedule_id column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'transactions'
  AND column_name = 'payment_schedule_id';

-- 3. Check constraints on payment_schedules
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'payment_schedules';

-- 4. Check if any payment schedules exist
SELECT COUNT(*) as total_schedules,
       COUNT(DISTINCT biller_id) as billers_with_schedules,
       COUNT(DISTINCT installment_id) as installments_with_schedules
FROM payment_schedules;

-- 5. Sample of existing schedules (if any)
SELECT ps.id, 
       ps.schedule_month,
       ps.expected_amount,
       COALESCE(b.name, i.name) as entity_name,
       CASE 
         WHEN ps.biller_id IS NOT NULL THEN 'Biller'
         WHEN ps.installment_id IS NOT NULL THEN 'Installment'
       END as entity_type
FROM payment_schedules ps
LEFT JOIN billers b ON ps.biller_id = b.id
LEFT JOIN installments i ON ps.installment_id = i.id
ORDER BY ps.schedule_month DESC
LIMIT 10;

-- 6. Check recent billers to see if they should have schedules
SELECT b.id, 
       b.name, 
       b.activation_date,
       COUNT(ps.id) as schedule_count
FROM billers b
LEFT JOIN payment_schedules ps ON ps.biller_id = b.id
GROUP BY b.id, b.name, b.activation_date
ORDER BY b.name
LIMIT 10;
