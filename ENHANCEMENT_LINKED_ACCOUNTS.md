# Enhancement: Loans-Category Billers Linked to Credit Accounts

## Overview

This enhancement allows Loans-category Billers to be linked to credit accounts, enabling dynamic calculation of expected amounts based on the credit account's billing cycle transaction history. Instead of using calendar months (Jan 1-31), the system now uses the actual billing cycle windows (e.g., Jan 12 – Feb 11, 2026) for more accurate tracking.

## Key Features

### 1. Linked Account Support
- Loans-category billers can now be linked to a credit account via a new `linked_account_id` field
- UI shows a dropdown selector (only for Loans category) to choose from available credit accounts with billing dates
- Visual indicators show when a biller is linked to an account (purple badge with link emoji)

### 2. Billing Cycle-Based Calculation
- When a biller is linked to a credit account, the system:
  - Retrieves the credit account's billing date (e.g., "2026-01-12")
  - Calculates billing cycles based on that date (not calendar months)
  - Aggregates all transactions for that account within each cycle
  - Displays the cycle date range (e.g., "Jan 12 – Feb 11, 2026")
  - Shows the total transaction amount for that cycle as the expected amount

### 3. Smart Fallback Logic
- If the linked account is not found: falls back to manual expected amount
- If the account has no billing date: falls back to manual expected amount
- If no transactions exist in a cycle: displays zero or falls back to manual amount
- All fallback scenarios are logged to console for debugging

### 4. Visual Consistency
- Schedule display matches the Account Statement page's billing cycle grouping
- Date ranges are clearly shown instead of just month names
- Purple indicators distinguish linked-account amounts from manual amounts
- "From linked account" label appears next to dynamically calculated amounts

## Implementation Details

### Database Changes

**Migration File:** `supabase/migrations/20260131_add_linked_account_to_billers.sql`

```sql
ALTER TABLE billers 
ADD COLUMN IF NOT EXISTS linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_billers_linked_account_id ON billers(linked_account_id);
```

### Type Changes

**Frontend Type (types.ts):**
```typescript
export interface Biller {
  // ... existing fields
  linkedAccountId?: string; // NEW: Links to credit accounts
}
```

**Supabase Type (src/types/supabase.ts):**
```typescript
export interface SupabaseBiller {
  // ... existing fields
  linked_account_id: string | null; // NEW: UUID FK
}
```

### New Utilities

#### 1. Billing Cycle Utilities (`src/utils/billingCycles.ts`)
- `calculateBillingCycles()` - Generates billing cycle date ranges
- `formatDateRange()` - Formats cycles for display (e.g., "Jan 12 – Feb 11, 2026")
- `isTransactionInCycle()` - Checks if a transaction falls within a cycle
- `aggregateTransactionsByCycle()` - Groups transactions by billing cycles
- `getCycleForMonth()` - Finds the cycle containing a specific month/year

#### 2. Linked Account Utilities (`src/utils/linkedAccountUtils.ts`)
- `shouldUseLinkedAccount()` - Determines if biller should use linked account logic
- `getLinkedAccount()` - Retrieves and validates the linked credit account
- `calculateLinkedAccountAmount()` - Calculates amount from transaction history
- `getScheduleDisplayLabel()` - Gets display label with cycle date range
- `getScheduleExpectedAmount()` - Main calculation function with fallback logic

### UI Changes

#### Add/Edit Biller Forms
- New field: "Linked Credit Account (Optional)" - shown only for Loans category
- Dropdown lists credit accounts that have a billing date set
- Displays account name and billing date for easy selection

#### Biller Cards
- Purple badge shows linked account name (e.g., "🔗 Chase Credit")
- Only displayed when biller is linked to a valid account

#### Schedule Table
- Month column now shows cycle date ranges (e.g., "Jan 12 – Feb 11, 2026")
- Sub-label "From linked account" appears under cycle dates
- Purple dot indicator shows dynamically calculated amounts

## User Flow

### Creating a Linked Biller

1. User clicks "Add Biller"
2. Selects "Loans" category
3. Enters biller name and due date
4. (Optional) Selects a credit account from the "Linked Credit Account" dropdown
5. Saves the biller

### Viewing Linked Biller Details

1. User clicks "Details" on a linked biller
2. Purple badge shows linked account name in header
3. Schedule table shows:
   - Cycle date ranges instead of month names
   - Amounts calculated from actual transactions in each cycle
   - "From linked account" indicator on each row
4. Payment button uses the calculated amount as default

## Edge Cases Handled

1. **Account deleted:** If linked account is deleted, FK constraint sets `linked_account_id` to NULL, and biller falls back to manual amount
2. **Billing date removed:** If billing date is removed from account, calculation falls back to manual amount
3. **No transactions in cycle:** Shows $0.00 or falls back to manual amount
4. **Month with different cycle boundaries:** Correctly identifies which cycle contains that month (e.g., "January 2026" might be in the Dec 12 – Jan 11 cycle or Jan 12 – Feb 11 cycle)
5. **Month boundaries (e.g., Feb 30):** Adjusts billing day to last day of month when needed

## Code Organization

All new code is marked with `// ENHANCEMENT:` comments for easy identification:
- Database schema updates
- Type definitions
- Utility functions
- UI components
- Display logic

## Testing Recommendations

### Functional Testing
1. Create a credit account with a billing date (e.g., 12th of month)
2. Create a Loans-category biller and link it to the credit account
3. Add transactions to the credit account across multiple billing cycles
4. View the biller details and verify:
   - Cycle date ranges match Account Statement page
   - Transaction amounts are correctly aggregated by cycle
   - Visual indicators appear correctly

### Edge Case Testing
1. Create a linked biller, then delete the credit account → verify fallback
2. Create a linked biller, then remove billing date from account → verify fallback
3. Create a linked biller with no transactions → verify shows $0 or manual amount
4. Test with billing dates on month boundaries (1st, 15th, 28th, 31st)

### Accessibility Testing
1. Use screen reader to verify emoji labels are read correctly
2. Verify decorative elements have aria-hidden="true"
3. Check keyboard navigation through dropdowns and forms

## Future Enhancements (TODOs)

These are noted in the code with `// TODO:` comments:

1. **Statement Export Integration:** Export statements with cycle-based grouping
2. **Budget Sync:** Align billing cycles with budget periods
3. **Caching:** Cache billing cycle calculations for performance
4. **Transaction Filtering:** Allow excluding specific transaction categories from aggregation
5. **Manual Override:** Allow users to override calculated amounts for specific cycles
6. **Validation Warnings:** Show warnings when linked account has no transactions in cycle

## Performance Considerations

- Billing cycles are calculated on-demand (not pre-computed)
- Transaction aggregation filters to account transactions first
- 24-cycle lookback (2 years) provides good coverage without excessive computation
- Indexes on `linked_account_id` improve query performance

## Security

- No new security vulnerabilities introduced (verified with CodeQL scanner)
- Foreign key constraints prevent orphaned references
- No sensitive data exposed in UI
- All database operations use existing Supabase service layer

## Compatibility

- Fully backward compatible with existing billers
- Existing billers without `linked_account_id` continue to work as before
- Migration is safe to run on production databases (adds nullable column)
- No breaking changes to existing APIs or UI

## Rollback Plan

If issues arise, the enhancement can be rolled back by:
1. Running: `ALTER TABLE billers DROP COLUMN linked_account_id;`
2. Reverting code changes to previous commit
3. Existing billers will continue to function normally
