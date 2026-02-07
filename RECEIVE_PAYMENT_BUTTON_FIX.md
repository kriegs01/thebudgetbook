# Fix: "Receive Payment" Button Missing After Partial Payment

## Problem

After making a partial loan payment, the "Receive Payment" button would disappear from the loan transaction row, even though there was still a remaining balance.

## Root Cause

In the `loadTransactions()` function, there was a check:

```typescript
if (account?.type === 'Debit') {
  // Load loan transactions...
}
```

The `account` variable is a React state that gets set asynchronously. When `loadTransactions()` was called directly (e.g., after submitting a loan payment), there was a potential race condition where `account` might not be properly set yet, causing the loan transactions to not be reloaded.

## The Flow of the Bug

1. User clicks "Receive Payment" and submits a payment
2. `handleLoanPaymentSubmit()` executes:
   - Creates the payment transaction
   - Calls `await loadTransactions()` (line 305)
   - Calls `onTransactionCreated?.()` (line 306)
3. In `loadTransactions()`:
   - Loads all transactions ✓
   - Checks `if (account?.type === 'Debit')` ❌
   - If `account` is not properly set, skips loading loan data
4. Component re-renders with transactions but without updated loan data
5. The `loanTransactions.find(l => l.id === tx.id)` returns undefined
6. Button doesn't show because `loanTx` is falsy

## The Fix

Changed `loadTransactions()` to look up the account directly from the `accounts` prop instead of relying on the `account` state:

```typescript
// BEFORE (WRONG)
if (account?.type === 'Debit') {
  // ...
}

// AFTER (CORRECT)
const currentAccount = accounts.find(a => a.id === accountId);
if (currentAccount?.type === 'Debit') {
  // ...
}
```

This ensures that:
1. We always have the latest account data from props
2. We don't rely on the asynchronous state update
3. The check is reliable regardless of when/how `loadTransactions()` is called

## Verification

After the fix:
1. Create a loan (e.g., $1,500)
2. Make a partial payment (e.g., $100)
3. The "Receive Payment" button should still be visible
4. Click it again to verify the correct remaining balance ($1,400)
5. Make another payment
6. Button should remain visible until the loan is fully paid

## Files Changed

- `pages/accounts/view.tsx` - Updated `loadTransactions()` function

---

**Status**: ✅ Fixed
**Commit**: Next
