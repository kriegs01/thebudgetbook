# Manual Testing Guide - Blocking Issues Fix

## Prerequisites
1. Ensure database migrations have been run (payment_schedules table exists)
2. Have at least one account created in the system
3. Have some test transactions in the system

## Test Suite 1: Schedule Generation on Biller Creation

### Test 1.1: Create Biller and Verify Schedules
**Expected Duration**: 2 minutes

**Steps**:
1. Navigate to the Billers page
2. Click the "Add Biller" button
3. Fill in the form:
   - Name: "Test Electric Bill"
   - Category: "Utilities"
   - Expected Amount: 1500
   - Due Date: 15
   - Activation Month: Current month
   - Activation Year: Current year
4. Click "Save"

**Expected Results**:
- ✅ Biller is created successfully
- ✅ Success message or redirect occurs
- ✅ Console logs show: "Creating payment schedules for new biller"
- ✅ Console logs show: "Successfully created 12 payment schedules"

### Test 1.2: View Generated Schedules
**Steps**:
1. From the Billers list, click on the biller you just created
2. View the biller details page

**Expected Results**:
- ✅ 12 monthly schedules are displayed in a table
- ✅ Schedules start from activation month
- ✅ Each schedule shows:
  - Month name (e.g., "January", "February")
  - Expected amount (1500)
  - Status: "Unpaid" with "Pay" button
- ✅ Schedules span 12 consecutive months (handling year boundaries)

**Screenshot**: Take a screenshot of the biller details page showing all 12 schedules

### Test 1.3: Year Boundary Handling
**Steps**:
1. Create another biller with:
   - Name: "Year Boundary Test"
   - Activation Month: November
   - Current Year
2. View the biller details

**Expected Results**:
- ✅ First schedule is for November (current year)
- ✅ Schedules continue through December (current year)
- ✅ Schedules continue into January (next year)
- ✅ Last schedule is for October (next year)
- ✅ All 12 schedules are present

## Test Suite 2: Payment Status with Transaction Matching

### Test 2.1: Mark Payment Creates Transaction
**Steps**:
1. From biller details, click "Pay" on the first schedule
2. Fill in payment details:
   - Amount: 1500 (or the expected amount)
   - Date: Current date
   - Account: Select any account
3. Click "Submit" or "Save"

**Expected Results**:
- ✅ Payment modal closes
- ✅ Schedule now shows green checkmark (✓) or "Paid" indicator
- ✅ Console logs show: "Payment schedule updated successfully"
- ✅ Transaction is created in transactions table

### Test 2.2: Navigate to Transactions Page
**Steps**:
1. Go to Transactions page
2. Find the transaction you just created

**Expected Results**:
- ✅ Transaction exists with:
  - Name matching biller name
  - Amount: 1500
  - Date: Today's date
  - Account: Selected account

**Screenshot**: Take screenshot showing the paid schedule in biller details

## Test Suite 3: Transaction Deletion Clears Payment Status

### Test 3.1: Delete Transaction
**Steps**:
1. On Transactions page, locate the payment transaction from Test 2.1
2. Delete the transaction (click delete/trash icon, confirm)

**Expected Results**:
- ✅ Transaction is deleted successfully
- ✅ Console logs show: "Clearing payment schedules for deleted transaction"
- ✅ Console logs show: "Cleared N payment schedule(s)" where N >= 1
- ✅ No error messages displayed

### Test 3.2: Verify Schedule Clears
**Steps**:
1. Navigate back to Billers page
2. Open the same biller's details
3. Look at the schedule that was previously paid

**Expected Results**:
- ✅ Schedule NO LONGER shows green checkmark
- ✅ Schedule shows "Pay" button instead
- ✅ Status is "Unpaid"
- ✅ No stale "Paid" indicator

**Screenshot**: Take screenshot showing the unpaid status after transaction deletion

### Test 3.3: Verify in Budget Page
**Steps**:
1. Navigate to Budget page
2. Create or view a budget setup for current month
3. Add the test biller to the setup
4. Check the payment status

**Expected Results**:
- ✅ Biller shows as unpaid (no green checkmark)
- ✅ Status matches what's shown on Billers page
- ✅ Consistent across all views

## Test Suite 4: Multiple Payments and Deletions

### Test 4.1: Mark Multiple Payments
**Steps**:
1. View biller details
2. Mark 3 different months as paid
3. Verify all 3 show as paid

**Expected Results**:
- ✅ All 3 schedules show paid status
- ✅ 3 transactions created
- ✅ Paid amounts can differ from expected amounts

### Test 4.2: Delete One Transaction
**Steps**:
1. Delete only 1 of the 3 transactions
2. Return to biller details

**Expected Results**:
- ✅ The schedule for deleted transaction shows unpaid
- ✅ Other 2 schedules remain paid
- ✅ No unintended status changes

### Test 4.3: Delete All Transactions
**Steps**:
1. Delete the remaining 2 transactions
2. Return to biller details

**Expected Results**:
- ✅ All schedules show as unpaid
- ✅ All show "Pay" buttons
- ✅ No green checkmarks remain

## Test Suite 5: Edge Cases

### Test 5.1: Schedule Creation Failure
**Steps**:
1. Temporarily disconnect from database (if possible)
2. Try to create a new biller

**Expected Results**:
- ✅ User sees error message about schedule creation
- ✅ Error message is clear and actionable
- ✅ Biller may still be created (graceful degradation)

### Test 5.2: Partial Amount Payment
**Steps**:
1. Mark a payment with amount different from expected
   - Expected: 1500
   - Paid: 1499 or 1501
2. Check status

**Expected Results**:
- ✅ Status shows as paid (within ±1 tolerance)
- ✅ Displayed amount shows actual paid amount
- ✅ Matching works with tolerance

### Test 5.3: Name Variations
**Steps**:
1. Create biller named "Electric Company"
2. Create transaction named "Electric" (shorter)
3. Check if it matches

**Expected Results**:
- ✅ Transaction matches biller (partial name matching)
- ✅ Schedule shows as paid
- ✅ Minimum 3-character requirement enforced

## Test Suite 6: Cross-Page Consistency

### Test 6.1: Status Across Pages
**Steps**:
1. Mark payment on Billers page
2. Check status on Budget page
3. Delete transaction
4. Check status on both pages again

**Expected Results**:
- ✅ Status is consistent across all pages
- ✅ Changes propagate immediately after page refresh
- ✅ No stale data displayed

## Test Suite 7: Performance and Logging

### Test 7.1: Bulk Operations
**Steps**:
1. Create 5 billers in quick succession
2. Monitor console for logs

**Expected Results**:
- ✅ All 5 billers create successfully
- ✅ Each gets 12 schedules (60 total)
- ✅ No timeout or performance issues
- ✅ Console logs show all creations

### Test 7.2: Console Logging
**Steps**:
1. Open browser developer console
2. Perform various operations
3. Check logs

**Expected Results**:
- ✅ Informative logs for schedule creation
- ✅ Logs for payment status checks
- ✅ Logs for schedule clearing
- ✅ Error logs for failures (if any)

## Test Suite 8: Regression Tests

### Test 8.1: Existing Billers
**Steps**:
1. View any existing billers (created before this fix)
2. Try to mark payments
3. Try to view schedules

**Expected Results**:
- ✅ Existing billers still work correctly
- ✅ Can mark payments normally
- ✅ Payment status displays correctly
- ✅ No breaking changes

### Test 8.2: Other Features
**Steps**:
1. Test creating accounts
2. Test creating savings jars
3. Test creating installments
4. Test dashboard views

**Expected Results**:
- ✅ All other features work normally
- ✅ No regressions introduced
- ✅ No unexpected errors

## Success Criteria Summary

All tests must pass with these criteria:
- ✅ New billers get 12 schedules automatically
- ✅ Payment status determined by transaction matching
- ✅ Transaction deletion clears payment status
- ✅ Status consistent across all pages
- ✅ No console errors (except expected validation errors)
- ✅ Performance is acceptable (< 2 seconds for operations)
- ✅ Existing functionality not broken

## Reporting Issues

If any test fails, report:
1. Test number and name
2. Expected vs actual result
3. Console error messages
4. Screenshot (if applicable)
5. Steps to reproduce

## Test Results Template

```
Date: _____________
Tester: _____________

Test 1.1: [PASS/FAIL] _____________
Test 1.2: [PASS/FAIL] _____________
Test 1.3: [PASS/FAIL] _____________
Test 2.1: [PASS/FAIL] _____________
Test 2.2: [PASS/FAIL] _____________
Test 3.1: [PASS/FAIL] _____________
Test 3.2: [PASS/FAIL] _____________
Test 3.3: [PASS/FAIL] _____________
Test 4.1: [PASS/FAIL] _____________
Test 4.2: [PASS/FAIL] _____________
Test 4.3: [PASS/FAIL] _____________
Test 5.1: [PASS/FAIL] _____________
Test 5.2: [PASS/FAIL] _____________
Test 5.3: [PASS/FAIL] _____________
Test 6.1: [PASS/FAIL] _____________
Test 7.1: [PASS/FAIL] _____________
Test 7.2: [PASS/FAIL] _____________
Test 8.1: [PASS/FAIL] _____________
Test 8.2: [PASS/FAIL] _____________

Overall Result: [PASS/FAIL]
Notes: _____________
```

## Screenshots to Capture

1. Biller details showing 12 schedules (Test 1.2)
2. Schedule marked as paid (Test 2.2)
3. Schedule showing unpaid after transaction deletion (Test 3.2)
4. Console logs showing schedule creation
5. Console logs showing schedule clearing

---
*Testing guide for blocking issues resolution*
*Version: 1.0*
*Last updated: 2026-02-03*
