-- Migration: Migrate existing biller schedules from JSONB to biller_payment_schedules table
-- This script extracts schedules from the billers.schedules JSONB column 
-- and creates individual records in the biller_payment_schedules table

-- Migrate biller schedules
-- Note: This uses jsonb_array_elements to expand the schedules array
INSERT INTO biller_payment_schedules (
  biller_id,
  month,
  year,
  expected_amount,
  amount_paid,
  paid,
  date_paid,
  receipt,
  account_id,
  created_at
)
SELECT 
  b.id AS biller_id,
  (sched->>'month')::TEXT AS month,
  (sched->>'year')::TEXT AS year,
  COALESCE((sched->>'expectedAmount')::NUMERIC, b.expected_amount) AS expected_amount,
  (sched->>'amountPaid')::NUMERIC AS amount_paid,
  CASE 
    WHEN COALESCE((sched->>'amountPaid')::NUMERIC, 0) > 0 
    THEN TRUE 
    ELSE FALSE 
  END AS paid,
  (sched->>'datePaid')::DATE AS date_paid,
  (sched->>'receipt')::TEXT AS receipt,
  (sched->>'accountId')::UUID AS account_id,
  NOW() AS created_at
FROM billers b
CROSS JOIN jsonb_array_elements(b.schedules) AS sched
WHERE b.schedules IS NOT NULL 
  AND jsonb_array_length(b.schedules) > 0
ON CONFLICT (biller_id, month, year) DO NOTHING;

-- Add comment about migration
COMMENT ON TABLE biller_payment_schedules IS 'Stores individual payment schedules for billers with explicit paid status tracking. Migrated from billers.schedules JSONB column.';
