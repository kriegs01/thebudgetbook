# Payment Schedules - Testing Validation Checklist

## Pre-Deployment Verification

### ✅ 1. UNIQUE Constraint
- [x] Verified constraints exist in migration
- [x] Constraint names: `unique_biller_month_year`, `unique_installment_month_year`
- [x] Fields: `(biller_id, month, year)` and `(installment_id, month, year)`

### ✅ 2. Field Name Consistency
- [x] Service layer uses correct snake_case: `biller_id`, `month`, `year`
- [x] `upsertPaymentSchedule` onConflict matches constraint
- [x] Conversion functions map correctly between camelCase/snake_case

### ✅ 3. Payment Status Logic
- [x] Checks both `amountPaid` AND transaction existence
- [x] Shows paid when EITHER condition is true
- [x] Correctly identifies manual payments

### ✅ 4. Manual Payment UI
- [x] Added "Manually marked paid" indicator (amber)
- [x] Added "Clear" button for manual payments
- [x] Clear button calls `markPaymentScheduleAsUnpaid()`
- [x] UI updates after clearing

### ✅ 5. Legacy Code Removal
- [x] No `.schedules` arrays in pages
- [x] Removed from Biller type
- [x] All schedule data from payment_schedules table

## Manual Testing Scenarios

### Test 1: Create Biller → Schedules Generated
**Steps**:
1. Go to Billers page
2. Click "Add Biller"
3. Fill form:
   - Name: "Test Electric"
   - Category: "Utilities"
   - Amount: 1500
   - Due Date: 15
   - Activation: Current month/year
4. Save

**Expected**:
- [ ] Biller created successfully
- [ ] 12 schedules in payment_schedules table
- [ ] Each has correct biller_id
- [ ] Schedules span 12 consecutive months
- [ ] No duplicate errors

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

### Test 2: Create Installment → Schedules Generated
**Steps**:
1. Go to Installments page
2. Click "Add Installment"
3. Fill form:
   - Name: "Test Loan"
   - Total: 12000
   - Monthly: 1000
   - Term: 12 months
   - Start: Current month/year
4. Save

**Expected**:
- [ ] Installment created successfully
- [ ] 12 schedules in payment_schedules table
- [ ] Each has correct installment_id
- [ ] Schedules span 12 months from start
- [ ] No duplicate errors

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

### Test 3: Pay Schedule → Status Updates
**Steps**:
1. View biller details (Test Electric)
2. Click "Pay" on first schedule
3. Enter payment details
4. Submit

**Expected**:
- [ ] Transaction created
- [ ] Schedule amountPaid updated
- [ ] Shows green checkmark
- [ ] NO "Manually marked paid" label
- [ ] NO "Clear" button

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

### Test 4: Delete Transaction → Status Clears
**Steps**:
1. With paid schedule from Test 3
2. Go to Transactions page
3. Find and delete the transaction

**Expected**:
- [ ] Transaction deleted
- [ ] Schedule amountPaid cleared to 0
- [ ] Status shows "Unpaid"
- [ ] "Pay" button appears
- [ ] Green checkmark gone

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

### Test 5: Manual Payment → Clear Works
**Steps**:
1. Manually set amountPaid via API or direct DB update
   ```sql
   UPDATE payment_schedules 
   SET amount_paid = 1500 
   WHERE id = 'schedule-id';
   ```
2. View biller details
3. Observe paid schedule
4. Click "Clear" button

**Expected Before Clear**:
- [ ] Green checkmark visible
- [ ] "Manually marked paid" label (amber)
- [ ] "Clear" button visible

**Expected After Clear**:
- [ ] amountPaid cleared to 0
- [ ] Status shows "Unpaid"
- [ ] "Pay" button appears
- [ ] Labels and checkmark gone

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

### Test 6: Duplicate Prevention
**Steps**:
1. Try to create duplicate schedule via upsert:
   ```typescript
   await upsertPaymentSchedule({
     month: "January",
     year: 2026,
     expected_amount: 1500,
     biller_id: "existing-biller-id",
     // ... other fields
   });
   ```
2. Call same upsert again

**Expected**:
- [ ] First call creates schedule
- [ ] Second call updates existing (no error)
- [ ] Only ONE schedule exists for that month/year/biller
- [ ] No duplicate constraint violation

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

### Test 7: Budget Page → Uses Live Data
**Steps**:
1. Go to Budget page
2. Create budget setup for current month
3. Add billers to setup
4. Pay one via Budget interface

**Expected**:
- [ ] Payment creates transaction
- [ ] Payment updates schedule
- [ ] Status reflects in Budget view
- [ ] Status reflects in Billers view
- [ ] No stale data

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

### Test 8: Installment Details → Uses Live Data
**Steps**:
1. View installment details
2. Check payment schedule display
3. Mark payment
4. Verify status updates

**Expected**:
- [ ] Schedules loaded from payment_schedules
- [ ] Status calculation correct
- [ ] Updates reflect immediately
- [ ] No embedded arrays used

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

## Code Quality Checks

### Build & Compilation
- [x] `npm run build` succeeds
- [x] No TypeScript errors
- [x] No console warnings

### Security
- [x] CodeQL scan passes
- [x] No SQL injection vectors
- [x] Proper input validation

### Performance
- [ ] Schedule queries use indexes
- [ ] No N+1 query problems
- [ ] Reasonable load times

## Database Verification

### Check Unique Constraints
```sql
-- Verify constraints exist
SELECT 
  conname, 
  contype, 
  pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'payment_schedules'::regclass
  AND contype = 'u';
```

**Expected Output**:
- `unique_biller_month_year` → UNIQUE (biller_id, month, year)
- `unique_installment_month_year` → UNIQUE (installment_id, month, year)

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

### Check Foreign Keys Cascade
```sql
-- Verify CASCADE constraints
SELECT 
  conname, 
  confdeltype,
  pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'payment_schedules'::regclass
  AND contype = 'f';
```

**Expected Output**:
- `payment_schedules_biller_id_fkey` → ON DELETE CASCADE
- `payment_schedules_installment_id_fkey` → ON DELETE CASCADE

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

### Check Schedule Creation
```sql
-- Count schedules for a test biller
SELECT 
  biller_id,
  COUNT(*) as schedule_count,
  MIN(year) as first_year,
  MAX(year) as last_year
FROM payment_schedules
WHERE biller_id = 'test-biller-id'
GROUP BY biller_id;
```

**Expected Output**:
- `schedule_count` = 12
- Year range covers 12 consecutive months

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

## Regression Testing

### Test 9: Existing Billers Still Work
**Steps**:
1. View existing biller from before refactor
2. Check schedules load
3. Try to pay
4. Verify behavior

**Expected**:
- [ ] Old billers display correctly
- [ ] Schedules load from payment_schedules
- [ ] Payment works normally
- [ ] No breaking changes

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

### Test 10: Existing Installments Still Work
**Steps**:
1. View existing installment
2. Check schedules load
3. Verify payment tracking
4. Check status calculation

**Expected**:
- [ ] Old installments work
- [ ] Schedules load correctly
- [ ] Status accurate
- [ ] No errors

**Actual**: ________________

**Status**: [ ] PASS [ ] FAIL

---

## Final Verification

### All Tests Must Pass
- [ ] All 10 tests completed
- [ ] All tests marked PASS
- [ ] No FAIL results
- [ ] Database checks verified
- [ ] Code quality verified

### Sign-Off
- [ ] Tested by: ________________
- [ ] Date: ________________
- [ ] Build version: ________________
- [ ] Database version: ________________

### Issues Found (if any)
```
Issue 1: ________________
Status: ________________

Issue 2: ________________
Status: ________________
```

### Deployment Approval
- [ ] All tests PASS
- [ ] All issues resolved
- [ ] Documentation complete
- [ ] Ready for production

**Approved by**: ________________
**Date**: ________________

---

## Post-Deployment Monitoring

### Day 1
- [ ] No error logs related to payment schedules
- [ ] No duplicate constraint violations
- [ ] Payment creation working
- [ ] Transaction deletion working

### Day 7
- [ ] No recurring issues
- [ ] Performance acceptable
- [ ] User feedback positive
- [ ] No rollback needed

---

**Testing Checklist Version**: 1.0
**Last Updated**: 2026-02-03
**Status**: Ready for Testing
