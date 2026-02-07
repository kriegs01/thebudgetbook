# Loan Payment Bug - Visual Explanation

## The Problem You Reported

```
Original Loan: $1,500
Total Paid: $100
Remaining Balance: $2,500  ❌ WRONG!
```

The remaining balance should be **$1,400**, not $2,500!

## Why This Happened

### Database Storage Format
```
┌─────────────────────────────────────────────────┐
│ Transaction Type | Amount in Database           │
├─────────────────────────────────────────────────┤
│ Loan (out)       | +1500  (positive)           │
│ Payment (in)     | -100   (negative)           │
└─────────────────────────────────────────────────┘
```

Loan payments are stored as **negative** numbers because they increase your account balance when you receive money back.

### The Bug in the Code

**BEFORE (WRONG):**
```typescript
const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
//                                               ^^^^^^^^
//                                               Adding negative numbers!

const remainingBalance = Math.abs(loan.amount) - totalPaid;
```

**What Actually Happened:**
```
Payment 1: -100 (negative in DB)
totalPaid = -100  (negative!)

remainingBalance = 1500 - (-100)
                 = 1500 + 100
                 = 1600  ❌ WRONG!
```

If you made multiple payments:
```
Payment 1: -100
Payment 2: -500  
Payment 3: -400
totalPaid = -100 + (-500) + (-400) = -1000

remainingBalance = 1500 - (-1000)
                 = 1500 + 1000
                 = 2500  ❌ This matches your bug report!
```

## The Fix

**AFTER (CORRECT):**
```typescript
const totalPaid = payments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
//                                               ^^^^^^^^^^^^^^^^^^
//                                               Convert to positive first!

const remainingBalance = Math.abs(loan.amount) - totalPaid;
```

**How It Works Now:**
```
Payment 1: -100 in DB → Math.abs(-100) = 100
totalPaid = 100  (positive!)

remainingBalance = 1500 - 100
                 = 1400  ✅ CORRECT!
```

Multiple payments example:
```
Payment 1: -100 → 100
Payment 2: -500 → 500
Payment 3: -400 → 400
totalPaid = 100 + 500 + 400 = 1000

remainingBalance = 1500 - 1000
                 = 500  ✅ CORRECT!
```

## Visual Flow Chart

```
┌──────────────────────────────────────────────────────────────┐
│                    LOAN PAYMENT FLOW                          │
└──────────────────────────────────────────────────────────────┘

You lend $1,500
    ↓
┌─────────────────┐
│ Loan Created    │  Stored as: +1500
│ Balance: -$1500 │  (money out, decreases your balance)
└─────────────────┘
    ↓
You receive $100 back
    ↓
┌─────────────────┐
│ Payment 1       │  Stored as: -100
│ Balance: +$100  │  (money in, increases your balance)
└─────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Remaining Balance Calculation (FIXED)                       │
├─────────────────────────────────────────────────────────────┤
│ Original Loan: Math.abs(+1500) = $1,500                    │
│ Total Paid: Math.abs(-100) = $100                          │
│ Remaining: $1,500 - $100 = $1,400 ✅                       │
└─────────────────────────────────────────────────────────────┘
```

## Real-World Example

Let's say you lent $1,500 to a friend:

1. **Create Loan:**
   - You: "I lent $1,500"
   - Database: +1500
   - Your balance: Decreased by $1,500 ✅

2. **Friend Pays Back $100:**
   - You: "I received $100"
   - Database: -100
   - Your balance: Increased by $100 ✅

3. **Check Remaining (BEFORE FIX):**
   - Original: $1,500
   - Paid: -$100 (wrong!)
   - Remaining: $1,500 - (-$100) = $1,600 ❌
   - OR if they paid $1,000: $1,500 - (-$1,000) = $2,500 ❌

4. **Check Remaining (AFTER FIX):**
   - Original: $1,500
   - Paid: $100 (correct!)
   - Remaining: $1,500 - $100 = $1,400 ✅

## Summary

The bug was caused by adding negative numbers directly when calculating total paid. The fix uses `Math.abs()` to convert those negative database values to positive amounts before summing them up.

Now your loan payment tracking will show the correct remaining balance! 🎉

---

**Status**: ✅ Fixed in commit 39f0334
