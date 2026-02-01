# Bug Fixes: Transaction Deletion & Schedule Generation

## Issues Fixed

### 1. Transaction Deletion Not Reverting Payment Status ✅

**Problem:** When transactions were deleted from the Transactions page, the payment schedule's "Paid" status remained, showing a green checkmark instead of reverting to the "Pay" button.

**Root Cause:** The `deleteTransaction()` function only removed the transaction record but didn't update the linked `payment_schedule` to clear the payment information.

**Solution:** Enhanced `deleteTransaction()` in `src/services/transactionsService.ts` to:
1. Fetch the transaction first to check if it has a `payment_schedule_id`
2. Delete the transaction as before
3. If the transaction was linked to a payment schedule, clear the payment fields:
   - `amount_paid` → `null`
   - `date_paid` → `null`
   - `receipt` → `null`
   - `account_id` → `null`

**Code Changes:**
```typescript
// Before
export const deleteTransaction = async (id: string) => {
  try {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);
    // ...
  }
}

// After
export const deleteTransaction = async (id: string) => {
  try {
    // Fetch transaction to check for payment_schedule_id
    const { data: transaction } = await supabase
      .from('transactions')
      .select('payment_schedule_id')
      .eq('id', id)
      .single();

    // Delete transaction
    await supabase.from('transactions').delete().eq('id', id);

    // If linked to payment schedule, clear payment info
    if (transaction?.payment_schedule_id) {
      await supabase
        .from('payment_schedules')
        .update({
          amount_paid: null,
          date_paid: null,
          receipt: null,
          account_id: null
        })
        .eq('id', transaction.payment_schedule_id);
    }
  }
}
```

**Testing:**
1. Make a payment for a biller (e.g., pay January 2026 schedule)
2. Verify the schedule shows as "Paid" (green checkmark)
3. Go to Transactions page
4. Delete the payment transaction
5. Return to Biller view
6. Verify the schedule now shows "Pay" button instead of paid status

---

### 2. Biller Schedule Generation Starting from Wrong Month ✅

**Problem:** When adding a new biller with activation date "February 2026", the view page displayed a "January 2026" schedule first instead of starting from February.

**Root Cause:** The schedule generation in `pages/Billers.tsx` was hardcoded to create all 12 months starting from January 2026, regardless of the activation date specified by the user.

**Old Code:**
```typescript
schedules: MONTHS.map(month => ({ 
  id: generateScheduleId(month, '2026'), 
  month, 
  year: '2026', 
  expectedAmount: expected 
}))
```

This always created: January 2026, February 2026, ..., December 2026

**Solution:** Updated schedule generation to dynamically start from the activation month:
```typescript
// Get starting month and year from form
const startMonthIndex = MONTHS.indexOf(addFormData.actMonth);
const startYear = parseInt(addFormData.actYear);
const generatedSchedules = [];

// Generate 12 months starting from activation date
for (let i = 0; i < 12; i++) {
  const monthIndex = (startMonthIndex + i) % 12;
  const yearOffset = Math.floor((startMonthIndex + i) / 12);
  const scheduleYear = (startYear + yearOffset).toString();
  const scheduleMonth = MONTHS[monthIndex];
  
  generatedSchedules.push({
    id: generateScheduleId(scheduleMonth, scheduleYear),
    month: scheduleMonth,
    year: scheduleYear,
    expectedAmount: expected
  });
}
```

**Examples:**
- Activation: February 2026 → Schedules: Feb 2026, Mar 2026, ..., Jan 2027
- Activation: November 2026 → Schedules: Nov 2026, Dec 2026, Jan 2027, ..., Oct 2027
- Activation: January 2026 → Schedules: Jan 2026, Feb 2026, ..., Dec 2026

**Testing:**
1. Click "Add Biller" button
2. Fill in biller details
3. Set activation month to "February" and year to "2026"
4. Submit the form
5. View the biller details
6. Verify schedules start with "February 2026" (not January)
7. Verify 12 consecutive months are generated (Feb 2026 - Jan 2027)

---

## Technical Details

### Database Schema

The payment system uses these relationships:
```
transactions
  └── payment_schedule_id (FK) → payment_schedules.id

payment_schedules
  ├── biller_id (FK) → billers.id
  ├── installment_id (FK) → installments.id
  ├── amount_paid
  ├── date_paid
  ├── receipt
  └── account_id
```

When a transaction with `payment_schedule_id` is deleted, the payment schedule must be updated to reflect the payment is no longer recorded.

### Schedule Generation

Both systems generate schedules:
1. **Old system (JSON):** `billers.schedules` field (for display compatibility)
2. **New system (database):** `payment_schedules` table (for payment tracking)

Both should start from the activation date for consistency.

---

## Files Modified

1. `src/services/transactionsService.ts` - Enhanced transaction deletion
2. `pages/Billers.tsx` - Fixed schedule generation logic

## Build Status

✅ Build passes without errors
✅ TypeScript compilation successful
✅ No linting errors

---

## Next Steps

### Manual Testing Checklist

- [ ] Test transaction deletion reverts payment status
  - [ ] Create a biller
  - [ ] Make a payment (creates transaction)
  - [ ] Verify payment shows as paid
  - [ ] Delete transaction from Transactions page
  - [ ] Verify payment status reverts to unpaid

- [ ] Test biller schedule generation
  - [ ] Create biller with February 2026 activation
  - [ ] Verify schedules start from February
  - [ ] Create biller with November 2026 activation
  - [ ] Verify schedules roll over to next year correctly

### Future Improvements

1. **UI Migration:** Update Billers.tsx to fetch and display schedules from `payment_schedules` table instead of JSON field
2. **Cascade Delete:** Consider adding database triggers for automatic cleanup
3. **Audit Trail:** Log payment deletions for accountability
4. **Confirmation Dialog:** Add confirmation before deleting paid transactions

---

**Status:** ✅ Fixes Implemented and Ready for Testing  
**Last Updated:** February 1, 2026
