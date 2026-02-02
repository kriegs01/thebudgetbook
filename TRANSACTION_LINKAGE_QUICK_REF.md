# Quick Reference: Transaction-Schedule Linkage

## The Rule
**ALWAYS set `payment_schedule_id` when creating a transaction that pays a payment schedule.**

## Code Patterns

### ✅ CORRECT - Payment Transaction (Budget/Billers Pay Flow)
```typescript
// 1. Get the schedule ID FIRST
const dbSchedule = findScheduleForBiller(biller.id);
if (!dbSchedule) {
  alert('Schedule not found');
  return;
}

// 2. Create transaction WITH payment_schedule_id
const transaction = {
  name: `${biller.name} - ${month}`,
  date: new Date(paymentDate).toISOString(),
  amount: parseFloat(amount),
  payment_method_id: accountId,
  payment_schedule_id: dbSchedule.id // ✅ CRITICAL: Must be set!
};

await createTransaction(transaction);
```

### ✅ CORRECT - Manual Transaction (No Schedule)
```typescript
// Manual/general transactions don't link to schedules
const transaction = {
  name: form.name,
  date: new Date(form.date).toISOString(),
  amount: parseFloat(form.amount),
  payment_method_id: form.accountId,
  payment_schedule_id: null // ✅ Explicitly null
};

await createTransaction(transaction);
```

### ❌ WRONG - Missing payment_schedule_id
```typescript
// DON'T DO THIS when paying a schedule!
const transaction = {
  name: `${biller.name} - ${month}`,
  amount: parseFloat(amount),
  payment_method_id: accountId
  // ❌ Missing payment_schedule_id!
};

await createTransaction(transaction);
// This will cause ghost payments!
```

## Checking Paid Status

### Priority Order

1. **PRIMARY**: Direct linkage (most accurate)
   ```typescript
   const isPaidByLink = transactions.some(tx => tx.payment_schedule_id === scheduleId);
   ```

2. **SECONDARY**: Manual override (backward compatibility)
   ```typescript
   const isPaidByManual = !!schedule.amountPaid;
   ```

3. **FALLBACK**: Fuzzy matching (legacy transactions)
   ```typescript
   const isPaidByFuzzy = checkIfPaidByTransaction(name, amount, month);
   ```

### Implementation
```typescript
const isSchedulePaidByLink = (scheduleId: string): boolean => {
  return transactions.some(tx => tx.payment_schedule_id === scheduleId);
};

const isItemPaid = (
  scheduleId: string | undefined,
  itemName: string,
  itemAmount: number,
  month: string,
  scheduleAmountPaid?: number
): boolean => {
  // 1. Check direct linkage first
  if (scheduleId && isSchedulePaidByLink(scheduleId)) {
    return true;
  }
  
  // 2. Check manual override
  if (scheduleAmountPaid && scheduleAmountPaid > 0) {
    return true;
  }
  
  // 3. Fallback to fuzzy matching
  return checkIfPaidByTransaction(itemName, itemAmount, month);
};
```

## Common Scenarios

### Creating Payment from Budget Page
```typescript
const handlePaySubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  const { biller, schedule } = showPayModal;
  
  // ✅ Get schedule ID first
  const dbSchedule = findScheduleForBiller(biller.id);
  if (!dbSchedule) {
    alert('Payment schedule not found. Please refresh.');
    return;
  }
  
  // ✅ Include payment_schedule_id
  const transaction = {
    name: `${biller.name} - ${schedule.month}`,
    date: new Date(payFormData.datePaid).toISOString(),
    amount: parseFloat(payFormData.amount),
    payment_method_id: payFormData.accountId,
    payment_schedule_id: dbSchedule.id // ✅ Link to schedule
  };
  
  await createTransaction(transaction);
};
```

### Checking if Biller is Paid
```typescript
const dbSchedule = findScheduleForBiller(biller.id);
const isPaid = isItemPaid(
  dbSchedule?.id,           // Schedule ID for linkage check
  biller.name,              // Name for fuzzy match fallback
  biller.expectedAmount,    // Amount for fuzzy match fallback
  selectedMonth,            // Month for fuzzy match fallback
  schedule?.amountPaid      // Manual override check
);

if (isPaid) {
  // Show checkmark
} else {
  // Show "Pay" button
}
```

### Getting Payment Amount
```typescript
let displayAmount = expectedAmount;

if (isPaid) {
  // Prefer linked transaction amount (most accurate)
  const linkedTx = transactions.find(tx => tx.payment_schedule_id === scheduleId);
  if (linkedTx) {
    displayAmount = linkedTx.amount;
  }
}
```

## Database Queries

### Find linked transaction
```sql
SELECT * FROM transactions 
WHERE payment_schedule_id = 'schedule-uuid';
```

### Find schedules without linked transactions
```sql
SELECT ps.* 
FROM payment_schedules ps
LEFT JOIN transactions t ON t.payment_schedule_id = ps.id
WHERE t.id IS NULL;
```

### Find transactions without linkage
```sql
SELECT * FROM transactions 
WHERE payment_schedule_id IS NULL
AND date >= '2024-02-02'; -- After linkage was implemented
```

## Testing Checklist

When implementing or reviewing:

- [ ] ✅ Get schedule ID BEFORE creating transaction
- [ ] ✅ Validate schedule exists (show error if not)
- [ ] ✅ Set payment_schedule_id in transaction object
- [ ] ✅ Use isItemPaid() with priority order for paid status
- [ ] ✅ Handle null schedule gracefully
- [ ] ✅ Test: Create transaction → shows paid
- [ ] ✅ Test: Delete transaction → shows unpaid
- [ ] ✅ Test: Manual transaction → payment_schedule_id is null

## Common Mistakes

### ❌ Mistake 1: Not Getting Schedule ID First
```typescript
// Wrong order - transaction might fail
const transaction = { payment_schedule_id: getScheduleId() };
await createTransaction(transaction);

// ✅ Correct - validate first
const schedule = getSchedule();
if (!schedule) return;
const transaction = { payment_schedule_id: schedule.id };
await createTransaction(transaction);
```

### ❌ Mistake 2: Only Using Fuzzy Matching
```typescript
// Wrong - ignores direct linkage
const isPaid = checkIfPaidByTransaction(name, amount, month);

// ✅ Correct - check linkage first
const isPaid = isItemPaid(scheduleId, name, amount, month);
```

### ❌ Mistake 3: Forgetting Null for Manual Transactions
```typescript
// Wrong - leaves payment_schedule_id undefined
const transaction = {
  name: form.name,
  amount: form.amount,
  payment_method_id: form.accountId
};

// ✅ Correct - explicitly null
const transaction = {
  name: form.name,
  amount: form.amount,
  payment_method_id: form.accountId,
  payment_schedule_id: null
};
```

## Benefits Summary

| Aspect | Before | After |
|--------|--------|-------|
| Accuracy | ❌ Fuzzy matching unreliable | ✅ Direct linkage 100% accurate |
| Ghost Payments | ❌ Common after deletes | ✅ Eliminated |
| Performance | ❌ O(n) fuzzy matching | ✅ O(1) direct lookup |
| Debugging | ❌ Hard to trace | ✅ Easy to audit |
| User Trust | ❌ Low (incorrect status) | ✅ High (reliable status) |

## Quick Debugging

**Issue**: Payment not showing as paid

1. Check if transaction has linkage:
   ```typescript
   console.log('Transaction:', transaction.payment_schedule_id);
   console.log('Schedule:', schedule.id);
   ```

2. Check if linkage matches:
   ```typescript
   const hasLink = transactions.some(tx => tx.payment_schedule_id === schedule.id);
   console.log('Has linked transaction:', hasLink);
   ```

3. Check fallbacks:
   ```typescript
   console.log('Manual override:', !!schedule.amountPaid);
   console.log('Fuzzy match:', checkIfPaidByTransaction(...));
   ```

---

**Remember**: Direct linkage via `payment_schedule_id` is the PRIMARY method. Always set it when paying schedules! ✅
