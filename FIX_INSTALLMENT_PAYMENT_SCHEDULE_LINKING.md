# Fix: Installment Payment Schedule Linking

## Problem

When making a payment for an installment using the Budget Setup payment flow:
- ❌ Transaction was recorded in the database
- ❌ But `payment_schedule_id` was NULL
- ❌ Status did not update in Budget Setup view
- ❌ Status did not update in Installment > View screen

## Root Cause Analysis

### The Payment Flow Issue

```
┌─────────────────────────────────────────────────┐
│ User clicks "Pay" on installment in Budget Setup│
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ Opens generic transaction modal                 │
│ setShowTransactionModal(true)                   │
│ ❌ No payment schedule ID passed                │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ handleTransactionSubmit() called                │
│ ❌ Uses createTransaction() - no schedule link  │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ Transaction created in database                 │
│ payment_schedule_id = NULL ❌                   │
│ Payment schedule NOT updated ❌                 │
└─────────────────────────────────────────────────┘
```

### Code Analysis

**Before Fix - Installment Pay Button (lines 1670-1679)**
```typescript
<button onClick={() => {
  setTransactionFormData({
    name: `${installment.name} - ${selectedMonth}...`,
    date: new Date().toISOString().split('T')[0],
    amount: installment.monthlyAmount.toString(),
    accountId: installment.accountId || accounts[0]?.id || ''
    // ❌ Missing: paymentScheduleId
  });
  setShowTransactionModal(true);
}}>Pay</button>
```

**Before Fix - handleTransactionSubmit (lines 806-850)**
```typescript
const handleTransactionSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  const transaction = {
    name: transactionFormData.name,
    date: new Date(transactionFormData.date).toISOString(),
    amount: parseFloat(transactionFormData.amount),
    payment_method_id: transactionFormData.accountId
    // ❌ No payment_schedule_id
  };
  
  // ❌ Always uses createTransaction - no schedule linking
  const result = await createTransaction(transaction);
  
  // ❌ Payment schedule never updated
};
```

## Solution Implemented

### 1. Add Payment Schedule ID to Form State

**Transaction Form Data (line 167-174)**
```typescript
const getDefaultTransactionFormData = () => ({
  id: '',
  name: '',
  date: new Date().toISOString().split('T')[0],
  amount: '',
  accountId: accounts[0]?.id || '',
  paymentScheduleId: '' // ✅ NEW: Store payment schedule ID
});
```

### 2. Pass Schedule ID When Opening Modal

**Installment Pay Button (lines 1724-1732)**
```typescript
<button onClick={() => {
  // ✅ Get payment schedule at render time
  const installmentSchedule = getPaymentSchedule('installment', installment.id);
  
  setTransactionFormData({
    id: '',
    name: `${installment.name} - ${selectedMonth}...`,
    date: new Date().toISOString().split('T')[0],
    amount: installment.monthlyAmount.toString(),
    accountId: installment.accountId || accounts[0]?.id || '',
    paymentScheduleId: installmentSchedule?.id || '' // ✅ NEW: Pass schedule ID
  });
  setShowTransactionModal(true);
}}>Pay</button>
```

### 3. Update Transaction Handler

**handleTransactionSubmit (lines 806-897)**
```typescript
const handleTransactionSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  const isEditing = !!transactionFormData.id;
  const paymentScheduleId = transactionFormData.paymentScheduleId; // ✅ Extract schedule ID
  
  try {
    let transactionData, transactionError;
    
    if (isEditing) {
      // Update existing transaction
      const result = await updateTransaction(transactionFormData.id, transaction);
      transactionData = result.data;
      transactionError = result.error;
    } else if (paymentScheduleId) {
      // ✅ NEW: Create transaction with payment schedule link
      console.log('[Budget] Creating transaction with payment schedule link');
      const result = await createPaymentScheduleTransaction(
        paymentScheduleId,
        {
          name: transactionFormData.name,
          date: new Date(transactionFormData.date).toISOString(),
          amount: parseFloat(transactionFormData.amount),
          paymentMethodId: transactionFormData.accountId
        }
      );
      transactionData = result.data;
      transactionError = result.error;
      
      // ✅ NEW: Update payment schedule status
      if (!transactionError && transactionData) {
        console.log('[Budget] Updating payment schedule status');
        await recordPaymentViaTransaction(
          paymentScheduleId,
          {
            transactionName: transactionFormData.name,
            amountPaid: parseFloat(transactionFormData.amount),
            datePaid: transactionFormData.date,
            accountId: transactionFormData.accountId,
            receipt: undefined
          }
        );
      }
    } else {
      // Create transaction without schedule link (purchases)
      const result = await createTransaction(transaction);
      transactionData = result.data;
      transactionError = result.error;
    }
    
    // Reload transactions to update paid status
    await reloadTransactions();
    
    // ✅ NEW: Reload payment schedules if a schedule was updated
    if (paymentScheduleId) {
      await reloadPaymentSchedules();
    }
    
    // Close modal
    setShowTransactionModal(false);
    setTransactionFormData(getDefaultTransactionFormData());
  } catch (e) {
    console.error('[Budget] Error saving transaction:', e);
    alert('Failed to save transaction. Please try again.');
  }
};
```

## Fixed Payment Flow

```
┌─────────────────────────────────────────────────┐
│ User clicks "Pay" on installment in Budget Setup│
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ Get payment schedule ID                         │
│ installmentSchedule = getPaymentSchedule(...)   │
│ ✅ Schedule ID available                        │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ Opens transaction modal with schedule ID        │
│ setTransactionFormData({ paymentScheduleId })   │
│ ✅ Schedule ID passed                           │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ handleTransactionSubmit() called                │
│ ✅ Detects paymentScheduleId                    │
│ ✅ Uses createPaymentScheduleTransaction()      │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ Transaction created with schedule link          │
│ payment_schedule_id = <uuid> ✅                 │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ recordPaymentViaTransaction() called            │
│ Updates monthly_payment_schedules:              │
│ - amount_paid += payment amount ✅              │
│ - status = 'paid' or 'partial' ✅              │
│ - date_paid = payment date ✅                   │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ Reload payment schedules                        │
│ ✅ Budget Setup UI shows paid status            │
│ ✅ Installment view screen shows paid status    │
└─────────────────────────────────────────────────┘
```

## Database Impact

### Before Fix
```sql
-- Transaction created without link
INSERT INTO transactions (
  id, name, date, amount, payment_method_id, payment_schedule_id
) VALUES (
  'uuid1', 'Installment Payment', '2026-02-04', 1000, 'account-id', NULL -- ❌ NULL
);

-- Payment schedule NOT updated
SELECT * FROM monthly_payment_schedules WHERE id = 'schedule-id';
-- amount_paid: 0 ❌
-- status: 'pending' ❌
```

### After Fix
```sql
-- Transaction created WITH link
INSERT INTO transactions (
  id, name, date, amount, payment_method_id, payment_schedule_id
) VALUES (
  'uuid1', 'Installment Payment', '2026-02-04', 1000, 'account-id', 'schedule-id' -- ✅ Linked!
);

-- Payment schedule IS updated
UPDATE monthly_payment_schedules 
SET amount_paid = 1000, 
    status = 'paid',
    date_paid = '2026-02-04',
    account_id = 'account-id'
WHERE id = 'schedule-id';
-- ✅ Status updated!
```

## Expected Behavior After Fix

### Creating an Installment Payment

1. **User Action**: Click "Pay" on installment in Budget Setup
2. **Modal Opens**: Transaction form with pre-filled data
3. **User Submits**: Fill in details and click submit
4. **Database**:
   - Transaction created with `payment_schedule_id` set
   - Payment schedule updated with amount and status
5. **UI Updates**:
   - Budget Setup shows green checkmark (paid status)
   - Installment view screen shows updated paid amount
   - Payment schedule status reflects in database

### Status Determination Flow

```typescript
// In Budget Setup (line 1596-1608)
const installmentSchedule = getPaymentSchedule('installment', installment.id);

if (installmentSchedule) {
  // ✅ Check status from database schedule
  isPaid = checkIfPaidBySchedule('installment', installment.id);
  // Uses: schedule.amount_paid > 0 && ['paid', 'partial'].includes(schedule.status)
  
  if (isPaid) {
    // ✅ Show green checkmark
    <CheckCircle2 className="w-4 h-4 text-green-500" />
  }
}
```

## Testing Checklist

### Manual Testing Steps

1. **Create Installment Payment**
   - [ ] Open Budget Setup page
   - [ ] Navigate to Loans category
   - [ ] Find an installment with unpaid status
   - [ ] Click "Pay" button
   - [ ] Fill in payment details
   - [ ] Submit payment
   - [ ] Verify green checkmark appears immediately
   
2. **Verify Database**
   - [ ] Query transactions table
   - [ ] Check `payment_schedule_id` is set (not NULL)
   - [ ] Query monthly_payment_schedules table
   - [ ] Check `amount_paid` is updated
   - [ ] Check `status` is 'paid' or 'partial'
   - [ ] Check `date_paid` is set
   
3. **Verify UI Updates**
   - [ ] Budget Setup shows paid status (green checkmark)
   - [ ] Installment view screen shows updated paid amount
   - [ ] Reload page - status persists
   - [ ] Check other months - only selected month is marked paid

4. **Edge Cases**
   - [ ] Partial payment (amount < expected amount)
   - [ ] Multiple payments to same schedule
   - [ ] Edit existing payment
   - [ ] Payment for different timing (1/2 vs 2/2)

## Code Changes Summary

### Files Modified
- `pages/Budget.tsx`

### Lines Changed
1. Line 167-174: Added `paymentScheduleId` field to transaction form data
2. Line 806-897: Updated `handleTransactionSubmit` to use payment schedules
3. Line 1612-1622: Updated Purchases Pay button to include paymentScheduleId
4. Line 1724-1732: Updated Installment Pay button to pass schedule ID
5. Line 1856-1862: Updated transaction edit to preserve schedule ID

### Functions Enhanced
- `getDefaultTransactionFormData()` - Added paymentScheduleId field
- `handleTransactionSubmit()` - Added schedule linking logic

### New Behavior
- Installment payments now link to payment schedules
- Payment schedule status updates automatically
- UI refreshes to show paid status immediately
- Database maintains referential integrity via foreign key

## Benefits

✅ **Accurate Status**: Status determined from database, not client-side logic
✅ **Referential Integrity**: Transactions linked to schedules via FK
✅ **Consistent UI**: Status shows correctly in all views
✅ **Audit Trail**: Complete payment history linked to schedules
✅ **No Breaking Changes**: Purchase transactions still work as before

## Related Issues

This fix addresses the specific issue:
- Installment payments through Budget Setup not updating status
- Missing payment_schedule_id in transaction records
- Status not reflecting in Installment view screen

This complements the earlier refactoring that made billers use payment schedules.
Now both billers AND installments properly link to payment schedules.
