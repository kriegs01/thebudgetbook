# Fix: Transaction Loading and Billing Cycle Issues

## Problems Reported

1. **In Billers > Loans type biller > View**: The transactions for the Credit account billing cycle replaced the usual "January 2026" payment schedule with the total amount ✅ (This was working as intended - feature design)

2. **In Accounts > Credit Accounts > View Statement**: The transactions for the billing period were lost ❌ (BUG FIXED)

3. **In Transactions**: When adding transactions for the next billing period, they were not being pulled from accounts nor billers pages ❌ (BUG FIXED)

4. **Billing period filter buttons**: User asked where they're based from and if there's a way to hide ranges from last year ✅ (ENHANCEMENT ADDED)

## Root Cause Analysis

### The Core Issue: Data Source Mismatch

The application was using **two different data sources** for transactions:

1. **Supabase Database** (Modern approach):
   - Used by: Transactions page, Billers page
   - Method: `getAllTransactions()` service call
   - Storage: PostgreSQL database via Supabase

2. **Browser localStorage** (Legacy approach):
   - Used by: Account Statement page, Account View page
   - Method: `localStorage.getItem('transactions')`
   - Storage: Browser's local storage

### Why This Caused Problems

```
User adds transaction via Transactions page
    ↓
Transaction saved to Supabase ✓
    ↓
User views Account Statement page
    ↓
Statement page reads from localStorage ✗
    ↓
Transaction not found (it's in Supabase, not localStorage)
    ↓
Result: "Transactions were lost"
```

## Solutions Implemented

### 1. Fixed Account Statement Page

**File:** `pages/accounts/statement.tsx`

**Changes:**
- Added import: `import { getAllTransactions } from '../../src/services/transactionsService';`
- Replaced localStorage code with async Supabase call
- Converted Supabase transaction format to local format

**Before:**
```typescript
const txRaw = localStorage.getItem('transactions');
let allTx: Transaction[] = [];
if (txRaw) {
  try {
    allTx = JSON.parse(txRaw);
  } catch (error) {
    console.error('Failed to parse transactions from localStorage:', error);
  }
}
```

**After:**
```typescript
const { data: transactionsData, error: transactionsError } = await getAllTransactions();

if (transactionsError) {
  console.error('Error loading transactions:', transactionsError);
  return;
}

if (!transactionsData) {
  setCycles([]);
  return;
}

// Convert Supabase transactions to local format
const allTx: Transaction[] = transactionsData.map(t => ({
  id: t.id,
  name: t.name,
  date: t.date,
  amount: t.amount,
  paymentMethodId: t.payment_method_id
}));
```

### 2. Fixed Account View Page

**File:** `pages/accounts/view.tsx`

**Changes:**
- Added import: `import { getAllTransactions } from '../../src/services/transactionsService';`
- Replaced localStorage code with async Supabase call
- Wrapped in async function pattern

**Before:**
```typescript
const txRaw = localStorage.getItem('transactions');
let allTx: Transaction[] = [];
if (txRaw) {
  try { allTx = JSON.parse(txRaw); } catch {}
}
const filtered = accountId ? allTx.filter(tx => tx.paymentMethodId === accountId) : [];
setTransactions(filtered);
```

**After:**
```typescript
const loadTransactions = async () => {
  const { data: transactionsData, error: transactionsError } = await getAllTransactions();
  
  if (transactionsError) {
    console.error('Error loading transactions:', transactionsError);
    return;
  }
  
  if (!transactionsData) {
    setTransactions([]);
    return;
  }
  
  const allTx: Transaction[] = transactionsData.map(t => ({
    id: t.id,
    name: t.name,
    date: t.date,
    amount: t.amount,
    paymentMethodId: t.payment_method_id
  }));
  
  const filtered = accountId ? allTx.filter(tx => tx.paymentMethodId === accountId) : [];
  setTransactions(filtered);
};

loadTransactions();
```

### 3. Enhanced Billing Cycle Calculation

**File:** `src/utils/billingCycles.ts`

**Changes:**
- Added new parameter: `onlyCurrentYear: boolean = false`
- When true, only generates cycles from current month onwards
- Prevents showing cycles from previous years

**New Function Signature:**
```typescript
export const calculateBillingCycles = (
  billingDate: string, 
  numberOfCycles: number = 6,
  onlyCurrentYear: boolean = false  // NEW PARAMETER
): BillingCycle[] => {
```

**Logic Added:**
```typescript
if (onlyCurrentYear) {
  // Only show cycles from current year onwards
  const startMonth = currentMonth;
  const monthsUntilYearEnd = 12 - currentMonth;
  const cyclesToShow = Math.min(numberOfCycles, monthsUntilYearEnd + 3);
  
  for (let i = 0; i < cyclesToShow; i++) {
    // Generate cycles from current month forward
    const cycleStartDate = new Date(currentYear, currentMonth + i, billingDay);
    // ... cycle calculation
  }
} else {
  // Original behavior: look back numberOfCycles months
}
```

**Usage in Statement Page:**
```typescript
// Before: Show last 6 months
const cycleData = calculateBillingCycles(billingDate, 6);

// After: Show current year only, up to 12 cycles
const cycleData = calculateBillingCycles(billingDate, 12, true);
```

### 4. Code Deduplication

**File:** `pages/accounts/statement.tsx`

**Changes:**
- Removed local duplicate implementation of `calculateBillingCycles()`
- Removed local duplicate implementation of `formatDateRange()`
- Now imports these from shared utility: `src/utils/billingCycles.ts`

**Benefits:**
- Single source of truth for billing cycle logic
- Easier to maintain and update
- Consistent behavior across application

## Flow Diagram: Before vs After

### Before (Broken)

```
┌─────────────────┐
│ Transactions    │
│ Page            │
│                 │
│ [Add Transaction]
└────────┬────────┘
         │
         ↓
  ┌──────────────┐
  │  Supabase    │
  │  Database    │
  └──────────────┘
         ↑
         │
┌────────┴────────┐
│ Billers Page    │
│ (can read txs)  │
└─────────────────┘

┌──────────────────┐
│ localStorage     │
│ (empty/outdated) │
└────────┬─────────┘
         │
         ↓
┌────────┴─────────┐
│ Statement Page   │
│ (no transactions)│
└──────────────────┘
```

### After (Fixed)

```
┌─────────────────┐
│ Transactions    │
│ Page            │
│                 │
│ [Add Transaction]
└────────┬────────┘
         │
         ↓
  ┌──────────────┐
  │  Supabase    │◄────────┐
  │  Database    │         │
  └──────┬───────┘         │
         │                 │
         ├─────────────────┤
         │                 │
         ↓                 ↓
┌────────┴────────┐ ┌─────┴──────────┐
│ Billers Page    │ │ Statement Page │
│ (reads from DB) │ │ (reads from DB)│
└─────────────────┘ └────────────────┘
```

## Testing Guide

### Test Case 1: Add Transaction and Verify Visibility

1. **Go to Transactions page**
2. **Add a new transaction**:
   - Name: "Test Purchase"
   - Date: Today's date
   - Amount: 100
   - Payment Method: Select a credit account
3. **Save the transaction**
4. **Go to Accounts > [Select Credit Account] > View Statement**
5. **Expected Result**: Transaction should appear in the appropriate billing cycle
6. **Go to Accounts > [Select Credit Account] > View**
7. **Expected Result**: Transaction should appear in the list

### Test Case 2: Verify Billing Cycle Filtering

1. **Go to Accounts > [Select Credit Account] > View Statement**
2. **Check the billing cycle selector**
3. **Expected Result**: 
   - Only cycles from current month onwards
   - No cycles from previous year
   - Up to ~12-15 cycles shown (current year + 3 months into next year)

### Test Case 3: Verify Billers with Linked Accounts

1. **Go to Billers page**
2. **Select a Loans-category biller with linked credit account**
3. **Click "View Details"**
4. **Expected Result**: 
   - Schedule shows billing cycle date ranges (e.g., "Jan 12 – Feb 11, 2026")
   - Amounts are calculated from actual transactions in each cycle
   - "From linked account" indicator appears

## Migration Notes

### For Existing Users

If users have transactions stored in localStorage, they need to:

1. **Option A**: Manually re-enter transactions via Transactions page
2. **Option B**: Use Supabase migration script (if available)

**Note**: This fix assumes users are using Supabase. If localStorage is still needed for offline support, additional work would be required to sync between the two.

### Data Consistency

After this fix:
- All new transactions go to Supabase
- All pages read from Supabase
- No more split-brain scenarios
- Data persists across devices (if using same Supabase account)

## Performance Considerations

### Before
- localStorage reads: Instant (synchronous)
- No network calls needed

### After
- Supabase reads: ~100-500ms (async, network dependent)
- Requires active internet connection

### Optimization Opportunities (Future)

1. **Client-side caching**: Cache transactions in memory after first load
2. **Optimistic updates**: Show UI changes immediately, sync in background
3. **Pagination**: Load transactions in chunks for accounts with many transactions
4. **Offline mode**: Sync localStorage with Supabase when online

## Related Files

- `pages/accounts/statement.tsx` - Account statement with billing cycles
- `pages/accounts/view.tsx` - Account transaction list
- `pages/transactions.tsx` - Transaction management (already using Supabase)
- `pages/Billers.tsx` - Billers with linked accounts (already using Supabase)
- `src/utils/billingCycles.ts` - Shared billing cycle utilities
- `src/services/transactionsService.ts` - Supabase transaction service

## Future Improvements

- [ ] Add loading states while fetching transactions
- [ ] Add error handling with user-friendly messages
- [ ] Add retry logic for failed Supabase calls
- [ ] Add offline support with localStorage sync
- [ ] Add transaction caching to reduce API calls
- [ ] Add real-time updates using Supabase subscriptions
