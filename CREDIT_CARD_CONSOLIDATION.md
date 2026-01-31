# Credit Card Transaction Consolidation

## Overview

This feature automatically consolidates credit card transactions into monthly billing cycle summaries that appear in the Billers view. It provides a seamless integration between transaction recording, statement viewing, and bill management.

## Problem Solved

Previously, credit card transactions were scattered across:
- Transaction page (manual entries)
- Budget Setup > Purchases > Pay (category-based entries)
- Accounts > View Statement (transaction list by billing cycle)

There was no automatic way to see monthly credit card totals in the Billers view where other recurring bills are managed.

## Solution: Virtual Credit Card Billers

Virtual billers are dynamically generated from credit card transactions and appear alongside regular billers in the Billers view.

### Key Features

1. **Automatic Aggregation**
   - Transactions are grouped by billing cycle
   - Only credit card accounts with a billing date generate virtual billers
   - Installment payments are excluded from totals

2. **Billing Cycle Logic**
   - Start date: Account's billing date (e.g., 10th of each month)
   - End date: Day before next billing date
   - Shows last 6 billing cycles
   - Handles month boundaries correctly

3. **Visual Distinction**
   - Purple color scheme (vs. blue for regular billers)
   - "Auto-tracked" badge
   - Credit card icon instead of bell icon
   - Special styling on cards and detail views

4. **Seamless Navigation**
   - Statement page → "View in Billers" button
   - Billers detail → "View Full Statement" button
   - Schedule rows link to statement for transaction details

## How It Works

### User Flow

#### Adding Transactions
1. User adds a transaction via:
   - Transaction page (manual entry), OR
   - Budget Setup > Purchases > Pay button
2. Transaction is saved with:
   - Name (merchant/description)
   - Amount
   - Date
   - Payment Method ID (credit card account)

#### Viewing in Statement
1. Navigate to Accounts
2. Click "View Statement" on a credit card
3. Select a billing cycle to see:
   - All transactions in that cycle
   - Total charges for the cycle
   - Credit limit and available credit
   - **NEW**: "View in Billers" button

#### Viewing in Billers
1. Navigate to Billers
2. Virtual credit card billers appear with purple styling
3. Each biller shows:
   - Credit card name + "Statement"
   - "Auto-tracked" badge
   - Billing date and timing (1/2 or 2/2)
4. Click "Details" to see:
   - Monthly breakdown by billing cycle
   - Total amount per cycle
   - Transaction count per cycle
   - "View" button → links to full statement

### Technical Flow

```
Transaction Creation
       ↓
Stored in Supabase (transactions table)
       ↓
Statement Page: Filters by payment_method_id + billing cycle
       ↓
Billers Page: generateCreditCardVirtualBiller()
       ↓
aggregateCreditCardPurchases() - groups by cycle
       ↓
Virtual Biller with Schedules
       ↓
Displayed in Billers list (merged with regular billers)
```

## Implementation Details

### Core Function: `generateCreditCardVirtualBiller()`

**Location**: `src/utils/paymentStatus.ts`

**Purpose**: Generates a virtual biller object from a credit card account

**Parameters**:
- `account`: Credit card account with billing date
- `transactions`: All transactions (filtered to this account)
- `installments`: All installments (excluded from totals)

**Returns**: `Biller | null`

**Logic**:
1. Validates account is a credit card with billing date
2. Calls `aggregateCreditCardPurchases()` to group transactions
3. Parses billing day with validation (default: 15)
4. Calculates timing (1/2 or 2/2) based on billing day
5. Generates schedule entries from cycle summaries
6. Returns virtual biller with metadata

### Data Structure

**Virtual Biller**:
```typescript
{
  id: `virtual-cc-${accountId}`,
  name: `${bankName} Statement`,
  category: 'Credit Card',
  dueDate: billingDate,
  expectedAmount: 0,
  timing: '1/2' | '2/2',
  status: 'active',
  schedules: [...],
  _isVirtual: true,
  _isCreditCardBiller: true,
  _sourceAccountId: accountId
}
```

**Schedule Entry**:
```typescript
{
  month: 'January',
  year: '2026',
  expectedAmount: 15000.00,
  amountPaid: 15000.00,
  receipt: 'Statement-Jan 10 – Feb 9',
  datePaid: '2026-02-09',
  accountId: accountId,
  _isCreditCardBiller: true,
  _transactionCount: 12,
  _cycleLabel: 'Jan 10 – Feb 9',
  _cycleStart: '2026-01-10T00:00:00.000Z',
  _cycleEnd: '2026-02-09T00:00:00.000Z'
}
```

### Integration Points

**1. Billers Page (`pages/Billers.tsx`)**
```typescript
// Generate virtual billers
const virtualCreditCardBillers = accounts
  .filter(acc => acc.classification === 'Credit Card' && acc.billingDate)
  .map(acc => generateCreditCardVirtualBiller(acc, transactions, installments))
  .filter(biller => biller !== null && biller.schedules.length > 0);

// Merge with regular billers
const allBillers = [...billers, ...virtualCreditCardBillers];
```

**2. Statement Page (`pages/accounts/statement.tsx`)**
```typescript
// Link to Billers
<a href="/billers">
  <span>View in Billers</span>
</a>
```

**3. Biller Detail View**
```typescript
// Link to Statement
<a href={`/accounts/statement?account=${sourceAccountId}`}>
  <span>View Full Statement</span>
</a>
```

## UI Components

### Biller Card (List View)

**Regular Biller**:
- Blue/indigo color scheme
- Bell icon
- "Active" or "Inactive" badge
- Three-dot menu (Edit/Delete)

**Credit Card Biller**:
- Purple color scheme
- Credit card icon
- "Auto-tracked" badge
- Eye icon only (no edit/delete)

### Biller Detail View

**Regular Biller**:
- Standard schedule table
- Month | Amount | Action (Pay button)
- Edit and Delete buttons in header

**Credit Card Biller**:
- Purple accent colors
- Info banner explaining auto-tracking
- Extended table: Month | Amount | Transactions | Action
- "View" button instead of "Pay" button
- "View Full Statement" button in header

### Statement Page

**Enhancement**:
- New section below summary
- Shows: "This statement total is automatically reflected in..."
- "View in Billers" button with arrow icon

## Benefits

### For Users
- ✅ See all bills (regular + credit cards) in one place
- ✅ No manual entry of credit card totals
- ✅ Always up-to-date with latest transactions
- ✅ Easy navigation between statement and bills
- ✅ Clear visual distinction between types

### For Developers
- ✅ No database schema changes required
- ✅ Virtual billers computed on-demand
- ✅ Reuses existing transaction aggregation logic
- ✅ Type-safe implementation
- ✅ Clean separation of concerns

### For Maintenance
- ✅ No data synchronization needed
- ✅ No risk of stale data
- ✅ Easy to extend for other account types
- ✅ Clear code organization

## Edge Cases Handled

1. **No Billing Date**: Account without billing date doesn't generate virtual biller
2. **No Transactions**: Cycles with zero transactions are excluded from schedules
3. **Invalid Billing Day**: Falls back to day 15 if parsing fails
4. **Month Boundaries**: Correctly handles billing on 31st in February
5. **Installments**: Excluded from totals using name matching
6. **Multiple Credit Cards**: Each generates its own virtual biller

## Configuration

### Billing Cycle Calculation
- **Number of cycles**: 6 (last 6 months)
- **Cycle boundary**: Based on billing day (e.g., 10th → 10th)

### Transaction Matching
- **Amount tolerance**: ±₱1 (for rounding differences)
- **Name matching**: Minimum 3 characters
- **Date matching**: Within same month and year

## Future Enhancements

Possible improvements:
- [ ] Configurable number of billing cycles
- [ ] Export credit card statements
- [ ] Payment history tracking
- [ ] Budget vs actual comparison per cycle
- [ ] Alert for upcoming due dates
- [ ] Integration with payment reminders

## Testing

### Manual Testing Steps

1. **Create Credit Card Account**
   - Classification: Credit Card
   - Set billing date (e.g., 10th)
   - Set credit limit

2. **Add Transactions**
   - Method 1: Transaction page → Add transaction → Select credit card
   - Method 2: Budget > Purchases → Click Pay → Fill form

3. **Verify Statement View**
   - Navigate to Accounts → View Statement
   - Select billing cycle
   - Verify transactions appear
   - Verify total amount
   - Click "View in Billers"

4. **Verify Billers View**
   - Navigate to Billers (or arrive from statement)
   - Find credit card biller with purple styling
   - Verify "Auto-tracked" badge
   - Click "Details"
   - Verify schedule shows cycles with amounts
   - Verify transaction counts
   - Click "View" button
   - Should navigate to statement page

### Test Scenarios

**Scenario 1: New Credit Card**
- Create account with billing date
- Add 3 transactions
- Expected: Virtual biller appears with 1 cycle showing total

**Scenario 2: Multiple Cycles**
- Add transactions over 3 months
- Expected: 3 cycles appear in schedule, each with correct total

**Scenario 3: Installment Exclusion**
- Add installment with same credit card
- Add regular transaction
- Expected: Only regular transaction counted in total

**Scenario 4: No Transactions**
- Create credit card account
- Don't add any transactions
- Expected: No virtual biller appears (schedules would be empty)

## Troubleshooting

### Virtual Biller Not Appearing

**Check**:
1. Is account classification "Credit Card"?
2. Does account have a billing date set?
3. Are there any transactions for this account?
4. Are transactions within the last 6 months?

**Debug**:
```javascript
console.log('Credit card accounts:', 
  accounts.filter(acc => acc.classification === 'Credit Card'));
console.log('Virtual billers generated:', virtualCreditCardBillers);
```

### Incorrect Totals

**Check**:
1. Are all transactions using correct payment_method_id?
2. Are installments being excluded correctly?
3. Is billing cycle calculation correct?

**Debug**:
```javascript
console.log('Cycle summaries:', aggregateCreditCardPurchases(account, transactions, installments));
```

### Navigation Issues

**Check**:
1. Is source account ID correctly set in virtual biller?
2. Are URLs properly formatted?
3. Are router paths configured correctly?

## Related Files

- `src/utils/paymentStatus.ts` - Core aggregation logic
- `pages/Billers.tsx` - Virtual biller integration
- `pages/accounts/statement.tsx` - Statement view with link
- `types.ts` - Type definitions
- `CREDIT_CARD_CONSOLIDATION.md` - This documentation

## Changelog

**Version 1.0 (2026-01-31)**
- Initial implementation
- Virtual credit card billers
- Automatic aggregation by billing cycle
- Bidirectional navigation (Statement ↔ Billers)
- Type-safe implementation
- Zero security vulnerabilities

---

For questions or issues, refer to the implementation files or create an issue in the repository.
