# Monthly Payment Schedules Migration Guide

## Overview

This migration introduces a new `monthly_payment_schedules` table in Supabase to manage payment schedules for billers and installments separately. This enhancement provides:

- **Unique ID tracking** for each payment schedule
- **Centralized payment management** in a dedicated table
- **Enhanced Pay flow logic** with better payment status tracking
- **Flexible payment tracking** per month/year for both billers and installments

## ⚠️ Security Notice

**IMPORTANT**: The default migration includes a permissive RLS policy suitable for development/testing only. Before deploying to production, you **MUST** implement proper authentication-based Row Level Security policies. See the migration file comments for examples of production-ready policies.

## Migration Steps

### 1. Run the SQL Migration

Execute the SQL migration file in your Supabase SQL Editor:

```sql
-- File: supabase/migrations/20260203_create_monthly_payment_schedules.sql
```

This will create:
- `monthly_payment_schedules` table with all necessary columns
- Indexes for optimal query performance
- Row Level Security policies
- Automatic timestamp update triggers

### 2. Verify Migration Success

After running the migration, verify the table was created:

```sql
SELECT * FROM monthly_payment_schedules LIMIT 1;
```

You should see the table structure with columns:
- `id` (UUID primary key)
- `source_type` ('biller' or 'installment')
- `source_id` (references biller or installment)
- `month`, `year` (schedule period)
- `payment_number` (for installments)
- `expected_amount`, `amount_paid`
- `receipt`, `date_paid`, `account_id`
- `status` (pending, paid, partial, overdue)
- `created_at`, `updated_at`

## Schema Details

### Table Structure

```sql
CREATE TABLE monthly_payment_schedules (
  id UUID PRIMARY KEY,
  source_type TEXT CHECK (source_type IN ('biller', 'installment')),
  source_id UUID,
  month TEXT,
  year INTEGER,
  payment_number INTEGER,
  expected_amount NUMERIC(10, 2),
  amount_paid NUMERIC(10, 2) DEFAULT 0,
  receipt TEXT,
  date_paid DATE,
  account_id UUID,
  status TEXT CHECK (status IN ('pending', 'paid', 'partial', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id, month, year)
);
```

### Key Features

1. **Unique Constraint**: Prevents duplicate schedules for the same source, month, and year
2. **Status Tracking**: Four states (pending, paid, partial, overdue)
3. **Source Type**: Links to either 'biller' or 'installment'
4. **Payment Number**: Tracks installment payment sequence (1, 2, 3, etc.)
5. **Auto-updated Timestamp**: `updated_at` automatically updates on changes

## Code Changes

### New Services

1. **Payment Schedules Service** (`src/services/paymentSchedulesService.ts`)
   - CRUD operations for payment schedules
   - Bulk creation support
   - Payment recording functionality

2. **Payment Schedules Generator** (`src/utils/paymentSchedulesGenerator.ts`)
   - Generates schedules for billers based on activation dates
   - Generates schedules for installments based on term duration
   - Handles schedule updates when source items change

### Updated Services

1. **Billers Service** (`src/services/billersService.ts`)
   - `createBillerFrontend`: Now creates payment schedules automatically
   - `deleteBillerFrontend`: Now deletes associated payment schedules

2. **Installments Service** (`src/services/installmentsService.ts`)
   - `createInstallmentFrontend`: Now creates payment schedules automatically
   - `deleteInstallmentFrontend`: Now deletes associated payment schedules

### New TypeScript Types

Added to `src/types/supabase.ts`:

```typescript
export interface SupabaseMonthlyPaymentSchedule {
  id: string;
  source_type: 'biller' | 'installment';
  source_id: string;
  month: string;
  year: number;
  payment_number: number | null;
  expected_amount: number;
  amount_paid: number;
  receipt: string | null;
  date_paid: string | null;
  account_id: string | null;
  status: 'pending' | 'paid' | 'partial' | 'overdue';
  created_at: string;
  updated_at: string;
}
```

## Usage Examples

### Creating a Biller with Schedules

```typescript
import { createBillerFrontend } from './src/services/billersService';

const newBiller: Biller = {
  id: 'uuid',
  name: 'Electricity Bill',
  category: 'Utilities',
  dueDate: '15',
  expectedAmount: 150,
  timing: '1/2',
  activationDate: { month: 'January', year: '2026' },
  status: 'active',
  schedules: [], // Will be auto-generated in payment_schedules table
};

const { data, error } = await createBillerFrontend(newBiller);
// This automatically creates 12 monthly payment schedules in the database
```

### Recording a Payment

```typescript
import { recordPayment } from './src/services/paymentSchedulesService';

const result = await recordPayment(scheduleId, {
  amountPaid: 150,
  datePaid: '2026-01-15',
  accountId: 'account-uuid',
  receipt: 'receipt-path.pdf',
});
// Status automatically updates to 'paid' if amount matches expected amount
```

### Querying Payment Schedules

```typescript
import { getPaymentSchedulesBySource } from './src/services/paymentSchedulesService';

// Get all schedules for a specific biller
const { data: billerSchedules } = await getPaymentSchedulesBySource('biller', billerId);

// Get all schedules for an installment
const { data: installmentSchedules } = await getPaymentSchedulesBySource('installment', installmentId);
```

## Backward Compatibility

The existing `schedules` field in the `billers` table (stored as JSONB) is maintained for backward compatibility. However, the new system uses the dedicated `monthly_payment_schedules` table for:

- Better query performance
- Easier payment tracking
- Unique ID per schedule for enhanced Pay flow logic
- Consistent data structure between billers and installments

## Next Steps for Frontend Integration

To fully integrate the new payment schedules system:

1. **Update Billers.tsx**: 
   - Fetch schedules from `monthly_payment_schedules` table instead of `biller.schedules`
   - Update Pay modal to use `recordPayment` from payment schedules service

2. **Update Installments.tsx**:
   - Fetch schedules from `monthly_payment_schedules` table
   - Display individual payment schedules instead of cumulative `paidAmount`
   - Update Pay modal to record individual schedule payments

3. **Add Payment Dashboard**:
   - Create a unified view of all payment schedules
   - Filter by status, period, or source type
   - Display upcoming and overdue payments

## Testing

After deployment, verify:

1. ✅ New billers create payment schedules automatically
2. ✅ New installments create payment schedules automatically
3. ✅ Deleting billers/installments removes their schedules
4. ✅ Recording payments updates schedule status correctly
5. ✅ Queries are performant with proper indexes

## Support

For questions or issues with this migration:
- Check table structure: `\d monthly_payment_schedules` in psql
- View indexes: `\di monthly_payment_schedules*`
- Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'monthly_payment_schedules';`

## Rollback

If you need to rollback this migration:

```sql
DROP TABLE IF EXISTS monthly_payment_schedules CASCADE;
DROP FUNCTION IF EXISTS update_monthly_payment_schedules_updated_at CASCADE;
```

⚠️ **Warning**: This will permanently delete all payment schedule data!
