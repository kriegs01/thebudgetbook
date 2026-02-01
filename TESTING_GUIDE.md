# Quick Start: Payment Schedules Testing Guide

This guide provides quick commands and checks to verify the payment schedules system is working correctly.

## Prerequisites

- Supabase project set up and running
- Migrations run successfully
- Application deployed

## 1. Verify Database Setup

### Check Tables Exist

```sql
-- Run in Supabase SQL Editor

-- Should return table structure
\d payment_schedules

-- Should show payment_schedule_id column
\d transactions

-- Check row counts
SELECT 
  (SELECT COUNT(*) FROM payment_schedules) as total_schedules,
  (SELECT COUNT(*) FROM payment_schedules WHERE biller_id IS NOT NULL) as biller_schedules,
  (SELECT COUNT(*) FROM payment_schedules WHERE installment_id IS NOT NULL) as installment_schedules;
```

### Verify Constraints

```sql
-- Check unique constraints
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'payment_schedules'::regclass;

-- Should show:
-- unique_biller_schedule (u)
-- unique_installment_schedule (u)
-- check_one_parent (c)
```

### Verify Indexes

```sql
-- Check indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'payment_schedules';

-- Should show at least:
-- payment_schedules_pkey
-- idx_payment_schedules_biller_id
-- idx_payment_schedules_installment_id
-- idx_payment_schedules_schedule_month_year
-- idx_payment_schedules_unpaid
```

## 2. Test Schedule Generation

### Test Creating a New Biller

```typescript
// In browser console or API test

import { createBillerFrontend } from './src/services/billersService';

const testBiller = {
  name: 'Test Utility Bill',
  category: 'Utilities',
  due_date: '2024-01-15',
  expected_amount: 1500,
  timing: '1/2',
  activation_date: { month: 'January', year: '2024' },
  status: 'active',
  schedules: []
};

const result = await createBillerFrontend(testBiller);
console.log('Biller created:', result.data);

// Then check database
// SELECT * FROM payment_schedules WHERE biller_id = '<biller-id>';
// Should see 12 schedules
```

### Test Creating a New Installment

```typescript
import { createInstallmentFrontend } from './src/services/installmentsService';

const testInstallment = {
  name: 'Test Laptop Payment',
  totalAmount: 60000,
  monthlyAmount: 5000,
  termDuration: '12',
  paidAmount: 0,
  accountId: '<account-id>',
  startDate: '2024-01',
  timing: '1/2'
};

const result = await createInstallmentFrontend(testInstallment);
console.log('Installment created:', result.data);

// Then check database
// SELECT * FROM payment_schedules WHERE installment_id = '<installment-id>';
// Should see 12 schedules
```

## 3. Test Backfill Scripts

### Verify Backfill Ran Successfully

```sql
-- Check for schedules from backfill
SELECT 
  b.name as biller_name,
  COUNT(ps.id) as schedule_count
FROM billers b
LEFT JOIN payment_schedules ps ON ps.biller_id = b.id
GROUP BY b.id, b.name
ORDER BY b.name;

-- All billers should have schedules
-- If any show 0, backfill may have failed for that biller
```

### Check Paid vs Unpaid Schedules

```sql
-- Summary of payment status
SELECT 
  COUNT(*) as total_schedules,
  COUNT(*) FILTER (WHERE amount_paid IS NOT NULL) as paid_schedules,
  COUNT(*) FILTER (WHERE amount_paid IS NULL) as unpaid_schedules,
  SUM(expected_amount) as total_expected,
  SUM(amount_paid) as total_paid
FROM payment_schedules;
```

## 4. Test Payment Processing

### Query Available Schedules

```typescript
import { 
  getPaymentSchedulesByBiller,
  getUnpaidPaymentSchedules 
} from './src/services/paymentSchedulesService';

// Get schedules for a specific biller
const { data: schedules } = await getPaymentSchedulesByBiller('<biller-id>');
console.log('Schedules:', schedules);

// Get all unpaid schedules
const { data: unpaid } = await getUnpaidPaymentSchedules();
console.log('Unpaid schedules:', unpaid);
```

### Mark Schedule as Paid

```typescript
import { markPaymentScheduleAsPaid } from './src/services/paymentSchedulesService';

const result = await markPaymentScheduleAsPaid(
  '<schedule-id>',
  1500, // amount paid
  '2024-02-01', // date paid
  '<account-id>', // account used
  'Receipt-001' // optional receipt
);

console.log('Payment recorded:', result.data);

// Verify in database
// SELECT * FROM payment_schedules WHERE id = '<schedule-id>';
// amount_paid should be 1500
```

### Create Transaction with Schedule Link

```typescript
import { createTransaction } from './src/services/transactionsService';

const result = await createTransaction({
  name: 'Test Payment',
  date: '2024-02-01',
  amount: 1500,
  payment_method_id: '<account-id>',
  payment_schedule_id: '<schedule-id>' // Links to schedule
});

console.log('Transaction created:', result.data);

// Try creating duplicate (should fail)
const duplicate = await createTransaction({
  name: 'Duplicate Payment',
  date: '2024-02-01',
  amount: 1500,
  payment_method_id: '<account-id>',
  payment_schedule_id: '<schedule-id>' // Same schedule!
});

// Should get error: unique constraint violation
console.log('Error (expected):', duplicate.error);
```

## 5. Verify Duplicate Prevention

### Test Database Constraints

```sql
-- Try to create duplicate schedule (should fail)
INSERT INTO payment_schedules (
  biller_id,
  schedule_month,
  schedule_year,
  expected_amount
)
SELECT 
  biller_id,
  schedule_month,
  schedule_year,
  expected_amount
FROM payment_schedules
WHERE biller_id IS NOT NULL
LIMIT 1;

-- Should fail with: duplicate key value violates unique constraint "unique_biller_schedule"
```

### Test Transaction Constraint

```sql
-- Try to create duplicate transaction (should fail)
INSERT INTO transactions (
  name,
  date,
  amount,
  payment_method_id,
  payment_schedule_id
)
SELECT 
  'Duplicate Test',
  NOW(),
  1000,
  payment_method_id,
  payment_schedule_id
FROM transactions
WHERE payment_schedule_id IS NOT NULL
LIMIT 1;

-- Should fail with: duplicate key value violates unique constraint "idx_transactions_unique_payment_schedule"
```

## 6. Common Verification Queries

### Find Orphaned Schedules (should be none)

```sql
SELECT ps.*
FROM payment_schedules ps
LEFT JOIN billers b ON ps.biller_id = b.id
LEFT JOIN installments i ON ps.installment_id = i.id
WHERE (ps.biller_id IS NOT NULL AND b.id IS NULL)
   OR (ps.installment_id IS NOT NULL AND i.id IS NULL);

-- Should return 0 rows
```

### Find Schedules Without Parent (should be none)

```sql
SELECT *
FROM payment_schedules
WHERE biller_id IS NULL AND installment_id IS NULL;

-- Should return 0 rows
```

### Check Payment Coverage

```sql
-- For each biller, show expected vs actual payments
SELECT 
  b.name,
  COUNT(ps.id) as total_schedules,
  COUNT(ps.amount_paid) as paid_schedules,
  SUM(ps.expected_amount) as expected_total,
  SUM(ps.amount_paid) as paid_total,
  SUM(ps.expected_amount) - COALESCE(SUM(ps.amount_paid), 0) as remaining
FROM billers b
LEFT JOIN payment_schedules ps ON ps.biller_id = b.id
GROUP BY b.id, b.name
ORDER BY b.name;
```

### Find Overdue Payments

```sql
-- Schedules that should have been paid by now
SELECT 
  b.name as biller_name,
  ps.schedule_month,
  ps.schedule_year,
  ps.expected_amount,
  ps.timing
FROM payment_schedules ps
JOIN billers b ON ps.biller_id = b.id
WHERE ps.amount_paid IS NULL
  AND (
    -- Past year
    ps.schedule_year::int < EXTRACT(YEAR FROM CURRENT_DATE)::int
    OR (
      -- Current year but past month
      ps.schedule_year::int = EXTRACT(YEAR FROM CURRENT_DATE)::int
      AND to_date(ps.schedule_month || ' 1', 'Month DD')::int < EXTRACT(MONTH FROM CURRENT_DATE)::int
    )
  )
ORDER BY ps.schedule_year, ps.schedule_month;
```

## 7. Performance Checks

### Check Index Usage

```sql
-- Run a typical query and check if it uses indexes
EXPLAIN ANALYZE
SELECT * 
FROM payment_schedules 
WHERE biller_id = '<some-biller-id>'
AND schedule_month = 'January'
AND schedule_year = '2024';

-- Should show: Index Scan using idx_payment_schedules_biller_id
```

### Check Query Speed

```sql
-- These should all be < 10ms
\timing on

SELECT COUNT(*) FROM payment_schedules WHERE biller_id IS NOT NULL;
SELECT COUNT(*) FROM payment_schedules WHERE amount_paid IS NULL;
SELECT * FROM payment_schedules WHERE biller_id = '<id>' LIMIT 10;
```

## 8. Rollback Test (Optional)

### Test Dropping and Recreating

```sql
-- CAUTION: This deletes data! Only use in test environment!

-- Drop foreign key from transactions first
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_payment_schedule_id_fkey;

-- Drop payment_schedules table
DROP TABLE IF EXISTS payment_schedules CASCADE;

-- Now re-run the migration
-- Should work without errors and recreate everything
```

## 9. Integration Test Checklist

Manual testing checklist:

- [ ] Run all migrations successfully
- [ ] Run backfill scripts successfully
- [ ] Verify billers have schedules in database
- [ ] Verify installments have schedules in database
- [ ] Create new biller → schedules auto-generated
- [ ] Create new installment → schedules auto-generated
- [ ] View biller details → schedules display correctly
- [ ] View installment details → schedules display correctly
- [ ] Mark schedule as paid → updates correctly
- [ ] Create transaction with schedule_id → succeeds
- [ ] Try duplicate transaction → fails with error
- [ ] Check payment status → displays correctly
- [ ] View transaction history → shows schedule link
- [ ] Delete biller → schedules cascade delete
- [ ] Delete installment → schedules cascade delete

## 10. Monitoring Queries

### Daily Health Check

```sql
-- Run this daily to monitor system health
SELECT 
  'Total Schedules' as metric, COUNT(*) as value FROM payment_schedules
UNION ALL
SELECT 
  'Paid Schedules', COUNT(*) FROM payment_schedules WHERE amount_paid IS NOT NULL
UNION ALL
SELECT 
  'Unpaid Schedules', COUNT(*) FROM payment_schedules WHERE amount_paid IS NULL
UNION ALL
SELECT 
  'Linked Transactions', COUNT(*) FROM transactions WHERE payment_schedule_id IS NOT NULL
UNION ALL
SELECT 
  'Orphaned Schedules', COUNT(*) 
  FROM payment_schedules ps
  LEFT JOIN billers b ON ps.biller_id = b.id
  LEFT JOIN installments i ON ps.installment_id = i.id
  WHERE (ps.biller_id IS NOT NULL AND b.id IS NULL)
     OR (ps.installment_id IS NOT NULL AND i.id IS NULL);
```

## Success Criteria

The system is working correctly if:

✅ All migrations run without errors  
✅ Backfill creates schedules for all existing items  
✅ New billers auto-generate 12 schedules  
✅ New installments auto-generate term_duration schedules  
✅ Payments can be marked as paid  
✅ Transactions link to schedules  
✅ Duplicate payments are prevented  
✅ No orphaned schedules exist  
✅ Query performance is acceptable (< 10ms)  
✅ UI displays schedules correctly  

## Troubleshooting

If something doesn't work:

1. Check Supabase logs for errors
2. Verify all migrations ran successfully
3. Check that backfill scripts completed
4. Verify foreign key relationships
5. Check unique constraints are in place
6. Review browser console for errors
7. Check network tab for API failures

## Next Steps

After successful testing:

1. ✅ Mark testing complete
2. 📝 Document any issues found
3. 🚀 Deploy to production
4. 📊 Monitor for 1 week
5. 🔄 Plan UI migration (if desired)
6. 🗑️ Schedule removal of backfill scripts (1-2 months)

---

**Last Updated:** February 1, 2026  
**Status:** Ready for Testing
