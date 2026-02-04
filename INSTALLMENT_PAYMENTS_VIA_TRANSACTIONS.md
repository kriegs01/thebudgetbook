# Installment Payments via Transactions - Implementation Guide

## Overview

This document describes the refactored installment payment system that creates separate transaction records linked to payment schedules. This enables proper tracking and the ability to revert payments when transactions are deleted.

## Problem Solved

**Before**: Installment payments directly updated the `paidAmount` field, with no transaction record or ability to track/revert individual payments.

**After**: Each payment creates a transaction record linked to a payment schedule. Deleting the transaction automatically reverts the payment schedule status.

## Architecture

### Database Schema

#### transactions Table (Enhanced)
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  name TEXT,
  date TIMESTAMP,
  amount NUMERIC,
  payment_method_id UUID,
  payment_schedule_id UUID REFERENCES monthly_payment_schedules(id) ON DELETE SET NULL
);
```

The new `payment_schedule_id` column:
- Links transactions to monthly payment schedules
- Nullable (backward compatible with existing transactions)
- Foreign key with `ON DELETE SET NULL` for data integrity

#### monthly_payment_schedules Table
```sql
CREATE TABLE monthly_payment_schedules (
  id UUID PRIMARY KEY,
  source_type TEXT, -- 'biller' or 'installment'
  source_id UUID,
  month TEXT,
  year INTEGER,
  expected_amount NUMERIC,
  amount_paid NUMERIC DEFAULT 0,
  status TEXT, -- 'pending', 'paid', 'partial', 'overdue'
  -- other fields...
);
```

### Payment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Makes Payment                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  handlePayInstallment(installmentId, payment)                   │
│  1. Find installment by ID                                      │
│  2. Get payment schedules for installment                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Find Target Payment Schedule                                   │
│  - Try current month/year first                                 │
│  - Fallback to first unpaid schedule                            │
│  - Skip fully paid schedules                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  recordPayment(scheduleId, payment)                             │
│  1. Get current schedule                                        │
│  2. Calculate new amount_paid                                   │
│  3. Determine status (pending/partial/paid)                     │
│  4. Update payment schedule                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  createPaymentScheduleTransaction(scheduleId, transaction)      │
│  1. Create transaction with payment_schedule_id                 │
│  2. Link to payment method (account)                            │
│  3. Store payment details                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Update Installment                                             │
│  1. Increment installment.paidAmount                            │
│  2. Save to database                                            │
│  3. Reload data                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Deletion Flow (Payment Reversion)

```
┌─────────────────────────────────────────────────────────────────┐
│               User Deletes Transaction                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  deleteTransactionAndRevertSchedule(transactionId)              │
│  1. Fetch transaction by ID                                     │
│  2. Check if payment_schedule_id exists                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  If Linked to Payment Schedule:                                 │
│  1. Get current payment schedule                                │
│  2. Calculate new amount_paid (subtract transaction amount)     │
│  3. Recalculate status:                                         │
│     - amount_paid >= expected_amount → 'paid'                   │
│     - amount_paid > 0 → 'partial'                               │
│     - amount_paid == 0 → 'pending'                              │
│  4. Update payment schedule                                     │
│  5. Clear payment details if fully reverted                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Delete Transaction                                             │
│  Remove transaction record from database                        │
└─────────────────────────────────────────────────────────────────┘
```

## Code Components

### 1. Transaction Service (transactionsService.ts)

#### createPaymentScheduleTransaction()
Creates a transaction linked to a payment schedule.

```typescript
await createPaymentScheduleTransaction(scheduleId, {
  name: 'Car Loan - January 2026',
  date: '2026-01-15',
  amount: 1000,
  paymentMethodId: accountId,
});
```

#### deleteTransactionAndRevertSchedule()
Deletes a transaction and reverts the linked payment schedule.

```typescript
await deleteTransactionAndRevertSchedule(transactionId);
// Automatically reverts the payment schedule if linked
```

#### getTransactionsByPaymentSchedule()
Gets all transactions for a specific payment schedule.

```typescript
const { data: transactions } = await getTransactionsByPaymentSchedule(scheduleId);
```

### 2. Payment Schedules Service (paymentSchedulesService.ts)

#### recordPayment()
Updates a payment schedule with payment details.

```typescript
await recordPayment(scheduleId, {
  amountPaid: 1000,
  datePaid: '2026-01-15',
  accountId: accountId,
  receipt: 'receipt.pdf',
});
```

#### recordPaymentViaTransaction()
Wrapper for transaction-based payments (optional helper).

### 3. App Component (App.tsx)

#### handlePayInstallment()
Main payment handler that orchestrates the entire payment flow.

```typescript
await handlePayInstallment(installmentId, {
  amount: 1000,
  date: '2026-01-15',
  accountId: accountId,
  receipt: 'receipt.pdf',
});
```

**Steps:**
1. Finds the installment
2. Gets payment schedules
3. Identifies target schedule (smart selection)
4. Records payment on schedule
5. Creates linked transaction
6. Updates installment total
7. Reloads data

### 4. Installments Component (Installments.tsx)

The UI component now supports the new payment flow through the `onPayInstallment` prop.

```tsx
<Installments
  onPayInstallment={handlePayInstallment}
  // ... other props
/>
```

## Usage Examples

### Making a Payment

```typescript
// From the UI, when user submits payment form:
await handlePayInstallment('installment-uuid', {
  amount: 1000,
  date: '2026-01-15',
  accountId: 'account-uuid',
  receipt: 'receipt-123',
});
```

**What happens:**
1. System finds payment schedule for January 2026
2. Updates schedule: `amount_paid = 1000`, `status = 'paid'`
3. Creates transaction: `name = 'Car Loan - January 2026'`, linked to schedule
4. Updates installment: `paidAmount += 1000`
5. Logs all actions

### Deleting a Payment

```typescript
// When user deletes a transaction:
await deleteTransactionAndRevertSchedule('transaction-uuid');
```

**What happens:**
1. System fetches transaction, finds `payment_schedule_id`
2. Gets payment schedule: currently `amount_paid = 1000`, `status = 'paid'`
3. Calculates new values: `amount_paid = 0`, `status = 'pending'`
4. Updates payment schedule
5. Clears payment details (date_paid, receipt, etc.)
6. Deletes transaction
7. Logs all actions

### Querying Transactions

```typescript
// Get all transactions for a payment schedule:
const { data } = await getTransactionsByPaymentSchedule(scheduleId);

// Each transaction shows:
// - id, name, date, amount
// - payment_method_id (account used)
// - payment_schedule_id (link to schedule)
```

## Smart Schedule Selection

The system intelligently selects which payment schedule to use:

1. **Preferred**: Schedule matching payment date (month/year)
2. **Fallback**: First unpaid schedule (pending or partial)
3. **Skip**: Fully paid schedules

Example:
```
Installment: Car Loan (12 months)
Schedules:
- Jan 2026: paid
- Feb 2026: partial (500/1000)  ← Would select this
- Mar 2026: pending
- Apr 2026: pending
...
```

## Status Transitions

### Payment Recording
```
pending → partial → paid
  (0)      (500)    (1000)
```

### Payment Reversion
```
paid → partial → pending
(1000)   (500)      (0)
```

Status is recalculated after every payment or deletion:
- `amount_paid >= expected_amount` → **paid**
- `amount_paid > 0` → **partial**
- `amount_paid == 0` → **pending**

## Logging

The system provides comprehensive logging at each step:

### Payment Creation
```
[App] Processing installment payment with transaction
[PaymentSchedules] Payment recorded
[Transactions] Created payment schedule transaction
[App] Transaction created successfully
[App] Installment payment processed successfully
```

### Payment Deletion
```
[Transactions] Reverting payment schedule for transaction deletion
[Transactions] Payment schedule reverted
[Transactions] Transaction deleted successfully
```

## Error Handling

### Graceful Degradation

If transaction creation fails after payment schedule is updated:
```typescript
// Payment schedule was updated but transaction failed
console.warn('[App] Payment schedule updated but transaction creation failed');
// System continues - payment is recorded, just no transaction link
```

### Validation

- Installment must exist
- Payment schedules must exist
- At least one unpaid schedule must exist
- All database operations are wrapped in try/catch
- Errors are logged and re-thrown to UI

## Migration Required

Run this migration before using the feature:

```sql
-- File: supabase/migrations/20260204_add_payment_schedule_id_to_transactions.sql

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS payment_schedule_id UUID 
REFERENCES monthly_payment_schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_payment_schedule 
ON transactions(payment_schedule_id);
```

## Backward Compatibility

### Old Transactions
- Transactions without `payment_schedule_id` continue to work
- They don't affect payment schedules when deleted
- No data migration needed

### Fallback Payment Method
The system still supports the old payment method:
```typescript
// If onPayInstallment is not provided, falls back to:
await onUpdate({
  ...installment,
  paidAmount: installment.paidAmount + amount
});
```

## Testing Checklist

### Manual Testing

1. **Run Migration**
   ```sql
   -- In Supabase SQL Editor
   -- Copy and run the migration SQL
   ```

2. **Create Installment**
   - Create an installment with start date
   - Verify payment schedules are generated

3. **Make Payment**
   - Open Installments page
   - Click "Pay" on an installment
   - Fill in payment details
   - Submit
   - Verify in console:
     - Payment processing logs
     - Transaction created
     - Schedule updated

4. **Verify Database**
   ```sql
   -- Check transaction was created with payment_schedule_id
   SELECT * FROM transactions WHERE payment_schedule_id IS NOT NULL;
   
   -- Check payment schedule was updated
   SELECT * FROM monthly_payment_schedules WHERE status = 'paid';
   ```

5. **Delete Transaction**
   - Go to Transactions page
   - Delete the payment transaction
   - Verify in console:
     - Reversion logs
   - Check database:
     ```sql
     -- Schedule should be reverted
     SELECT * FROM monthly_payment_schedules WHERE id = 'schedule-id';
     ```

6. **Verify Reversion**
   - Payment schedule status should revert
   - amount_paid should decrease
   - If fully reverted, payment details cleared

### Automated Testing (Future)

Consider adding:
- Unit tests for service functions
- Integration tests for payment flow
- E2E tests for UI interactions

## Troubleshooting

### Transaction Not Linked to Schedule

**Symptom**: Transaction created but `payment_schedule_id` is null

**Check**:
1. Migration was run
2. Payment schedules exist for installment
3. No errors in console logs

### Schedule Not Reverting

**Symptom**: Transaction deleted but schedule still shows as paid

**Check**:
1. Transaction had `payment_schedule_id` set
2. Check console for reversion logs
3. Verify `deleteTransactionAndRevertSchedule` was called

### Wrong Schedule Selected

**Symptom**: Payment applied to wrong month

**Check**:
1. Payment date matches schedule month/year
2. Multiple unpaid schedules exist
3. Review smart selection logic

### Database Errors

**Common Issues**:
- Migration not run: Column doesn't exist
- Foreign key violation: Schedule doesn't exist
- Null constraint: Required fields missing

## Benefits

✅ **Transaction History**: Every payment has a transaction record  
✅ **Reversible**: Deleting transaction reverts the payment  
✅ **Trackable**: Can see all transactions for a schedule  
✅ **Auditable**: Comprehensive logging of all actions  
✅ **Flexible**: Smart schedule selection handles various scenarios  
✅ **Backward Compatible**: Old code still works  
✅ **Data Integrity**: Foreign keys ensure consistency  

## Future Enhancements

Potential improvements:
1. **Bulk Payments**: Pay multiple schedules at once
2. **Partial Payments**: Split payment across schedules
3. **Payment History View**: UI to show transaction history per schedule
4. **Automated Testing**: Add comprehensive test suite
5. **Transaction Categories**: Categorize payment transactions
6. **Reporting**: Payment reports by period/installment

## Summary

This refactoring provides a robust foundation for installment payment tracking:
- Separate transaction records for each payment
- Automatic payment schedule management
- Reversible payments via transaction deletion
- Smart schedule selection
- Comprehensive logging and error handling
- Backward compatible with existing code

The system is production-ready after running the migration and can be extended with additional features as needed.
