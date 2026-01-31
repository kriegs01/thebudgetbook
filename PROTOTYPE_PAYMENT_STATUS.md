# PROTOTYPE: Unified Payment Status & Installment Timing

## Overview
This prototype implements centralized logic for payment status and amount synchronization across the Budget Book application, specifically for credit card regular transactions and installment payments.

## Key Features

### 1. Installment Timing Field
- **What**: Added `timing` field ('1/2' | '2/2') to Installment data model
- **Where**: 
  - `types.ts` - Frontend type definition
  - `src/types/supabase.ts` - Database schema type
  - `supabase/migrations/20260131_add_installment_timing.sql` - Database migration
- **UI Updates**:
  - Add/Edit installment forms include timing selector
  - Installment cards display timing badge
  - Budget Setup filters installments by selected timing

### 2. Centralized Payment Status Utility
- **File**: `src/utils/paymentStatus.ts`
- **Functions**:
  - `checkPaymentStatus()` - Core payment verification using transaction matching
  - `checkInstallmentPaymentStatus()` - Specialized for installment payments
  - `calculateBillingCycles()` - Generate credit card billing cycles
  - `aggregateCreditCardPurchases()` - Group purchases by billing cycle
  - `getInstallmentPaymentSchedule()` - Generate installment payment schedule

### 3. Budget Setup Integration

#### Loans Section Enhancement
- Automatically includes active installments
- Filters by selected timing (1/2 or 2/2)
- Shows payment status with transaction matching
- Read-only display (managed in Installments page)
- Displays account information and term duration

#### Credit Card Purchases Section
- **NEW**: Automatically aggregates regular credit card purchases
- Groups by billing cycle based on account's billing date
- Excludes installment payments to show only regular purchases
- Displays transaction details (name, date, amount)
- Shows cycle total and transaction count

### 4. Transaction Matching Logic
- **Name Matching**: Partial substring match with 3-character minimum
- **Amount Matching**: ±1 peso tolerance for rounding differences
- **Date Matching**: Same month/year or previous year for carryover
- **Performance**: Transactions filtered to last 24 months

## Database Changes

### Migration Required
Run the SQL migration in Supabase:
```sql
-- File: supabase/migrations/20260131_add_installment_timing.sql
ALTER TABLE installments 
ADD COLUMN IF NOT EXISTS timing TEXT CHECK (timing IN ('1/2', '2/2'));
```

### Schema Updates
- `installments.timing` - VARCHAR, nullable, constrained to '1/2' or '2/2'
- Indexed for performance: `idx_installments_timing`

## Usage

### Adding an Installment with Timing
1. Navigate to Installments page
2. Click "New Installment"
3. Fill in details including:
   - Name, amounts, term duration
   - **Timing**: Select '1/2' (first half) or '2/2' (second half)
   - Start date and billing account
4. Save

### Viewing in Budget Setup
1. Navigate to Budget > Setup
2. Select month and timing (1/2 or 2/2)
3. **Loans Section**: 
   - Manual loan items (editable)
   - Installments matching selected timing (read-only, auto-included)
4. **Credit Card Purchases** (if applicable):
   - Shows regular purchases for credit card accounts
   - Grouped by billing cycle
   - Excludes installment transactions

### Payment Verification
- **Green checkmark**: Transaction found matching name, amount, and date
- **Pay button**: No matching transaction, click to record payment
- Payments recorded as transactions for unified tracking

## Integration Points

### Components Updated
- `pages/Installments.tsx` - UI forms and display
- `pages/Budget.tsx` - Budget Setup sections
- `App.tsx` - Pass installments to Budget component

### Services & Utilities
- `src/utils/paymentStatus.ts` - NEW: Centralized utilities
- `src/utils/installmentsAdapter.ts` - Updated for timing field
- `src/services/installmentsService.ts` - Uses adapter
- `src/services/transactionsService.ts` - Used for matching

## Limitations & Future Work

### Current Limitations
1. **Timing field is optional** - Existing installments may not have timing set
2. **Read-only in Budget Setup** - Must edit in Installments page
3. **Credit card cycle matching** - Simple month-based matching, may need refinement
4. **Transaction matching** - Heuristic-based, not 100% accurate
5. **No real-time updates** - Requires page reload after transactions

### Future Enhancements
1. **User-configurable matching rules** - Allow custom tolerance and name matching
2. **Enhanced error handling** - Better feedback for failed matches
3. **Performance optimization** - Caching and indexing for large datasets
4. **Installment payment schedules** - Full schedule view with per-month status
5. **Credit card statement integration** - Direct import from bank statements
6. **Auto-timing detection** - Suggest timing based on installment start date
7. **Bulk timing update** - Update timing for multiple installments at once

### Known Issues
1. Year-end boundary handling for billing cycles needs testing
2. Installments without start date won't appear in schedule generators
3. Credit card accounts without billing date don't show purchase aggregation

## Testing Recommendations

### Manual Testing
1. **Create installment with timing**:
   - Add installment with timing '1/2'
   - Verify appears in Budget Setup when timing '1/2' selected
   - Verify hidden when timing '2/2' selected

2. **Payment verification**:
   - Create transaction matching installment
   - Verify green checkmark appears
   - Create transaction with slightly different amount (within tolerance)
   - Verify still matches

3. **Credit card purchases**:
   - Add credit card account with billing date
   - Create several transactions on that card
   - Create installment on same card
   - Verify Budget Setup shows only regular purchases (excludes installment)

4. **Edge cases**:
   - Installment without timing (should appear in both 1/2 and 2/2)
   - Installment without start date (should still appear, no schedule)
   - Multiple installments with same name (verify distinct by ID)

### Integration Testing
1. **End-to-end flow**:
   - Create installment → Record payment via transaction → Verify in Budget Setup
2. **Data consistency**:
   - Update installment timing → Verify Budget Setup updates
   - Delete installment → Verify removed from Budget Setup
3. **Performance**:
   - Test with 50+ installments and 1000+ transactions
   - Measure load time and rendering performance

## Code Markers

All prototype code is marked with:
- `// PROTOTYPE:` comments for new functionality
- `TODO:` comments for future work
- Inline documentation explaining purpose and limitations

## Support & Questions

For questions or issues with this prototype:
1. Check inline code comments for details
2. Review `src/utils/paymentStatus.ts` documentation
3. Test with sample data before production use
4. Consider the limitations before deploying

## Deployment Checklist

Before deploying to production:
- [ ] Run database migration
- [ ] Test with production-like data volume
- [ ] Verify transaction matching accuracy
- [ ] Review and adjust matching tolerances
- [ ] Add user documentation
- [ ] Set up monitoring for payment verification accuracy
- [ ] Create rollback plan if issues arise
- [ ] Train users on new features

---

**Version**: 1.0 (Prototype)  
**Date**: January 31, 2026  
**Status**: Ready for testing and feedback
