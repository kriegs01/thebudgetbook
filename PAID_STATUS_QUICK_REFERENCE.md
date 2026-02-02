# Quick Reference: Paid Status Logic

## The Rule
**Always check transactions FIRST. Use `amountPaid` only as a manual override.**

## Code Pattern

### ✅ CORRECT - Check transactions first
```typescript
// PRIMARY: Check if transaction exists (accurate, reflects DB)
const isPaidViaTransaction = checkIfPaidByTransaction(
  itemName, 
  expectedAmount, 
  month, 
  year
);

// SECONDARY: Allow manual override for backward compatibility
const isPaidViaSchedule = !!schedule?.amountPaid;

// RESULT: Paid if EITHER source confirms payment
const isPaid = isPaidViaTransaction || isPaidViaSchedule;
```

### ❌ WRONG - Only checking amountPaid
```typescript
// Don't do this - leads to ghost payments!
const isPaid = !!schedule.amountPaid;
```

### ❌ WRONG - Checking amountPaid first
```typescript
// Don't prioritize amountPaid - it can be stale
if (schedule.amountPaid) {
  isPaid = true;
} else {
  isPaid = checkIfPaidByTransaction(...);
}
```

## Display Amount Priority

### ✅ CORRECT - Prefer transaction amount
```typescript
let displayAmount = expectedAmount;

if (isPaid) {
  // Try to get amount from transaction (most accurate)
  const matchingTx = getMatchingTransaction(...);
  if (matchingTx) {
    displayAmount = matchingTx.amount; // ✅ Prefer this
  } else if (schedule.amountPaid) {
    displayAmount = schedule.amountPaid; // Fallback for manual entries
  }
}
```

## When to Use Each Check

| Check | When to Use | Purpose |
|-------|-------------|---------|
| `checkIfPaidByTransaction()` | **ALWAYS FIRST** | Primary source of truth - reflects actual DB state |
| `schedule.amountPaid` | **SECONDARY ONLY** | Backward compatibility, manual overrides |
| Combine with OR | **ALWAYS** | Allow either source to confirm payment |

## Transaction Matching Logic

The `checkIfPaidByTransaction` function matches transactions using:

1. **Name Match**: Partial string match (min 3 characters)
2. **Amount Match**: Within ±1 tolerance for rounding
3. **Date Match**: Same month/year (with grace period)

```typescript
function checkIfPaidByTransaction(itemName, amount, month, year) {
  return !!transactions.find(tx => 
    nameMatch(tx.name, itemName) &&
    amountMatch(tx.amount, amount) &&
    dateMatch(tx.date, month, year)
  );
}
```

## Common Patterns

### For Billers
```typescript
// Get schedule from payment_schedules table
const dbSchedule = findScheduleForBiller(billerId);

// Check transaction first
const isPaidViaTransaction = checkIfPaidByTransaction(
  biller.name,
  dbSchedule.expected_amount,
  dbSchedule.schedule_month,
  dbSchedule.schedule_year
);

// Allow manual override
const isPaidViaSchedule = !!dbSchedule.amount_paid;

// Combine
const isPaid = isPaidViaTransaction || isPaidViaSchedule;
```

### For Budget Items
```typescript
// Check transaction first
const isPaidViaTransaction = checkIfPaidByTransaction(
  item.name,
  item.amount,
  selectedMonth
);

// For billers, also check schedule
const isPaidViaSchedule = schedule?.amountPaid ? true : false;

// Paid if either
const isPaid = isPaidViaTransaction || isPaidViaSchedule;
```

### For Purchases (No Schedule)
```typescript
// Only check transactions
const isPaid = checkIfPaidByTransaction(
  item.name,
  item.amount,
  selectedMonth
);
```

## Logging Best Practices

### ✅ GOOD - Show both sources
```typescript
if (isPaid) {
  console.log(`[Component] Item ${name} is PAID`, {
    viaTransaction: isPaidViaTransaction,
    viaSchedule: isPaidViaSchedule,
    month,
    year
  });
}
```

### ❌ BAD - Only log one source
```typescript
// Don't do this - hides important debugging info
if (isPaid) {
  console.log('Item is paid');
}
```

## Transaction Reload

Always reload transactions after changes:

```typescript
// After creating/editing transaction
await createTransaction(transactionData);
await reloadTransactions(); // ✅ Ensures UI updates

// After marking payment
await markPaymentScheduleAsPaid(...);
await reloadTransactions(); // ✅ Refresh data
```

## Testing Checklist

When implementing paid status logic:

- [ ] ✅ Check transactions first (primary source)
- [ ] ✅ Check amountPaid second (manual override)
- [ ] ✅ Use OR to combine both checks
- [ ] ✅ Prefer transaction amount for display
- [ ] ✅ Reload transactions after changes
- [ ] ✅ Log both sources in debugging
- [ ] ✅ Test: Add transaction → shows paid
- [ ] ✅ Test: Delete transaction → removes paid
- [ ] ✅ Test: Edit transaction → updates paid status

## Migration from Old Code

### Before (Old Pattern)
```typescript
// ❌ Ghost payments possible
const isPaid = !!schedule.amountPaid;
```

### After (New Pattern)
```typescript
// ✅ Accurate, no ghost payments
const isPaidViaTransaction = checkIfPaidByTransaction(...);
const isPaidViaSchedule = !!schedule?.amountPaid;
const isPaid = isPaidViaTransaction || isPaidViaSchedule;
```

## Why This Matters

### Problem: Ghost Payments
```
User deletes transaction → amountPaid still set → UI shows "Paid" ❌
```

### Solution: Transaction-First
```
User deletes transaction → checkIfPaidByTransaction returns false → UI shows "Unpaid" ✅
```

## Quick Debugging

If payment status seems wrong:

1. **Check console logs**: Look for "viaTransaction" and "viaSchedule" values
2. **Verify transaction exists**: Search in database/transactions list
3. **Check matching logic**: Ensure name/amount/date are close enough
4. **Reload transactions**: Make sure latest data is loaded

## Questions?

- **Q**: Can I still use `amountPaid` for manual entries?
- **A**: Yes! It works as a manual override. Just make sure to check transactions first.

- **Q**: What if I need to force a payment status?
- **A**: Set `schedule.amountPaid`. It will show as paid via the manual override path.

- **Q**: Do I need to update the database?
- **A**: No. This is a logic-only change, backward compatible with existing data.

---

**Remember**: Transactions are truth. `amountPaid` is override. Always check transactions first! ✅
