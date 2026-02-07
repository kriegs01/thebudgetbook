# Loan Payment Calculation Fix Verification

## Bug Description

**Reported Issue:**
When making loan payments, the remaining balance calculation was incorrect.

**Example:**
- Original Loan: $1,500
- Total Paid: $100
- Remaining Balance: $2,500 (WRONG! Should be $1,400)

## Root Cause

Loan payments are stored as **negative** amounts in the database (because they increase the account balance when received).

The original calculation:
```typescript
const totalPaid = (payments || []).reduce((sum, p) => sum + p.amount, 0);
const remainingBalance = Math.abs(loan.amount) - totalPaid;
```

With the bug:
- Loan: +$1,500 (positive, money lent out)
- Payment: -$100 (negative, money received back)
- totalPaid = -100 (summing negative values!)
- remainingBalance = 1500 - (-100) = 1500 + 100 = **$1,600** ❌

If multiple payments were made:
- Payment 1: -$100
- Payment 2: -$500
- totalPaid = -100 + (-500) = -600
- remainingBalance = 1500 - (-600) = 1500 + 600 = **$2,100** ❌

This explains the reported bug where Original Loan ($1500) + Total Paid (which would be -$1000 if $1000 was paid) = $1500 - (-1000) = $2,500!

## Fix Applied

```typescript
// Use Math.abs to convert negative payment amounts to positive
const totalPaid = (payments || []).reduce((sum, p) => sum + Math.abs(p.amount), 0);
const remainingBalance = Math.abs(loan.amount) - totalPaid;
```

With the fix:
- Loan: +$1,500
- Payment: -$100
- totalPaid = Math.abs(-100) = 100 (correct!)
- remainingBalance = 1500 - 100 = **$1,400** ✅

## Test Scenarios

### Scenario 1: Single Payment
```
Original Loan: $1,500
Payment 1: $100
Expected totalPaid: $100
Expected remaining: $1,400
```

### Scenario 2: Multiple Payments
```
Original Loan: $1,500
Payment 1: $100
Payment 2: $500
Payment 3: $200
Expected totalPaid: $800
Expected remaining: $700
```

### Scenario 3: Full Payment
```
Original Loan: $1,500
Payment 1: $1,500
Expected totalPaid: $1,500
Expected remaining: $0
```

### Scenario 4: Overpayment
```
Original Loan: $1,500
Payment 1: $2,000
Expected totalPaid: $2,000
Expected remaining: -$500 (overpaid)
```

## Storage Format Reference

| Transaction Type | User Action | DB Storage | Display |
|-----------------|-------------|------------|---------|
| Loan | Lend $1,500 | +1500 | -$1,500 (red) |
| Loan Payment | Receive $100 | -100 | +$100 (green) |

The loan is positive (money out), payments are negative (money in). For the remaining balance calculation, we need to use absolute values to get the actual amounts.

## Files Changed

- `src/services/transactionsService.ts` - Fixed `getLoanTransactionsWithPayments` function

## Verification Steps

1. ✅ Build successful
2. Create a loan for $1,500
3. Make a payment of $100
4. Click "Receive Payment" again
5. Verify the modal shows:
   - Original Loan: $1,500
   - Total Paid: $100
   - Remaining Balance: $1,400 ✅

---

**Status**: ✅ Fixed
**Commit**: Next commit
