# Budget Setup Migration to payment_schedules Table

## Overview
This document describes the migration of Budget Setup logic from using embedded `schedules` arrays in Biller objects to querying directly from the unified `payment_schedules` table.

## Problem Statement
Previously, payment schedules were stored as JSONB arrays within the `billers` table:
- **Issue 1**: Data duplication and potential inconsistency
- **Issue 2**: Complex nested array queries
- **Issue 3**: Difficult to join with other tables
- **Issue 4**: No support for installment schedules

## Solution
Migrate to a unified `payment_schedules` table that:
- Stores one row per entity (biller or installment) per month/year
- Supports both billers and installments via `biller_id` and `installment_id`
- Enables efficient joins and queries
- Provides a single source of truth for all payment data

## Database Changes

### payment_schedules Table Schema
```sql
CREATE TABLE payment_schedules (
  id UUID PRIMARY KEY,
  biller_id UUID REFERENCES billers(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES installments(id) ON DELETE CASCADE,
  schedule_month TEXT NOT NULL,
  schedule_year TEXT NOT NULL,
  expected_amount NUMERIC NOT NULL,
  amount_paid NUMERIC,
  receipt TEXT,
  date_paid DATE,
  account_id UUID REFERENCES accounts(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Either biller_id or installment_id must be set (but not both)
  CONSTRAINT check_biller_or_installment 
  CHECK (
    (biller_id IS NOT NULL AND installment_id IS NULL) OR 
    (biller_id IS NULL AND installment_id IS NOT NULL)
  )
);
```

### Key Constraints
1. **Unique Schedules**: Separate unique indexes for biller and installment schedules
2. **Referential Integrity**: Foreign keys with cascade delete
3. **Mutual Exclusivity**: Either biller_id or installment_id, not both

## Code Changes

### 1. Service Layer (`src/services/paymentSchedulesService.ts`)

#### New Type
```typescript
export interface PaymentScheduleWithDetails extends SupabasePaymentSchedule {
  biller?: {
    id: string;
    name: string;
    category: string;
    timing: string;
  } | null;
  installment?: {
    id: string;
    name: string;
    timing: string;
  } | null;
}
```

#### New Query Function
```typescript
export const getPaymentSchedulesForBudget = async (
  month: string,
  year: string,
  timing?: '1/2' | '2/2'
): Promise<{ data: PaymentScheduleWithDetails[] | null; error: any }>
```

This function:
- Queries payment_schedules with joins to billers and installments
- Filters by month, year, and optionally timing
- Returns all data needed for Budget display in one query

### 2. Budget Component (`pages/Budget.tsx`)

#### Added State
```typescript
const [paymentSchedules, setPaymentSchedules] = useState<PaymentScheduleWithDetails[]>([]);
const [paymentSchedulesLoading, setPaymentSchedulesLoading] = useState(false);
```

#### Added useEffect
Loads schedules when month or timing changes:
```typescript
useEffect(() => {
  const loadPaymentSchedules = async () => {
    const { data } = await getPaymentSchedulesForBudget(
      selectedMonth,
      currentYear,
      selectedTiming
    );
    setPaymentSchedules(data || []);
  };
  loadPaymentSchedules();
}, [selectedMonth, selectedTiming]);
```

#### Helper Functions
```typescript
const findScheduleForBiller = useCallback((billerId: string) => {
  return paymentSchedules.find(ps => ps.biller_id === billerId);
}, [paymentSchedules]);

const findScheduleForInstallment = useCallback((installmentId: string) => {
  return paymentSchedules.find(ps => ps.installment_id === installmentId);
}, [paymentSchedules]);
```

#### Schedule Access Changes

**Before**:
```typescript
const schedule = biller.schedules.find(s => s.month === selectedMonth);
```

**After**:
```typescript
const dbSchedule = findScheduleForBiller(biller.id);
// Convert to PaymentSchedule format if needed
const schedule: PaymentSchedule = {
  id: dbSchedule.id,
  month: dbSchedule.schedule_month,
  year: dbSchedule.schedule_year,
  expectedAmount: dbSchedule.expected_amount,
  // ... other fields
};
```

#### Payment Marking Changes

**Before**:
```typescript
const updatedSchedules = biller.schedules.map(s => {
  if (s.id === schedule.id) {
    return { ...s, amountPaid, datePaid, receipt, accountId };
  }
  return s;
});
await onUpdateBiller({ ...biller, schedules: updatedSchedules });
```

**After**:
```typescript
const dbSchedule = findScheduleForBiller(biller.id);
await markPaymentScheduleAsPaid(
  dbSchedule.id,
  amountPaid,
  datePaid,
  accountId,
  receipt
);

// Reload schedules to reflect changes
const { data } = await getPaymentSchedulesForBudget(
  selectedMonth,
  currentYear,
  selectedTiming
);
setPaymentSchedules(data || []);
```

## Migration Benefits

### 1. Single Source of Truth
✅ All payment schedules in one table
✅ No risk of embedded arrays getting out of sync
✅ Consistent data across all features

### 2. Better Performance
✅ Database joins instead of nested array manipulation
✅ Indexed queries for fast lookups
✅ One query fetches all needed data

### 3. Simplified Queries
✅ Standard SQL instead of JSONB operations
✅ Easy filtering by month/year/timing
✅ Simple joins with billers and installments

### 4. Extensibility
✅ Support for both billers and installments
✅ Easy to add new payment types
✅ Straightforward schema evolution

### 5. Data Integrity
✅ Foreign key constraints ensure referential integrity
✅ Unique constraints prevent duplicates
✅ Cascade delete cleans up orphaned records

## Testing Checklist

### Database Migration
- [ ] Run table creation migration
- [ ] Run installment_id addition migration
- [ ] Verify constraints are in place
- [ ] Check indexes are created

### Budget Page Functionality
- [ ] Schedules load correctly when changing month/timing
- [ ] Schedule data displays with correct amounts
- [ ] Payment marking works and persists
- [ ] Schedules reload after payment
- [ ] Linked account calculations work correctly
- [ ] Transaction matching works as expected

### Backwards Compatibility
- [ ] Existing billers with embedded schedules still work
- [ ] Legacy data can be migrated
- [ ] No breaking changes for other features

## Known Issues and Future Work

### Current Limitations
1. **Installment schedules**: Not yet generated automatically (only billers)
2. **Year boundary**: Schedules only created for activation year
3. **Schedule regeneration**: Editing biller dates doesn't update schedules

### Future Enhancements
1. **Automatic installment schedules**: Create schedules when installment is added
2. **Multi-year support**: Generate schedules across year boundaries
3. **Schedule synchronization**: Update schedules when biller/installment details change
4. **Bulk operations**: Efficiently mark multiple payments at once

## Rollback Plan

If issues arise, the migration can be rolled back:

1. **Revert code changes**: Check out previous commit
2. **Keep database**: payment_schedules table can coexist with embedded arrays
3. **Data preservation**: Both data sources remain valid
4. **Gradual migration**: Can migrate features one by one

The embedded `schedules` arrays in the billers table are preserved for backwards compatibility, so reverting code changes will restore previous functionality without data loss.

## Conclusion

The migration to the unified `payment_schedules` table provides:
- ✅ Better data architecture
- ✅ Improved performance
- ✅ Simplified code
- ✅ Enhanced extensibility
- ✅ Strong data integrity

All Budget Setup functionality now queries from and updates the payment_schedules table directly, eliminating embedded array complexity and ensuring consistent, reliable payment tracking.
