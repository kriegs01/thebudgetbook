# Payment Schedules Refactoring - Migration Guide

## Overview

This refactoring moves payment schedule tracking from an embedded JSONB array in the `billers` table to a dedicated `payment_schedules` table. This provides better data integrity, query performance, and enables unified payment tracking for both billers and installments.

## What Changed

### Database Schema Changes

1. **New Table: `payment_schedules`**
   - Stores individual payment schedule records
   - Links to billers via `biller_id` or installments via `installment_id`
   - Tracks payment status with `amount_paid`, `date_paid`, `account_id`, `receipt`
   - Enforces unique constraint per month/year for each biller/installment
   - Location: `supabase/migrations/20260203_create_payment_schedules_table.sql`

2. **Billers Table Modified**
   - Removed `schedules` JSONB column (was storing embedded array)
   - Location: `supabase/migrations/20260203_remove_schedules_from_billers.sql`

3. **Data Migration**
   - Existing schedules copied from `billers.schedules` to `payment_schedules` table
   - Location: `supabase/migrations/20260203_migrate_biller_schedules_data.sql`

### Code Changes

#### Type Definitions
- **`types.ts`**: Removed `schedules` array from `Biller` interface, added foreign key fields to `PaymentSchedule`
- **`src/types/supabase.ts`**: 
  - Removed `schedules` from `SupabaseBiller`
  - Added new `SupabasePaymentSchedule` interface

#### Services Layer
- **New**: `src/services/paymentSchedulesService.ts` - CRUD operations for payment_schedules table
- **Updated**: `src/utils/billersAdapter.ts` - Removed schedule ID generation and schedules handling

#### UI Components

1. **`pages/Billers.tsx`** - Major refactoring:
   - Loads schedules from `payment_schedules` table when viewing biller details
   - Payment marking now updates `payment_schedules` table directly via `markPaymentScheduleAsPaid()`
   - Removed embedded schedule generation when creating billers
   - Uses local state cache (`billerSchedules`) for loaded schedules

2. **`pages/Budget.tsx`** - Moderate refactoring:
   - Payment submission now uses `upsertPaymentSchedule()` and `markPaymentScheduleAsPaid()`
   - Sync effect simplified to use `biller.expectedAmount` as default
   - Payment status checking relies on transaction matching (more reliable than schedule checks)
   - Creates temporary schedule objects for Pay modal when needed

3. **`App.tsx`** - Minor updates:
   - Removed `schedules` from biller adapter functions
   - Added `linkedAccountId` support

## Migration Steps

### 1. Run Database Migrations

Execute migrations in order:

```sql
-- 1. Create payment_schedules table
\i supabase/migrations/20260203_create_payment_schedules_table.sql

-- 2. Migrate existing data
\i supabase/migrations/20260203_migrate_biller_schedules_data.sql

-- 3. Remove old schedules column (ONLY after verifying data migration)
\i supabase/migrations/20260203_remove_schedules_from_billers.sql
```

**⚠️ Important**: Test data migration thoroughly before running step 3!

### 2. Deploy Code Changes

Deploy all code changes together to avoid runtime errors from schema mismatches.

### 3. Verify Migration

After deployment, verify:
- [ ] Existing billers load correctly without schedules embedded
- [ ] Payment schedules display in biller detail view
- [ ] New payments are saved to `payment_schedules` table
- [ ] Budget setup loads and displays correctly
- [ ] Payment marking works in both Billers and Budget pages
- [ ] Transaction matching correctly identifies paid items

## API Changes

### Before (Embedded Schedules)
```typescript
// Biller included schedules array
interface Biller {
  id: string;
  name: string;
  schedules: PaymentSchedule[]; // ❌ Removed
  // ... other fields
}

// Update payment by updating entire biller
await onUpdateBiller({ 
  ...biller, 
  schedules: updatedSchedules 
});
```

### After (Separate Table)
```typescript
// Biller no longer includes schedules
interface Biller {
  id: string;
  name: string;
  // ... other fields (no schedules)
}

// Load schedules separately
const { data: schedules } = await getPaymentSchedulesByBillerId(billerId);

// Update payment directly in payment_schedules table
await markPaymentScheduleAsPaid(
  scheduleId,
  amountPaid,
  datePaid,
  accountId,
  receipt
);
```

## Benefits

1. **Better Data Integrity**: Foreign key constraints ensure schedules always link to valid billers/installments
2. **Improved Performance**: Indexed queries on month/year and entity IDs are faster than JSONB searches
3. **Unified Model**: Both billers and installments use same schedule structure
4. **Cleaner Code**: Separation of concerns between biller data and payment tracking
5. **Easier Queries**: Direct SQL queries for payment status vs. JSONB array manipulation

## Known Limitations & Future Work

### Current Workarounds

1. **Budget.tsx Schedule Loading**: Currently uses `biller.expectedAmount` as default instead of loading actual schedules for the sync effect. Transaction matching handles payment status reliably.

2. **Schedule Creation**: Schedules are now created on-demand when first payment is made, rather than upfront for 12 months. This is more efficient but means empty billers won't have schedules until paid.

3. **Transaction Matching Primary**: Payment status relies primarily on transaction matching algorithm rather than schedule.amountPaid checks. This is more reliable but may need tuning for edge cases.

### Future Enhancements

- [ ] Load schedules asynchronously for Budget setup view to show accurate amounts
- [ ] Add bulk schedule creation API for users who want to pre-populate schedules
- [ ] Enhance schedule display with payment history timeline
- [ ] Add schedule analytics and reporting features
- [ ] Optimize schedule caching strategy across components

## Rollback Procedure

If issues occur:

1. **DO NOT** run the migration that removes `schedules` column from billers table
2. Revert code changes to previous version that uses embedded schedules
3. Keep `payment_schedules` table for data integrity but don't query it
4. Report issues and plan fixes before attempting migration again

## Testing Checklist

- [ ] Create new biller - should save without schedules
- [ ] View existing biller details - schedules should load from payment_schedules table
- [ ] Mark payment in Billers page - should update payment_schedules table
- [ ] Mark payment in Budget page - should update payment_schedules table
- [ ] Check payment status indicators - should show correct paid/unpaid state
- [ ] Edit biller - should save correctly without modifying schedules
- [ ] Delete biller - schedules should cascade delete (check database)
- [ ] Budget setup sync - items should populate with correct amounts
- [ ] Transaction matching - should correctly identify paid items

## Support & Questions

For questions or issues related to this refactoring:
1. Check migration logs for database errors
2. Check browser console for frontend errors
3. Verify database schema matches expected structure
4. Ensure all code changes were deployed together

## File Manifest

### Migrations
- `supabase/migrations/20260203_create_payment_schedules_table.sql`
- `supabase/migrations/20260203_migrate_biller_schedules_data.sql`
- `supabase/migrations/20260203_remove_schedules_from_billers.sql`

### Services
- `src/services/paymentSchedulesService.ts` (new)
- `src/utils/billersAdapter.ts` (updated)

### Types
- `types.ts` (updated)
- `src/types/supabase.ts` (updated)

### Components
- `pages/Billers.tsx` (major refactoring)
- `pages/Budget.tsx` (moderate refactoring)
- `App.tsx` (minor updates)
