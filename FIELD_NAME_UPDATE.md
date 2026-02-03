# Field Name Update: schedule_month and schedule_year

## Overview
This document describes the changes made to align the payment schedules implementation with the exact field name requirements specified in the problem statement.

## Changes Made

### 1. Database Migration
**File**: `supabase/migrations/20260203_rename_to_schedule_month_year.sql`

Renamed columns in `payment_schedules` table:
- `month` → `schedule_month`
- `year` → `schedule_year`

Updated constraints and indexes:
- `unique_biller_month_year` → `unique_biller_schedule_month_year`
- `unique_installment_month_year` → `unique_installment_schedule_month_year`
- All indexes updated to use new field names

### 2. Type Definitions
**File**: `src/types/supabase.ts`

Updated `SupabasePaymentSchedule` interface:
```typescript
export interface SupabasePaymentSchedule {
  id: string;
  schedule_month: string;  // Changed from 'month'
  schedule_year: number;   // Changed from 'year'
  expected_amount: number;
  // ... other fields
}
```

### 3. Service Layer
**File**: `src/services/paymentSchedulesService.ts`

Updated all functions to use new field names:

**Conversion Functions**:
- `supabasePaymentScheduleToFrontend()`: Maps `schedule_month` → `month` (frontend)
- `frontendPaymentScheduleToSupabase()`: Maps `month` → `schedule_month` (database)

**Query Functions**:
- `getPaymentSchedulesByMonthYear()`: Uses `.eq('schedule_month', ...)` and `.eq('schedule_year', ...)`
- `getPaymentScheduleByBillerMonthYear()`: Updated to use new field names
- `getPaymentScheduleByInstallmentMonthYear()`: Updated to use new field names

**Upsert Function**:
- `upsertPaymentSchedule()`: Updated onConflict to use `'biller_id,schedule_month,schedule_year'`

### 4. Application Layer
**File**: `App.tsx`

Updated schedule creation for billers and installments:

**Biller Schedule Creation**:
```typescript
upsertPaymentSchedule({
  schedule_month: scheduleMonth,  // Changed from 'month'
  schedule_year: scheduleYear,    // Changed from 'year'
  expected_amount: newBiller.expectedAmount,
  biller_id: data.id,
  // ...
})
```

**Installment Schedule Creation**:
```typescript
upsertPaymentSchedule({
  schedule_month: scheduleMonth,  // Changed from 'month'
  schedule_year: scheduleYear,    // Changed from 'year'
  expected_amount: newInstallment.monthlyAmount,
  installment_id: data.id,
  // ...
})
```

## Why These Changes?

The problem statement specifically required:
> "Field names: must match exactly as above."
> "Table: payment_schedules"
> "Columns: id, biller_id, schedule_month, schedule_year, expected_amount..."

The original implementation used `month` and `year`, which didn't match the specification. These changes ensure exact compliance with the requirements.

## Frontend vs Database Field Names

**Frontend** (user-facing, camelCase):
- `month`: Month name (e.g., "January")
- `year`: Year string (e.g., "2026")

**Database** (snake_case):
- `schedule_month`: Month name (e.g., "January")
- `schedule_year`: Year integer (e.g., 2026)

The service layer handles conversion between these formats automatically.

## Backward Compatibility

⚠️ **Breaking Change**: Existing databases must run the migration to rename columns.

**Migration Steps**:
1. Run `20260203_rename_to_schedule_month_year.sql`
2. Existing data is preserved (column rename only)
3. Deploy updated application code

**No Code Changes Needed For**:
- Frontend components (they use the conversion layer)
- UI displays (month/year names unchanged)
- User interactions (no visible changes)

## Testing Checklist

- [x] Build passes successfully
- [x] Type definitions updated
- [x] Service layer uses new field names
- [x] Queries use correct field names
- [x] Upsert uses correct onConflict fields
- [x] Biller creation generates schedules
- [x] Installment creation generates schedules
- [ ] Database migration tested
- [ ] Manual verification of schedule creation
- [ ] Manual verification of schedule queries

## Impact Analysis

### Changed
- Database column names
- Type definitions
- Service layer queries
- Unique constraint names
- Index names
- onConflict specifications

### Unchanged
- Frontend display logic
- User interface
- Business logic
- Schedule generation logic
- Payment status logic
- Transaction handling

## Migration Safety

The migration is safe because:
1. Column rename preserves all existing data
2. Constraints are recreated with same logic
3. Indexes are recreated for performance
4. Foreign keys remain intact (CASCADE behavior preserved)
5. No data transformation required

## Verification

After deployment, verify:
```sql
-- Check column names
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'payment_schedules';

-- Expected: schedule_month (text), schedule_year (integer)

-- Check constraints
SELECT constraint_name 
FROM information_schema.table_constraints 
WHERE table_name = 'payment_schedules' 
  AND constraint_type = 'UNIQUE';

-- Expected: unique_biller_schedule_month_year, unique_installment_schedule_month_year
```

## Summary

✅ **All field names now match the specification exactly**
✅ **Build successful with no errors**
✅ **Type safety maintained**
✅ **Conversion layer handles frontend/database mapping**
✅ **Schedule generation logic unchanged**
✅ **Ready for deployment after migration**

---
**Updated**: 2026-02-03
**Migration Required**: Yes
**Breaking Change**: Yes (database schema only)
**User Impact**: None (transparent to users)
