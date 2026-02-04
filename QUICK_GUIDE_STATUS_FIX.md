# Quick Guide: Payment Schedule Status Fix

## What Changed?

The frontend now reads payment status **directly from the database** instead of calculating it from `paidAmount`.

## The Problem (Before)

```
❌ Frontend calculated status:
isPaid = (payments * amount) <= paidAmount

Issues:
- Stale data after transaction deletions
- No partial payment support
- Didn't match database reality
```

## The Solution (After)

```
✅ Frontend reads database status:
isPaid = schedule.status === 'paid'
isPartial = schedule.status === 'partial'

Benefits:
- Always accurate
- Supports partial payments
- Reflects changes immediately
```

## How It Works

### Data Flow

```
Open View Schedule
  ↓
Load from Database
  ↓
Display Actual Status
  ↓
✅ Shows Real Status
```

### Status Types

**Pending** (Gray)
- No payment made yet
- Shows "Pending" badge
- "Pay" button visible

**Partial** (Yellow)
- Partial payment made
- Shows "Partial" badge
- Shows amount paid (e.g., "₱500 of ₱1,000")
- "Pay" button visible

**Paid** (Green)
- Full payment made
- Shows "Paid" badge
- No "Pay" button

## Quick Test

### Test 1: View Status

1. Create installment with start date
2. Open "View Schedule"
3. ✅ Should show "Pending" for all months
4. Check console: "Using database payment schedules"

### Test 2: Make Payment

1. Make a payment
2. Open "View Schedule"
3. ✅ First month shows "Paid" (green)
4. ✅ Other months show "Pending"

### Test 3: Delete Transaction

1. Delete payment transaction
2. Go to Installments
3. Open "View Schedule"
4. ✅ Status reverted to "Pending"
5. ✅ No manual refresh needed!

### Test 4: Partial Payment

1. Make partial payment (e.g., ₱500 of ₱1,000)
2. Open "View Schedule"
3. ✅ Shows "Partial" in yellow
4. ✅ Shows "(₱500 of ₱1,000)"

## Expected Console Logs

### Loading Schedules
```
[Installments] Loading payment schedules for installment: abc-123
[Installments] Loaded payment schedules: 12 schedules
[Installments] Using database payment schedules for display
```

### Fallback (Old Installments)
```
[Installments] No payment schedules found, using calculated schedule (fallback)
```

## UI Changes

### Before
- Simple Paid/Pending
- No partial support
- Calculated status

### After
- Paid/Partial/Pending
- Shows partial amounts
- Database status
- Loading indicator

## Status Colors

```
Paid    → Green background + green badge
Partial → Yellow background + yellow badge + amount info
Pending → Gray background + no badge
```

## Troubleshooting

### Status Not Updating?

**Check:**
1. Database has payment schedules?
   ```sql
   SELECT * FROM monthly_payment_schedules 
   WHERE source_id = '<installment-id>';
   ```
2. Status column correct?
3. Frontend reloaded after payment?

**Fix:**
- Ensure payment schedules exist
- Check migration ran
- Reload installments

### Shows Fallback Instead?

**Symptoms:**
Console: "using calculated schedule (fallback)"

**Check:**
- Payment schedules in database
- Installment has start_date
- Migration ran properly

**Fix:**
- Regenerate payment schedules
- Set start_date on installment

### Partial Not Showing?

**Check:**
1. Database status = 'partial'?
2. amount_paid between 0 and expected_amount?

**Fix:**
- Verify backend status calculation
- Check payment recording logic

## Benefits

### For Users
✅ Accurate status always  
✅ See partial payments  
✅ Instant updates  
✅ No manual refresh  

### For Developers
✅ Database is source of truth  
✅ Easy to debug  
✅ Comprehensive logging  
✅ Backward compatible  

## Key Files Changed

- `pages/Installments.tsx` - Fetch and display DB schedules

## Related Documentation

- Full guide: `PAYMENT_SCHEDULE_STATUS_FIX.md`
- Frontend reversion: `FRONTEND_PAYMENT_STATUS_REVERSION.md`
- Transaction implementation: `INSTALLMENT_PAYMENTS_VIA_TRANSACTIONS.md`

## Summary

This fix ensures payment status displayed in the frontend **always matches the database**. No more stale data, no more confusion!

**Before:** Calculated (wrong)  
**After:** Database (correct) ✅
