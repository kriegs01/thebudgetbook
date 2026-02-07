# Transaction Display Sign Logic Verification

## Database Storage vs Display

### Database Storage (for balance calculation: `balance - tx.amount`)
- Withdrawals, Loans, Transfers (source) → Stored as **POSITIVE**
- Cash-in, Transfers (receiving), Loan Payments → Stored as **NEGATIVE**

### Display Logic (what users see)
With the fix: `formatCurrency(-tx.amount)` and color based on `tx.amount > 0`

| Transaction Type | DB Value | Display Value | Color |
|-----------------|----------|---------------|-------|
| Withdraw $1000 | +1000 | -$1,000 | Red (negative) ✅ |
| Loan $1000 | +1000 | -$1,000 | Red (negative) ✅ |
| Transfer Out $1000 | +1000 | -$1,000 | Red (negative) ✅ |
| Cash In $1000 | -1000 | +$1,000 | Green (positive) ✅ |
| Loan Payment $1000 | -1000 | +$1,000 | Green (positive) ✅ |
| Transfer In $1000 | -1000 | +$1,000 | Green (positive) ✅ |

## Examples

### Scenario 1: Starting Balance $10,000

```
Transaction          | DB Amount | Balance Calc           | Display      | New Balance
---------------------|-----------|------------------------|--------------|------------
Withdraw $500        | +500      | 10000 - (+500) = 9500 | -$500 (red)  | $9,500
Cash In $2000        | -2000     | 9500 - (-2000) = 11500| +$2,000 (green)| $11,500
Transfer Out $3000   | +3000     | 11500 - (+3000) = 8500| -$3,000 (red)| $8,500
```

### Scenario 2: Transfer Between Accounts

**Account A (source):**
- DB Amount: +1000 (positive, money out)
- Display: -$1,000 (red, negative)
- Balance: Decreases by $1,000 ✅

**Account B (destination):**
- DB Amount: -1000 (negative, money in)
- Display: +$1,000 (green, positive)
- Balance: Increases by $1,000 ✅

## User Requirements Met

✅ Withdrawals → Display as NEGATIVE (red)
✅ Loans → Display as NEGATIVE (red)
✅ Transfers (source) → Display as NEGATIVE (red)
✅ Cash-in → Display as POSITIVE (green)
✅ Transfers (receiving) → Display as POSITIVE (green)
✅ Loan Payments → Display as POSITIVE (green)

## Balance Calculation Verification

Balance calculation remains correct: `balance - tx.amount`

- Positive DB amount (money out): `balance - positive` = decreases ✅
- Negative DB amount (money in): `balance - negative` = increases ✅

---

**Status**: ✅ Correct
**Implementation**: Display sign is flipped from storage sign
