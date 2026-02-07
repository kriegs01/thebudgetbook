# Fix: Loan Payment Display Consistency Across Pages

## Problem

Loan repayments were displaying inconsistently:
- **Transactions page**: Showed as negative (red)
- **Account > View page**: Showed as positive (green)

The user expected loan repayments to show as **positive everywhere** (since they represent money coming in).

## Root Cause

The application uses a specific storage format for balance calculations:
- **Database storage**: Uses signed values optimized for `balance - tx.amount`
  - Money OUT (withdraw, loan, transfer out) → Stored as **positive**
  - Money IN (cash in, loan payment, transfer in) → Stored as **negative**

The Account > View page was already flipping the sign for display to show user-friendly values:
```typescript
// Account > View page (CORRECT)
{formatCurrency(-tx.amount)}  // Flip sign for display
${tx.amount > 0 ? 'text-red-600' : 'text-green-600'}  // Color based on DB value
```

However, the Transactions page was showing raw database values:
```typescript
// Transactions page (WRONG)
{formatCurrency(tx.amount)}  // Show raw DB value
${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}  // Inverted logic
```

This caused loan payments (stored as negative) to display as negative in the Transactions page.

## The Fix

Applied the same display logic to the Transactions page:

```typescript
// Transactions page (FIXED)
{formatCurrency(-tx.amount)}  // Flip sign for display
${tx.amount > 0 ? 'text-red-600' : 'text-green-600'}  // Color based on DB value
```

## Result

Now both pages display amounts consistently:

| Transaction Type | DB Storage | Display | Color |
|-----------------|-----------|---------|-------|
| Withdraw | +1000 | -$1,000 | Red |
| Loan | +1000 | -$1,000 | Red |
| Transfer Out | +1000 | -$1,000 | Red |
| **Loan Payment** | **-1000** | **+$1,000** | **Green** ✅ |
| Cash In | -1000 | +$1,000 | Green |
| Transfer In | -1000 | +$1,000 | Green |

## Examples

### Before Fix

**Transactions Page:**
```
Loan Payment Received    -$100.00 (red)    ❌
Cash In                  -$500.00 (red)    ❌
Withdraw                 $200.00 (green)   ❌
```

**Account > View Page:**
```
Loan Payment Received    +$100.00 (green)  ✅
Cash In                  +$500.00 (green)  ✅
Withdraw                 -$200.00 (red)    ✅
```

### After Fix

**Transactions Page:**
```
Loan Payment Received    +$100.00 (green)  ✅
Cash In                  +$500.00 (green)  ✅
Withdraw                 -$200.00 (red)    ✅
```

**Account > View Page:**
```
Loan Payment Received    +$100.00 (green)  ✅
Cash In                  +$500.00 (green)  ✅
Withdraw                 -$200.00 (red)    ✅
```

## Files Changed

- `pages/transactions.tsx` - Updated display logic to flip signs and fix colors

## Verification

- [x] Build successful
- [x] Display logic matches Account > View page
- [x] Loan payments now show as positive (green) in Transactions page
- [x] All transaction types display consistently across both pages

---

**Status**: ✅ Fixed
**Commit**: Next
