# Fix: Budget Loans Table Not Showing Linked Account Amounts

## Problem Report

**Issue:** "okay that worked. So last thing, in Budget Setups > Loans Table, the amount for the month is not being pulled"

## Symptoms

1. ✅ Billers page shows correct transaction-based amounts for linked billers
2. ✅ Account Statement shows transactions correctly
3. ❌ Budget page Loans table shows $0.00 or manual amounts for linked billers
4. ❌ Amounts in Budget don't match amounts in Billers page

## Root Cause

The Budget page was not using the `getScheduleExpectedAmount()` function when creating biller items for the setup data.

### Original Code (BROKEN)

```typescript
// In Budget.tsx, lines ~169-177 (before fix)
const newItems = matchingBillers
  .filter(b => !existingIds.has(b.id))
  .map(b => {
    const schedule = b.schedules.find(s => s.month === selectedMonth);
    return {
      id: b.id,
      name: b.name,
      amount: schedule ? schedule.expectedAmount.toString() : b.expectedAmount.toString(),
      // ^ This uses the manual fallback amount, not the calculated amount!
      included: true,
      timing: b.timing,
      isBiller: true
    };
  });
```

### Why This Broke

1. **Billers Page:** Uses `getScheduleExpectedAmount()` to calculate amounts from transactions
2. **Budget Page:** Used `schedule.expectedAmount` directly (manual fallback value)
3. **Result:** Different amounts shown on different pages

### The Missing Calculation

The `getScheduleExpectedAmount()` function does:
1. Check if biller has linked account
2. Find billing cycle for the month
3. Filter transactions in that cycle
4. Aggregate transaction totals
5. Return calculated amount

But Budget page was skipping all of this and just using the stored `expectedAmount` field.

## Solution Implemented

### 1. Import the Calculation Function

**File:** `pages/Budget.tsx`

Added import:
```typescript
import { getScheduleExpectedAmount } from '../src/utils/linkedAccountUtils';
```

### 2. Update New Item Creation

Modified the code that creates new biller items:

```typescript
const newItems = matchingBillers
  .filter(b => !existingIds.has(b.id))
  .map(b => {
    const schedule = b.schedules.find(s => s.month === selectedMonth);
    
    // ENHANCEMENT: For linked billers, calculate amount from transactions
    let amount: number;
    if (schedule) {
      const { amount: calculatedAmount } = getScheduleExpectedAmount(
        b,
        schedule,
        accounts,
        transactions
      );
      amount = calculatedAmount;
    } else {
      amount = b.expectedAmount;
    }
    
    return {
      id: b.id,
      name: b.name,
      amount: amount.toString(), // Now uses calculated amount!
      included: true,
      timing: b.timing,
      isBiller: true
    };
  });
```

### 3. Update Existing Items

Also need to update amounts for existing items when:
- Month changes
- Transactions are added
- User navigates back to Budget page

```typescript
const filteredExisting = newData[cat.name].filter(item => {
  if (item.isBiller) {
    const biller = billers.find(b => b.id === item.id);
    return biller && biller.timing === selectedTiming;
  }
  return true;
}).map(item => {
  // ENHANCEMENT: Update amount for existing biller items
  if (item.isBiller) {
    const biller = billers.find(b => b.id === item.id);
    if (biller) {
      const schedule = biller.schedules.find(s => s.month === selectedMonth);
      if (schedule) {
        const { amount: calculatedAmount } = getScheduleExpectedAmount(
          biller,
          schedule,
          accounts,
          transactions
        );
        return {
          ...item,
          amount: calculatedAmount.toString()
        };
      }
    }
  }
  return item;
});
```

## Complete Fix Chain

This is the **third and final** part of the linked billers feature:

### Fix 1: Transaction Data Source (Previous)
- **Problem:** Transactions not visible in Account Statement
- **Solution:** Unified all pages to use Supabase
- **Result:** Transactions visible everywhere ✓

### Fix 2: Billing Cycle Coverage (Previous)
- **Problem:** Cycles only generated backwards, missing future months
- **Solution:** Generate cycles bidirectionally
- **Result:** Billers page shows amounts for all months ✓

### Fix 3: Budget Integration (This Fix)
- **Problem:** Budget page not using calculation function
- **Solution:** Import and use `getScheduleExpectedAmount()`
- **Result:** Budget page shows same amounts as Billers page ✓

## Testing Guide

### Test Case 1: Verify Amount Shows in Budget

1. **Setup:**
   - Create credit account with billing date (e.g., 12th)
   - Create Loans-category biller linked to credit account
   - Add transaction to credit account ($100 on Feb 15, 2026)

2. **Action:**
   - Go to Budget page
   - Click "Setup" view
   - Select "February" month
   - Look at Loans table

3. **Expected Result:**
   - Biller appears in table ✓
   - Amount shows $100.00 ✓
   - Matches amount from Billers page ✓

### Test Case 2: Verify Amount Updates

1. **Setup:** Same as Test Case 1

2. **Action:**
   - Stay on Budget page
   - Open Transactions page in new tab
   - Add another transaction ($50 on Feb 20, 2026) to same credit account
   - Return to Budget page
   - Refresh or change month and back

3. **Expected Result:**
   - Amount updates to $150.00 (sum of transactions) ✓

### Test Case 3: Verify Multiple Months

1. **Setup:** Same as Test Case 1

2. **Action:**
   - Add transactions for different months:
     - Feb 2026: $100
     - Mar 2026: $150
     - Apr 2026: $200
   - In Budget page, switch between months

3. **Expected Result:**
   - February shows $100.00 ✓
   - March shows $150.00 ✓
   - April shows $200.00 ✓
   - Each month shows only its cycle's transactions ✓

### Test Case 4: Verify Fallback Behavior

1. **Setup:**
   - Create Loans biller WITHOUT linked account
   - Set manual expected amount to $500

2. **Action:**
   - View Budget page Loans table

3. **Expected Result:**
   - Shows $500.00 (manual amount) ✓
   - No linked account calculation attempted ✓

### Test Case 5: Cross-Page Consistency

1. **Setup:** Loans biller with linked account and transactions

2. **Action:**
   - Note amount shown in Billers page (e.g., $123.45)
   - Navigate to Budget page
   - Check same biller in Loans table

3. **Expected Result:**
   - Both pages show identical amount ✓
   - Consistent across entire application ✓

## Code Flow

### Before Fix (BROKEN)

```
Budget Page Setup:
├─ Find matching billers
├─ Get schedule for month
├─ Use schedule.expectedAmount (manual value) ✗
└─> Display in table

Result: Wrong amount shown
```

### After Fix (WORKING)

```
Budget Page Setup:
├─ Find matching billers
├─ Get schedule for month
├─ Call getScheduleExpectedAmount():
│  ├─> Check if linked to account ✓
│  ├─> Find billing cycle ✓
│  ├─> Aggregate transactions ✓
│  └─> Return calculated amount ✓
└─> Display in table

Result: Correct amount shown
```

## Benefits

### 1. Consistency
- All pages use same calculation logic
- No more discrepancies between pages
- Single source of truth for amounts

### 2. Automatic Updates
- Amounts recalculate when month changes
- Amounts recalculate when transactions added
- No manual refresh needed

### 3. Proper Fallback
- Still uses manual amount when no link
- Graceful degradation
- Backward compatible

## Performance Considerations

### Additional Calculation

**Before:**
- Simple property access: O(1)
- No function calls

**After:**
- Function call per biller item: O(n)
- Cycle lookup and transaction filtering: O(m)
- Where n = billers, m = transactions

**Impact:**
- Negligible for typical use (< 10 billers, < 1000 transactions)
- Transactions already filtered to last 24 months
- Calculation happens during useEffect, not on render

### Optimization Opportunities (Future)

1. **Memoization:** Cache calculated amounts per biller/month
2. **Batch Calculation:** Calculate all amounts at once
3. **Worker Thread:** Move heavy calculation off main thread
4. **Incremental Updates:** Only recalculate changed billers

## Related Issues Fixed

### Issue 1: Transactions Not Visible
- **When:** Account Statement page
- **Cause:** localStorage vs Supabase mismatch
- **Status:** FIXED

### Issue 2: Billers Missing Amounts
- **When:** Billers page future months
- **Cause:** Cycles only generated backwards
- **Status:** FIXED

### Issue 3: Budget Missing Amounts
- **When:** Budget Loans table
- **Cause:** Not using calculation function
- **Status:** FIXED (this fix)

## Summary

The linked account billing cycle feature is now **fully integrated** across all pages:

1. ✅ **Transactions Page:** Save and view transactions
2. ✅ **Account Statement:** View transactions by billing cycle
3. ✅ **Billers Page:** Show transaction totals in schedules
4. ✅ **Budget Page:** Show transaction totals in Loans table

All three major issues have been resolved and the feature is production-ready! 🎉

## Files Modified

- `pages/Budget.tsx` - Added import and calculation logic (39 lines changed)

## Build Status

- ✅ Build succeeds without errors
- ✅ TypeScript compilation successful
- ✅ No breaking changes
- ✅ Backward compatible
