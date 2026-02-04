# Budget Setup Refactoring - Payment Schedule IDs

## Summary

This refactoring updates the Budget Setup pages to use payment schedule IDs from the `monthly_payment_schedules` table as the source of truth for payment status tracking, replacing the previous approach of using the JSONB `schedules` array stored in the `billers` table.

## Problem Statement

The codebase previously had two disconnected systems for tracking payments:

1. **Biller.schedules (JSONB)**: Frontend-managed array stored in billers table
2. **monthly_payment_schedules table**: Database table with payment schedules

These systems were not synchronized, leading to:
- Inconsistent payment status between different views
- Transactions not linked to payment schedules
- Difficulty tracking payment history accurately
- Reliance on transaction name/amount matching (unreliable)

## Solution

### Core Changes

#### 1. Payment Schedule Loading
- Added `paymentSchedules` state to store schedules from `monthly_payment_schedules` table
- Added `selectedYear` state to properly track the budget period year
- Load payment schedules when month or year changes

```typescript
const [paymentSchedules, setPaymentSchedules] = useState<SupabaseMonthlyPaymentSchedule[]>([]);
const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

useEffect(() => {
  const loadPaymentSchedules = async () => {
    const { data } = await getPaymentSchedulesByPeriod(selectedMonth, selectedYear);
    setPaymentSchedules(data);
  };
  loadPaymentSchedules();
}, [selectedMonth, selectedYear]);
```

#### 2. Helper Functions

**`getPaymentSchedule(sourceType, sourceId)`**
- Retrieves payment schedule for a biller or installment
- Uses payment schedules loaded from monthly_payment_schedules table

**`checkIfPaidBySchedule(sourceType, sourceId)`**
- Determines payment status using payment schedule
- Considers both 'paid' and 'partial' status as paid for UI purposes
- Provides accurate status based on database records

**`reloadPaymentSchedules()`**
- Reloads payment schedules after recording a payment
- Ensures UI reflects latest payment status

#### 3. Status Determination

**Billers:**
```typescript
const paymentSchedule = getPaymentSchedule('biller', item.id);
if (paymentSchedule) {
  isPaid = checkIfPaidBySchedule('biller', item.id);
} else {
  // Fallback to transaction matching if no schedule found
  isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
}
```

**Installments:**
```typescript
const installmentSchedule = getPaymentSchedule('installment', installment.id);
if (installmentSchedule) {
  isPaid = checkIfPaidBySchedule('installment', installment.id);
} else {
  // Fallback to cumulative calculation
  // Uses paidAmount >= expectedPaidByThisMonth logic
}
```

#### 4. Payment Recording with Schedule IDs

**Transaction Creation:**
```typescript
if (isEditing) {
  // Update existing transaction
  await updateTransaction(transactionId, transaction);
} else if (schedule.id) {
  // Create transaction linked to payment schedule
  await createPaymentScheduleTransaction(schedule.id, {
    name: `${biller.name} - ${month} ${year}`,
    date: datePaid,
    amount: amount,
    paymentMethodId: accountId
  });
} else {
  // Fallback: Create transaction without schedule link
  await createTransaction(transaction);
}
```

**Schedule Update:**
```typescript
// Update payment schedule status and amount
await recordPaymentViaTransaction(schedule.id, {
  transactionName: name,
  amountPaid: amount,
  datePaid: date,
  accountId: accountId,
  receipt: receipt
});
```

**Backward Compatibility:**
```typescript
// Still update Biller.schedules JSONB for legacy code
const updatedSchedules = biller.schedules.map(s => {
  if (s.id === schedule.id || (s.month === schedule.month && s.year === schedule.year)) {
    return { ...s, amountPaid: amount, datePaid: date, accountId: accountId };
  }
  return s;
});
await onUpdateBiller({ ...biller, schedules: updatedSchedules });
```

#### 5. Pay Button Updates

**Biller Pay Button:**
```typescript
onClick={() => {
  if (linkedBiller && paymentSchedule) {
    // Create schedule object with payment_schedule_id
    const scheduleForModal: PaymentSchedule = {
      id: paymentSchedule.id, // Used for linking transactions
      month: paymentSchedule.month,
      year: paymentSchedule.year.toString(),
      expectedAmount: paymentSchedule.expected_amount,
      // ... other fields
    };
    
    // Find latest transaction for editing
    const linkedTransactions = transactions
      .filter(tx => tx.payment_schedule_id === paymentSchedule.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const existingTx = linkedTransactions[0];
    
    setShowPayModal({ biller: linkedBiller, schedule: scheduleForModal });
  }
}}
```

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ User clicks "Pay" button                                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────────────────┐
│ getPaymentSchedule() retrieves schedule from state      │
│ - Uses monthly_payment_schedules data                   │
│ - Returns schedule with ID                              │
└──────────────────┬──────────────────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────────────────┐
│ handlePaySubmit() creates transaction                   │
│ - Calls createPaymentScheduleTransaction(scheduleId)    │
│ - Links transaction to payment_schedule_id              │
└──────────────────┬──────────────────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────────────────┐
│ recordPaymentViaTransaction() updates schedule          │
│ - Updates amount_paid in monthly_payment_schedules      │
│ - Sets status (pending/partial/paid)                    │
│ - Records date_paid, account_id, receipt                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────────────────┐
│ Backward compatibility: Update Biller.schedules JSONB   │
│ - Updates billers table for legacy code                 │
└──────────────────┬──────────────────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────────────────┐
│ Reload payment schedules and billers                    │
│ - reloadPaymentSchedules() refreshes state              │
│ - UI updates to show payment status                     │
└─────────────────────────────────────────────────────────┘
```

### Database Tables

**monthly_payment_schedules** (Source of Truth)
```sql
id                  uuid PRIMARY KEY
source_type         'biller' | 'installment'
source_id           uuid
month               string
year                integer
payment_number      integer
expected_amount     numeric
amount_paid         numeric
date_paid           date
account_id          uuid
receipt             string
status              'pending' | 'paid' | 'partial' | 'overdue'
```

**transactions** (Linked to Schedules)
```sql
id                  uuid PRIMARY KEY
name                string
date                timestamp
amount              numeric
payment_method_id   uuid
payment_schedule_id uuid --> LINKS TO monthly_payment_schedules.id
```

**billers** (Backward Compatibility)
```sql
id                  uuid PRIMARY KEY
name                string
...
schedules           jsonb --> Contains PaymentSchedule[] for legacy code
```

## Benefits

### 1. Accurate Status Tracking
- Payment status determined from database records, not heuristic matching
- Single source of truth eliminates synchronization issues
- Status updates propagate immediately

### 2. Transaction Linkage
- Transactions explicitly linked to payment schedules via `payment_schedule_id`
- Easy to find all transactions for a specific payment schedule
- Supports editing payments by looking up linked transactions

### 3. Historical Tracking
- Complete payment history stored in monthly_payment_schedules table
- Can track partial payments over time
- Date, amount, and receipt information preserved

### 4. Backward Compatibility
- Still updates Biller.schedules JSONB for existing code
- Gradual migration path to new system
- No breaking changes to existing functionality

### 5. Better UX
- Partial payments now show as "paid" (green checkmark)
- Faster status checks (no transaction scanning)
- Consistent status across all views

## Limitations & Future Work

### Current Limitations

1. **Installment Transactions**: 
   - Installment payments through the generic transaction modal don't link to payment schedules
   - Future work: Update installment payment flow to use createPaymentScheduleTransaction

2. **Year Selection**: 
   - UI doesn't expose year selection
   - Defaults to current year
   - Future work: Add year selector for viewing historical budgets

3. **Dual Storage**: 
   - Still maintaining both monthly_payment_schedules and Biller.schedules
   - Future work: Migrate fully to monthly_payment_schedules, deprecate JSONB schedules

4. **Purchase Items**: 
   - Non-biller purchase items still use transaction name matching
   - Future work: Consider creating payment schedules for recurring purchases

### Future Enhancements

1. **Full Migration to monthly_payment_schedules**
   - Remove Biller.schedules JSONB field
   - Update all code to use monthly_payment_schedules exclusively
   - Migration script to convert existing JSONB schedules

2. **Enhanced Installment Tracking**
   - Create payment schedules for all installment payments upfront
   - Link installment transactions to payment_schedule_id
   - Better progress tracking for installments

3. **Payment History View**
   - Show all transactions linked to a payment schedule
   - Edit or void past payments
   - Payment timeline visualization

4. **Overdue Tracking**
   - Automated overdue detection using schedule dates
   - Notifications for overdue payments
   - Dashboard showing overdue items

5. **Reporting & Analytics**
   - Payment trends over time
   - Budget vs actual analysis using payment schedules
   - Export payment history

## Testing Notes

### Manual Testing Checklist

- [x] Build succeeds without errors
- [x] Code review completed with fixes applied
- [x] Security scan passed (0 vulnerabilities)
- [ ] Biller payment marking in Budget Setup
- [ ] Payment status updates immediately after payment
- [ ] Payment schedules reload correctly
- [ ] Editing existing payments works correctly
- [ ] Partial payments display as paid
- [ ] Historical budget periods load correct schedules
- [ ] Installment status tracking works
- [ ] Backward compatibility with existing setups

### Test Scenarios

1. **Create Payment for Biller**
   - Navigate to Budget Setup
   - Select a month and timing
   - Click "Pay" on an unpaid biller
   - Enter payment details
   - Submit payment
   - Verify: Green checkmark appears, schedule updated, transaction created

2. **Edit Existing Payment**
   - Click "Pay" on a paid biller
   - Form should pre-populate with existing transaction
   - Modify amount or date
   - Submit
   - Verify: Schedule and transaction updated

3. **Multiple Transactions per Schedule**
   - Create multiple transactions for same schedule
   - Click "Pay" button
   - Verify: Latest transaction is shown for editing

4. **Year Switching**
   - Change selectedYear in code to test different years
   - Verify: Correct payment schedules load for that year

5. **Backward Compatibility**
   - Check that Biller.schedules JSONB is still updated
   - Verify legacy code still works

## Migration Guide

### For Developers

If you're working with payment-related code:

1. **Use monthly_payment_schedules as source of truth**
   ```typescript
   // ✅ Good
   const schedule = await getPaymentSchedule('biller', billerId);
   const isPaid = schedule.amount_paid > 0;
   
   // ❌ Avoid
   const schedule = biller.schedules.find(s => s.month === month);
   const isPaid = !!schedule?.amountPaid;
   ```

2. **Link transactions to payment schedules**
   ```typescript
   // ✅ Good
   await createPaymentScheduleTransaction(scheduleId, transaction);
   
   // ❌ Avoid
   await createTransaction(transaction); // No link to schedule
   ```

3. **Update schedule status after payment**
   ```typescript
   // ✅ Good
   await recordPaymentViaTransaction(scheduleId, payment);
   
   // ❌ Avoid
   // Manually updating schedule fields
   ```

### For Database Changes

If you need to modify payment schedule schema:

1. Create migration in `supabase/migrations/`
2. Update `SupabaseMonthlyPaymentSchedule` type in `src/types/supabase.ts`
3. Update service functions in `src/services/paymentSchedulesService.ts`
4. Update UI components to use new fields

## Conclusion

This refactoring establishes `monthly_payment_schedules` as the single source of truth for payment tracking while maintaining backward compatibility. It provides a solid foundation for future enhancements and improves the reliability and maintainability of the payment tracking system.

The key achievement is the consistent use of `payment_schedule_id` to link transactions to schedules, enabling accurate status determination and better payment history tracking.
