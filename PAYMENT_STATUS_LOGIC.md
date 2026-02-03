# Payment Status Unified Logic - Implementation Notes

## Unified Payment Status Rule

A payment schedule is considered "PAID" if **EITHER**:
1. `amountPaid` field is set in the `payment_schedules` row (manual payment recorded), OR
2. A matching transaction exists that matches by name, amount, date, and account

## Implementation by Component

### Billers.tsx (Detail View)
**Status**: ✅ IMPLEMENTED

```typescript
const isPaidViaSchedule = !!(sched.amountPaid && sched.amountPaid > 0);
const isPaidViaTransaction = checkIfPaidByTransaction(...);
const isPaid = isPaidViaSchedule || isPaidViaTransaction;
```

**Why**: The Billers detail view loads full payment schedules from `payment_schedules` table, so both checks can be performed efficiently.

**Display Priority**: Prefers `amountPaid` from schedule if set, otherwise uses transaction amount.

### Budget.tsx (Setup View)
**Status**: ✅ ACCEPTABLE (Transaction matching only)

```typescript
isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
```

**Why Transaction-Only is Acceptable Here**:
1. Budget setup is a planning/entry interface
2. Payments are recorded via transactions (which then update schedules)
3. Loading all payment schedules for all billers would be expensive
4. Transaction matching provides real-time status for budget planning
5. Payment submission properly updates `payment_schedules` table

**Note**: When a payment is made through Budget setup:
- A transaction is created
- The payment schedule is updated/created with `amountPaid`
- Both checks would pass, but transaction check is sufficient

### Installments.tsx
**Status**: Uses `paidAmount` field on installment

```typescript
isPaid: (i + 1) * monthlyAmount <= installment.paidAmount
```

**Note**: Installments track cumulative `paidAmount` directly on the installment record. This is acceptable as it's a different pattern than billers. Installment payment schedules exist for tracking individual months but the installment's `paidAmount` is the source of truth for progress.

## Data Flow

### Payment Creation Flow
1. User clicks "Pay" on a schedule
2. Transaction is created in `transactions` table
3. Payment schedule is updated/created in `payment_schedules` table with:
   - `amount_paid` = payment amount
   - `date_paid` = payment date
   - `account_id` = payment account
   - `receipt` = receipt reference

### Payment Status Check Flow
1. **Primary**: Check if `amountPaid > 0` in schedule
2. **Fallback**: Check if matching transaction exists
3. Return `true` if EITHER condition is met

### Transaction Deletion Flow
1. Transaction is deleted from `transactions` table
2. `clearPaymentSchedulesForTransaction()` finds matching schedules
3. Schedules are cleared:
   - `amount_paid` = 0
   - `date_paid` = NULL
   - `account_id` = NULL
   - `receipt` = NULL
4. Status check now returns `false` (no amountPaid, no transaction)

## Testing Checklist

- [x] Create biller → payment schedules created
- [x] Create installment → payment schedules created  
- [x] Mark payment → schedule shows paid (both checks pass)
- [x] Delete transaction → schedule cleared, shows unpaid
- [ ] Verify in Billers detail view
- [ ] Verify in Budget setup view
- [ ] Delete biller → schedules cascade delete
- [ ] Delete installment → schedules cascade delete

## Why This Approach Works

1. **Resilient**: Two sources of truth (schedule + transaction) provide redundancy
2. **Real-time**: Transaction matching provides immediate status
3. **Auditable**: `amountPaid` preserves payment records
4. **Flexible**: Supports both manual and transaction-based payments
5. **Consistent**: Automatic cleanup when transactions deleted

## Edge Cases Handled

1. **Transaction deleted**: `clearPaymentSchedulesForTransaction()` clears `amountPaid`
2. **Manual payment**: `amountPaid` set without transaction (future feature)
3. **Schedule not yet created**: Transaction matching still works
4. **Multiple payments**: Last payment's amount is stored
5. **Partial payments**: Amount can differ from expected

## Future Enhancements

1. Add manual "Mark as Paid" without transaction (set amountPaid only)
2. Add payment history (track all payments, not just latest)
3. Add reconciliation report (compare schedules vs transactions)
4. Add audit log for payment changes
