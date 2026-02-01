# Quick Testing Guide - Bug Fixes

## Test 1: Transaction Deletion Reverts Payment Status

### Steps:
1. **Navigate to Billers page**
   - Open the application
   - Go to Billers section

2. **Create a test payment**
   - Open any biller details
   - Find a schedule (e.g., January 2026)
   - Click "Pay" button
   - Fill in payment details:
     - Amount: (suggested amount)
     - Date: Today's date
     - Account: Select any account
   - Submit payment

3. **Verify payment is recorded**
   - Schedule should now show a green checkmark (✓) instead of "Pay" button
   - Status: PAID

4. **Delete the transaction**
   - Navigate to "Transactions" page
   - Find the transaction you just created
   - Click "Delete" button
   - Confirm deletion

5. **Verify payment status reverted**
   - Go back to Billers page
   - Open the same biller details
   - Find the same schedule (e.g., January 2026)
   - **Expected:** Should show "Pay" button again (not the checkmark)
   - **Previous bug:** Would still show checkmark

### ✅ Success Criteria
- Payment status changes from PAID (✓) back to UNPAID (Pay button) after transaction deletion

---

## Test 2: Biller Schedule Generation Starts from Correct Month

### Steps:
1. **Navigate to Billers page**
   - Click "Add Biller" button

2. **Fill in biller details**
   - Name: "Test Biller February"
   - Category: Any category
   - Due Date: "15"
   - Expected Amount: "1000"
   - **Activation Month: "February"**
   - **Activation Year: "2026"**
   - Leave other fields as default

3. **Submit the form**
   - Click "Add Biller" or Submit button

4. **View biller details**
   - Click on the newly created biller to view schedules

5. **Verify schedule starts from February**
   - **Expected:** First schedule should be "February 2026"
   - **Previous bug:** First schedule would be "January 2026"
   - Check that 12 months are listed: Feb 2026, Mar 2026, ..., Jan 2027

### Additional Test Cases:

**Test with November start:**
- Activation: November 2026
- Expected schedules: Nov 2026, Dec 2026, Jan 2027, Feb 2027, ..., Oct 2027

**Test with January start:**
- Activation: January 2026
- Expected schedules: Jan 2026, Feb 2026, ..., Dec 2026

### ✅ Success Criteria
- First schedule matches the activation month
- 12 consecutive months are generated
- Year rolls over correctly when starting late in the year

---

## Expected Results Summary

| Test | Before Fix | After Fix |
|------|------------|-----------|
| Delete paid transaction | Payment stays marked as PAID ❌ | Payment reverts to unpaid ✅ |
| Create biller (Feb start) | Shows January 2026 first ❌ | Shows February 2026 first ✅ |

---

## Troubleshooting

**Issue:** Payment status doesn't revert after deleting transaction
- Check if the transaction had a `payment_schedule_id`
- Verify the payment_schedules table exists
- Check browser console for errors

**Issue:** Schedules still start from January
- Clear browser cache
- Verify the latest code is deployed
- Check that activation month was actually set to February

---

## Quick Verification SQL

If you have access to the database, you can verify:

```sql
-- Check if payment schedule was cleared after transaction deletion
SELECT 
  id,
  schedule_month,
  schedule_year,
  amount_paid,
  date_paid
FROM payment_schedules
WHERE biller_id = '<your-biller-id>'
ORDER BY schedule_year, schedule_month;

-- Check transaction links
SELECT 
  t.id,
  t.name,
  t.payment_schedule_id,
  ps.schedule_month,
  ps.schedule_year
FROM transactions t
LEFT JOIN payment_schedules ps ON t.payment_schedule_id = ps.id
WHERE t.payment_schedule_id IS NOT NULL
ORDER BY t.date DESC
LIMIT 10;
```

---

**Need Help?** See `BUGFIX_TRANSACTION_DELETION_AND_SCHEDULES.md` for detailed technical information.
