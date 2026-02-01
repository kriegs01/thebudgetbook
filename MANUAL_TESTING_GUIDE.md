# Payment Schedules System - Manual Testing Guide

This guide provides step-by-step instructions for manually testing the payment schedules system.

## Prerequisites

1. Database migrations must be run:
   - `20260201_create_payment_schedules_table.sql`
   - `20260201_add_payment_schedule_id_to_transactions.sql`

2. Application must be running (either dev or production)

## Test Scenario 1: Biller Creation and Schedule Generation

### Objective
Verify that creating a biller automatically generates 24 months of payment schedules.

### Steps

1. **Navigate to Billers page**
   - Click on "Billers" in the navigation

2. **Add a new biller**
   - Click the "Add Biller" button (+ icon)
   - Fill in the form:
     - Name: "Test Electric Bill"
     - Category: "Utilities"
     - Expected Amount: 2500
     - Due Date: 15
     - Activation Date: January 2026
   - Click "Add Biller"

3. **Verify in Database**
   - Open Supabase SQL Editor
   - Run query:
     ```sql
     SELECT * FROM payment_schedules 
     WHERE biller_id = (SELECT id FROM billers WHERE name = 'Test Electric Bill')
     ORDER BY schedule_month;
     ```
   - **Expected Result**: Should see 24 rows with schedule_month from 2026-01 to 2027-12

4. **Verify in UI**
   - Click on the newly created biller to view details
   - Should see a schedule table with months listed
   - **Expected Result**: All months should show "Pay" button (not paid yet)

### Success Criteria
- ✅ 24 payment schedules created in database
- ✅ All schedules have correct biller_id
- ✅ schedule_month values are sequential and correct
- ✅ expected_amount matches biller's expected amount

---

## Test Scenario 2: Installment Creation and Schedule Generation

### Objective
Verify that creating an installment generates schedules based on term duration.

### Steps

1. **Navigate to Installments page**
   - Click on "Installments" in the navigation

2. **Add a new installment**
   - Click the "Add Installment" button (+ icon)
   - Fill in the form:
     - Name: "Test Laptop Payment"
     - Total Amount: 36000
     - Monthly Amount: 3000
     - Term Duration: 12 months
     - Start Date: 2026-01
     - Account: (select any account)
   - Click "Add Installment"

3. **Verify in Database**
   - Open Supabase SQL Editor
   - Run query:
     ```sql
     SELECT * FROM payment_schedules 
     WHERE installment_id = (SELECT id FROM installments WHERE name = 'Test Laptop Payment')
     ORDER BY schedule_month;
     ```
   - **Expected Result**: Should see 12 rows with schedule_month from 2026-01 to 2026-12

4. **Verify in UI**
   - View the newly created installment
   - **Expected Result**: Should show 0 of 36000 paid

### Success Criteria
- ✅ 12 payment schedules created in database
- ✅ All schedules have correct installment_id
- ✅ schedule_month values start from start_date
- ✅ expected_amount matches monthly_amount

---

## Test Scenario 3: Making a Payment with Schedule ID

### Objective
Verify that making a payment creates a transaction with payment_schedule_id.

### Steps

1. **Navigate to Billers page**
   - Find the "Test Electric Bill" created earlier
   - Click to view details

2. **Make a payment**
   - Click "Pay" button for January 2026
   - Fill in payment form:
     - Amount Paid: 2500
     - Date Paid: (select any date)
     - Account: (select any account)
   - Click "Submit Payment"

3. **Verify Success Message**
   - **Expected Result**: "Payment recorded successfully!" alert

4. **Verify in Database**
   - Run query:
     ```sql
     SELECT t.*, ps.schedule_month, ps.expected_amount
     FROM transactions t
     JOIN payment_schedules ps ON t.payment_schedule_id = ps.id
     WHERE ps.biller_id = (SELECT id FROM billers WHERE name = 'Test Electric Bill')
       AND ps.schedule_month = '2026-01';
     ```
   - **Expected Result**: Should see 1 transaction with payment_schedule_id set

5. **Verify in UI**
   - Refresh the biller details page
   - **Expected Result**: January 2026 should show checkmark (paid status)

### Success Criteria
- ✅ Transaction created with payment_schedule_id
- ✅ UI shows payment as completed
- ✅ Transaction amount matches expected amount

---

## Test Scenario 4: Duplicate Payment Prevention

### Objective
Verify that attempting to pay the same schedule twice is prevented.

### Steps

1. **Navigate to paid biller schedule**
   - Go to "Test Electric Bill" details
   - Find January 2026 (should already be paid from Test Scenario 3)

2. **Attempt second payment**
   - If "Pay" button is still visible (due to caching), click it
   - OR manually create a second transaction via Supabase SQL Editor:
     ```sql
     -- Get the schedule ID
     SELECT id FROM payment_schedules 
     WHERE biller_id = (SELECT id FROM billers WHERE name = 'Test Electric Bill')
       AND schedule_month = '2026-01';
     
     -- Try to insert duplicate transaction (should fail)
     INSERT INTO transactions (name, date, amount, payment_method_id, payment_schedule_id)
     VALUES (
       'Test Duplicate',
       NOW(),
       2500,
       (SELECT id FROM accounts LIMIT 1),
       'paste-schedule-id-here'
     );
     ```

3. **Verify Error**
   - **Expected Result in UI**: Alert saying "A payment has already been recorded for this schedule"
   - **Expected Result in DB**: Error message about unique constraint violation
   - Error code: 23505 (unique_violation)

### Success Criteria
- ✅ Second payment attempt is blocked
- ✅ User receives clear error message
- ✅ Database constraint prevents duplicate

---

## Test Scenario 5: Installment Payment Flow

### Objective
Verify that installment payments correctly link to schedules.

### Steps

1. **Navigate to Installments page**
   - Find "Test Laptop Payment"
   - Click "Pay" button

2. **Make first payment**
   - Amount Paid: 3000
   - Date Paid: (select date)
   - Account: (select account)
   - Click "Submit Payment"

3. **Verify in Database**
   - Run query:
     ```sql
     SELECT t.*, ps.schedule_month
     FROM transactions t
     JOIN payment_schedules ps ON t.payment_schedule_id = ps.id
     WHERE ps.installment_id = (SELECT id FROM installments WHERE name = 'Test Laptop Payment')
     ORDER BY ps.schedule_month;
     ```
   - **Expected Result**: 1 transaction for 2026-01 schedule

4. **Verify paid amount updated**
   - Check installment details
   - **Expected Result**: Paid Amount should be 3000

5. **Make second payment**
   - Click "Pay" button again
   - Amount Paid: 3000
   - Submit payment
   - **Expected Result**: Should create transaction for 2026-02 schedule

### Success Criteria
- ✅ First payment links to first schedule month
- ✅ Second payment links to second schedule month
- ✅ Paid amount increments correctly
- ✅ No duplicate payment errors

---

## Test Scenario 6: Legacy Data (No Payment Schedules)

### Objective
Verify graceful handling when payment schedules don't exist.

### Steps

1. **Create a biller manually in database** (bypassing service layer)
   ```sql
   INSERT INTO billers (name, category, due_date, expected_amount, timing, activation_date, status, schedules)
   VALUES (
     'Legacy Biller',
     'Utilities',
     '10',
     1000,
     '1/2',
     '{"month": "January", "year": "2026"}'::jsonb,
     'active',
     '[]'::jsonb
   );
   ```

2. **Attempt to pay legacy biller**
   - Navigate to billers page
   - Find "Legacy Biller"
   - Click to view details
   - Click "Pay" on any month

3. **Verify Error Handling**
   - **Expected Result**: Alert saying "Payment schedule not found. This may be a legacy biller."
   - Payment modal should stay open
   - User can cancel and try again

### Success Criteria
- ✅ Graceful error message for missing schedules
- ✅ No application crash
- ✅ User can cancel operation

---

## Database Verification Queries

### Check Schedule Generation
```sql
-- Count schedules per biller
SELECT 
  b.name,
  COUNT(ps.id) as schedule_count
FROM billers b
LEFT JOIN payment_schedules ps ON ps.biller_id = b.id
GROUP BY b.name
ORDER BY b.name;

-- Count schedules per installment
SELECT 
  i.name,
  COUNT(ps.id) as schedule_count
FROM installments i
LEFT JOIN payment_schedules ps ON ps.installment_id = i.id
GROUP BY i.name
ORDER BY i.name;
```

### Check Payment Linkage
```sql
-- Transactions with schedule info
SELECT 
  t.name as transaction_name,
  t.amount,
  t.date,
  ps.schedule_month,
  COALESCE(b.name, i.name) as biller_or_installment
FROM transactions t
JOIN payment_schedules ps ON t.payment_schedule_id = ps.id
LEFT JOIN billers b ON ps.biller_id = b.id
LEFT JOIN installments i ON ps.installment_id = i.id
ORDER BY t.date DESC;
```

### Check for Duplicates
```sql
-- Should return 0 rows (no duplicates)
SELECT payment_schedule_id, COUNT(*) as count
FROM transactions
WHERE payment_schedule_id IS NOT NULL
GROUP BY payment_schedule_id
HAVING COUNT(*) > 1;
```

### Check Unpaid Schedules
```sql
-- Unpaid schedules for current/future months
SELECT 
  COALESCE(b.name, i.name) as name,
  ps.schedule_month,
  ps.expected_amount,
  CASE WHEN t.id IS NULL THEN 'Unpaid' ELSE 'Paid' END as status
FROM payment_schedules ps
LEFT JOIN billers b ON ps.biller_id = b.id
LEFT JOIN installments i ON ps.installment_id = i.id
LEFT JOIN transactions t ON t.payment_schedule_id = ps.id
WHERE ps.schedule_month >= TO_CHAR(NOW(), 'YYYY-MM')
ORDER BY ps.schedule_month, name;
```

---

## Cleanup After Testing

To remove test data:

```sql
-- Delete test biller and its schedules (cascades)
DELETE FROM billers WHERE name = 'Test Electric Bill';

-- Delete test installment and its schedules (cascades)
DELETE FROM installments WHERE name = 'Test Laptop Payment';

-- Delete test transactions (optional - may be useful to keep for audit)
-- DELETE FROM transactions WHERE name LIKE 'Test%';
```

---

## Troubleshooting

### Issue: No schedules generated
**Possible Causes:**
- Migrations not run
- JavaScript error in service
- Database connection issue

**Solution:**
1. Check browser console for errors
2. Check Supabase logs
3. Verify migrations are applied
4. Check `payment_schedules` table exists

### Issue: "Payment schedule not found" error
**Possible Causes:**
- Legacy data without schedules
- Wrong schedule_month format
- Biller/installment deleted

**Solution:**
1. Regenerate schedules using service functions
2. Check schedule_month format (should be YYYY-MM)
3. Verify biller/installment still exists

### Issue: Duplicate payment succeeds
**Possible Causes:**
- Unique constraint not created
- payment_schedule_id is null
- Different schedule being used

**Solution:**
1. Verify unique index exists: `idx_transactions_unique_payment_schedule`
2. Check transaction has non-null payment_schedule_id
3. Verify correct schedule is being selected

---

## Expected Test Results Summary

| Test Scenario | Expected Outcome | Pass/Fail |
|--------------|------------------|-----------|
| Biller creation generates 24 schedules | ✅ 24 schedules created | ☐ |
| Installment creation generates N schedules | ✅ N schedules created | ☐ |
| Payment creates transaction with schedule_id | ✅ Transaction linked | ☐ |
| Duplicate payment is prevented | ✅ Error message shown | ☐ |
| Installment payments link correctly | ✅ Sequential schedules | ☐ |
| Legacy data handled gracefully | ✅ Error message shown | ☐ |

All tests should pass (✅) for the system to be considered working correctly.
