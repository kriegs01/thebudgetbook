# Payment Status Refactoring - Implementation Guide

## Overview
This document describes the refactoring of the payment status tracking system to use separate, dedicated tables with explicit paid status fields for both biller and installment payment schedules.

## Problem Statement
The previous system had several issues:
1. **Ambiguous paid status**: Payment status was inferred from transaction matching heuristics, which was error-prone
2. **No explicit tracking**: Individual payment entries didn't have a clear `paid` boolean field
3. **JSONB storage**: Biller schedules were stored as JSONB arrays, making queries and updates difficult
4. **No relational integrity**: Payment entries weren't properly linked to their parent schedules with foreign keys

## Solution Architecture

### New Database Tables

#### 1. `biller_payment_schedules`
Stores individual payment schedules for billers with explicit paid status.

**Key Columns:**
- `id` (UUID): Unique identifier for each payment schedule entry
- `biller_id` (UUID): Foreign key to `billers` table with CASCADE delete
- `month` (TEXT): Month name (e.g., "January")
- `year` (TEXT): Year (e.g., "2026")
- `expected_amount` (NUMERIC): Expected payment amount
- `amount_paid` (NUMERIC): Actual amount paid (nullable)
- `paid` (BOOLEAN): **Explicit paid status** - TRUE when payment recorded, FALSE otherwise
- `date_paid` (DATE): Date when payment was made
- `receipt` (TEXT): Receipt reference
- `account_id` (UUID): Foreign key to `accounts` table
- `created_at`, `updated_at` (TIMESTAMPTZ): Audit timestamps

**Indexes:**
- `biller_id` for efficient lookups by biller
- `month, year` for filtering by time period
- `paid` for filtering unpaid entries
- Unique constraint on `(biller_id, month, year)`

#### 2. `installment_payment_schedules`
Stores individual payment schedules for installments with explicit paid status.

**Key Columns:**
- `id` (UUID): Unique identifier for each payment schedule entry
- `installment_id` (UUID): Foreign key to `installments` table with CASCADE delete
- `payment_number` (INTEGER): Sequential payment number (1-based)
- `month` (TEXT): Month name (e.g., "January")
- `year` (TEXT): Year (e.g., "2026")
- `expected_amount` (NUMERIC): Expected payment amount
- `amount_paid` (NUMERIC): Actual amount paid (nullable)
- `paid` (BOOLEAN): **Explicit paid status** - TRUE when payment recorded, FALSE otherwise
- `date_paid` (DATE): Date when payment was made
- `receipt` (TEXT): Receipt reference
- `account_id` (UUID): Foreign key to `accounts` table
- `due_date` (DATE): Due date for this payment
- `created_at`, `updated_at` (TIMESTAMPTZ): Audit timestamps

**Indexes:**
- `installment_id` for efficient lookups by installment
- `payment_number` for sequential ordering
- `month, year` for filtering by time period
- `paid` for filtering unpaid entries
- Unique constraints on `(installment_id, payment_number)` and `(installment_id, month, year)`

### Data Migration

#### Migration Scripts
1. **`20260203_create_biller_payment_schedules.sql`**: Creates the biller payment schedules table
2. **`20260203_create_installment_payment_schedules.sql`**: Creates the installment payment schedules table
3. **`20260203_migrate_biller_schedules_data.sql`**: Migrates existing JSONB schedules to the new table
4. **`20260203_migrate_installment_schedules_data.sql`**: Generates payment schedules for existing installments

#### Migration Strategy
The migration scripts handle:
- Extracting schedules from JSONB columns
- Inferring paid status from `amountPaid` values
- Generating sequential payment schedules based on start dates and term durations
- Maintaining data integrity with proper foreign key relationships

### TypeScript Type System

#### New Types

**`SupabaseBillerPaymentSchedule`** (Database schema)
```typescript
interface SupabaseBillerPaymentSchedule {
  id: string;
  biller_id: string;
  month: string;
  year: string;
  expected_amount: number;
  amount_paid: number | null;
  paid: boolean;
  date_paid: string | null;
  receipt: string | null;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}
```

**`BillerPaymentSchedule`** (Frontend type)
```typescript
interface BillerPaymentSchedule {
  id: string;
  billerId: string;
  month: string;
  year: string;
  expectedAmount: number;
  amountPaid?: number;
  paid: boolean;
  datePaid?: string;
  receipt?: string;
  accountId?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

Similar types exist for `SupabaseInstallmentPaymentSchedule` and `InstallmentPaymentSchedule`.

### Service Layer

#### Biller Payment Schedules Service
**File**: `src/services/billerPaymentSchedulesService.ts`

Key functions:
- `getPaymentSchedulesByBillerId(billerId)`: Get all schedules for a biller
- `markPaymentScheduleAsPaid(id, amountPaid, datePaid, accountId, receipt)`: Mark a payment as paid
- `getUnpaidPaymentSchedules()`: Get all unpaid schedules
- `getPaymentSchedulesByMonthYear(month, year)`: Filter by time period

#### Installment Payment Schedules Service
**File**: `src/services/installmentPaymentSchedulesService.ts`

Key functions:
- `getPaymentSchedulesByInstallmentId(installmentId)`: Get all schedules for an installment
- `createPaymentSchedules(schedules[])`: Bulk create schedules
- `markPaymentScheduleAsPaid(id, amountPaid, datePaid, accountId, receipt)`: Mark a payment as paid
- `getNextUnpaidPayment(installmentId)`: Get the next unpaid payment in sequence
- `getUnpaidPaymentSchedules()`: Get all unpaid schedules

### Adapter Layer

Adapters convert between database snake_case and frontend camelCase:

- **`billerPaymentSchedulesAdapter.ts`**: Converts `SupabaseBillerPaymentSchedule` ↔ `BillerPaymentSchedule`
- **`installmentPaymentSchedulesAdapter.ts`**: Converts `SupabaseInstallmentPaymentSchedule` ↔ `InstallmentPaymentSchedule`

### UI Integration

#### Billers Page (`pages/Billers.tsx`)

**Changes:**
1. Import the new service: `markPaymentScheduleAsPaid`
2. Updated `handlePaySubmit` to:
   - First try to mark the payment in the new `biller_payment_schedules` table
   - Fall back to updating legacy JSONB schedules if the new table update fails
   - Set `paid: true` explicitly when marking payments
3. Updated paid status check to use explicit `paid` field:
   ```typescript
   const isPaidExplicit = sched.paid !== undefined ? sched.paid : (!!sched.amountPaid);
   ```

**Backward Compatibility:**
- Still reads from JSONB `schedules` column if new table is unavailable
- Updates both new table and JSONB column during payment marking
- Gracefully degrades to legacy behavior if new table doesn't exist

#### Installments Page (`pages/Installments.tsx`)

**Changes:**
1. Import the new services: `markPaymentScheduleAsPaid`, `getNextUnpaidPayment`
2. Updated `handlePaySubmit` to:
   - Find the next unpaid payment schedule
   - Mark that specific payment as paid in the `installment_payment_schedules` table
   - Update the installment's `paidAmount` for backward compatibility
3. Added support for sequential payment tracking

**Automatic Schedule Generation:**
- When a new installment is created with a `start_date`, payment schedules are automatically generated
- Schedules are created for each month of the term duration
- Paid status is inferred from existing `paidAmount` for migrated data

#### Billers Service (`src/services/billersService.ts`)

**Changes:**
1. `getAllBillersFrontend()`: Now fetches payment schedules from `biller_payment_schedules` table and merges them with biller data
2. `getBillerByIdFrontend()`: Fetches payment schedules for a specific biller
3. Falls back to legacy JSONB schedules if new table is unavailable

#### Installments Service (`src/services/installmentsService.ts`)

**Changes:**
1. `createInstallmentFrontend()`: Automatically generates payment schedules when an installment is created
2. `updateInstallmentFrontend()`: Generates schedules if they don't exist yet and `start_date` is set
3. Added helper function `generatePaymentSchedulesForInstallment()` to create schedule records

### Key Benefits

1. **Explicit Paid Status**: Each payment has a clear boolean `paid` field - no more ambiguous transaction matching
2. **Relational Integrity**: Foreign keys ensure payment schedules are always linked to valid parent records
3. **Easy Queries**: Can easily query for unpaid payments, payments by month, or payments by biller/installment
4. **Sequential Tracking**: Installment payments are tracked sequentially with payment numbers
5. **Audit Trail**: `created_at` and `updated_at` timestamps provide an audit trail
6. **Backward Compatible**: System gracefully falls back to legacy JSONB schedules if new tables don't exist

### Migration Path

1. **Deploy database migrations** to create new tables
2. **Run data migration scripts** to populate new tables with existing data
3. **Deploy application code** with new services and UI changes
4. **Verify functionality** with both new and legacy data
5. **Monitor** for any issues during transition period
6. **Eventually deprecate** JSONB schedules column once new system is proven stable

### Testing Recommendations

#### Unit Tests
- Test adapter conversions between database and frontend types
- Test service CRUD operations
- Test payment schedule generation logic

#### Integration Tests
1. **Create new biller** → Verify schedules can be added
2. **Mark biller payment as paid** → Verify explicit `paid` status is set
3. **Create new installment** → Verify payment schedules are auto-generated
4. **Mark installment payment as paid** → Verify next unpaid payment is marked
5. **Query unpaid payments** → Verify filtering works correctly

#### Manual Testing
1. Create a biller and add payment schedules
2. Mark some payments as paid
3. Verify paid status shows correctly in UI (green checkmark)
4. Create an installment with start date
5. Verify payment schedules are auto-generated
6. Pay first installment payment
7. Verify only that specific payment is marked as paid
8. Verify next payment button still shows "Pay"

### Rollback Plan

If issues are discovered:
1. Application gracefully falls back to legacy JSONB schedules
2. New tables can be dropped without affecting existing functionality
3. JSONB schedules continue to work as before
4. No data loss since both systems are maintained in parallel during transition

### Future Enhancements

1. **Remove JSONB schedules**: Once new system is proven, deprecate `schedules` column in `billers` table
2. **Remove `paidAmount`**: Deprecate `paid_amount` column in `installments` table (calculate from payment schedules)
3. **Payment reminders**: Use `due_date` to send reminders for upcoming payments
4. **Payment history**: Show detailed payment history with receipts and dates
5. **Partial payments**: Support recording partial payments toward a schedule
6. **Payment analytics**: Generate reports on payment patterns and trends

## Conclusion

This refactoring provides a solid foundation for clear, unambiguous payment status tracking. The explicit `paid` boolean field eliminates confusion, while relational database structure ensures data integrity. The system is backward compatible and includes a safe migration path from the legacy JSONB-based approach.
