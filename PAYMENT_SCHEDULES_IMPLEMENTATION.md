# Payment Schedules Implementation Guide

## Overview

This document provides a comprehensive guide to the payment schedules system implementation. The system ensures that every monthly payment for Billers and Installments has a unique ID in a dedicated `payment_schedules` table, preventing duplicate and misapplied payments.

## Table of Contents

1. [Architecture](#architecture)
2. [Database Schema](#database-schema)
3. [Migration Steps](#migration-steps)
4. [Usage Guide](#usage-guide)
5. [API Reference](#api-reference)
6. [UI Integration](#ui-integration)
7. [Troubleshooting](#troubleshooting)
8. [Future Maintenance](#future-maintenance)

---

## Architecture

### Problem Statement

Previously, payment schedules were stored as JSON arrays in the `billers.schedules` field, and installment payments were tracked cumulatively in the `installments.paid_amount` field. This approach had several issues:

- **No unique identifiers** for individual payment schedules
- **Risk of duplicate payments** - no constraint preventing multiple payments for the same month
- **Difficult to query** - JSON arrays are hard to filter and join
- **No referential integrity** - transactions couldn't reliably reference specific schedules
- **Misapplied payments** - payments could be applied to wrong months or items

### Solution

The new system introduces:

1. **`payment_schedules` table** - Each monthly payment gets a unique UUID
2. **Foreign key constraints** - Links to `billers`, `installments`, and `accounts`
3. **Unique constraints** - Prevents duplicate schedules for same biller/installment + month/year
4. **Transaction linking** - `transactions.payment_schedule_id` with unique index prevents double payments
5. **Auditable history** - All payment schedules tracked with timestamps

---

## Database Schema

### payment_schedules Table

```sql
CREATE TABLE payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Parent reference (exactly one must be set)
  biller_id UUID REFERENCES billers(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES installments(id) ON DELETE CASCADE,
  
  -- Schedule identification
  schedule_month TEXT NOT NULL,
  schedule_year TEXT NOT NULL,
  
  -- Payment details
  expected_amount NUMERIC(10, 2) NOT NULL,
  amount_paid NUMERIC(10, 2),
  date_paid DATE,
  receipt TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  timing TEXT CHECK (timing IN ('1/2', '2/2')),
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT check_one_parent CHECK (
    (biller_id IS NOT NULL AND installment_id IS NULL) OR
    (biller_id IS NULL AND installment_id IS NOT NULL)
  ),
  CONSTRAINT unique_biller_schedule UNIQUE (biller_id, schedule_month, schedule_year),
  CONSTRAINT unique_installment_schedule UNIQUE (installment_id, schedule_month, schedule_year)
);
```

### transactions Table Update

```sql
ALTER TABLE transactions 
ADD COLUMN payment_schedule_id UUID REFERENCES payment_schedules(id);

-- Unique index prevents duplicate payments
CREATE UNIQUE INDEX idx_transactions_unique_payment_schedule 
ON transactions(payment_schedule_id) 
WHERE payment_schedule_id IS NOT NULL;
```

---

## Migration Steps

### Step 1: Run Database Migrations

⚠️ **IMPORTANT UPDATE:** Base tables must be created first!

**See [HOW_TO_RUN_MIGRATIONS.md](HOW_TO_RUN_MIGRATIONS.md) for detailed step-by-step instructions.**

Run migrations in this specific order:

**0. Create base tables (NEW - CRITICAL!)** ⭐
   ```bash
   # In Supabase SQL Editor, run FIRST:
   supabase/migrations/20260100_create_base_tables.sql
   ```
   This creates: accounts, billers, installments, savings, transactions

1. **Create budget_setups table**
   ```bash
   supabase/migrations/20260130_create_budget_setups_table.sql
   ```

2. **Add linked_account_id to billers**
   ```bash
   supabase/migrations/20260131_add_linked_account_to_billers.sql
   ```

3. **Add timing to installments**
   ```bash
   supabase/migrations/20260131_add_installment_timing.sql
   ```

4. **Create payment_schedules table**
   ```bash
   supabase/migrations/20260201_create_payment_schedules_table.sql
   ```

5. **Add payment_schedule_id to transactions**
   ```bash
   supabase/migrations/20260201_add_payment_schedule_to_transactions.sql
   ```

### Step 2: Backfill Existing Data

Choose one of two methods:

#### Method A: SQL Scripts (Recommended)

Run these scripts in Supabase SQL Editor:

```bash
# 1. Backfill Biller schedules
supabase/migrations/20260201_backfill_biller_schedules.sql

# 2. Backfill Installment schedules
supabase/migrations/20260201_backfill_installment_schedules.sql
```

#### Method B: Node.js/TypeScript Script

```bash
# Ensure .env.local has valid Supabase credentials
npm install tsx --save-dev
npx tsx scripts/backfill-payment-schedules.ts
```

### Step 3: Verify Backfill

Run these queries in Supabase SQL Editor:

```sql
-- Check biller schedules
SELECT COUNT(*) FROM payment_schedules WHERE biller_id IS NOT NULL;

-- Check installment schedules
SELECT COUNT(*) FROM payment_schedules WHERE installment_id IS NOT NULL;

-- Check for any orphaned schedules (should be 0)
SELECT COUNT(*) FROM payment_schedules 
WHERE biller_id IS NULL AND installment_id IS NULL;

-- Sample some schedules
SELECT * FROM payment_schedules LIMIT 10;
```

### Step 4: Update Application Code

See [Usage Guide](#usage-guide) section below.

---

## Usage Guide

### Creating Payment Schedules for New Billers

When creating a new biller, automatically generate payment schedules:

```typescript
import { createBillerFrontend } from '../services/billersService';
import { generateBillerSchedules } from '../services/paymentSchedulesService';

async function createBillerWithSchedules(billerData: Biller) {
  // 1. Create the biller
  const { data: biller, error: billerError } = await createBillerFrontend(billerData);
  
  if (billerError || !biller) {
    throw new Error('Failed to create biller');
  }
  
  // 2. Generate payment schedules (12 months ahead by default)
  const { data: schedules, error: schedulesError } = await generateBillerSchedules(
    biller.id,
    biller.activationDate,
    biller.expectedAmount,
    biller.timing,
    12 // Generate 12 months of schedules
  );
  
  if (schedulesError) {
    console.error('Failed to create schedules:', schedulesError);
    // Note: Biller is created, schedules can be regenerated later
  }
  
  return biller;
}
```

### Creating Payment Schedules for New Installments

```typescript
import { createInstallmentFrontend } from '../services/installmentsService';
import { generateInstallmentSchedules } from '../services/paymentSchedulesService';

async function createInstallmentWithSchedules(installmentData: Installment) {
  // 1. Create the installment
  const { data: installment, error: installmentError } = 
    await createInstallmentFrontend(installmentData);
  
  if (installmentError || !installment) {
    throw new Error('Failed to create installment');
  }
  
  // 2. Generate payment schedules for the entire term
  if (installment.startDate) {
    const termDuration = parseInt(installment.termDuration);
    const { data: schedules, error: schedulesError } = 
      await generateInstallmentSchedules(
        installment.id,
        installment.startDate,
        termDuration,
        installment.monthlyAmount,
        installment.timing
      );
    
    if (schedulesError) {
      console.error('Failed to create schedules:', schedulesError);
    }
  }
  
  return installment;
}
```

### Processing Payments

Update your payment processing logic to use payment schedules:

```typescript
import { markPaymentScheduleAsPaid } from '../services/paymentSchedulesService';
import { createTransaction } from '../services/transactionsService';

async function processPayment(
  scheduleId: string,
  amountPaid: number,
  datePaid: string,
  accountId: string,
  receipt?: string
) {
  try {
    // 1. Mark the schedule as paid
    const { data: schedule, error: scheduleError } = 
      await markPaymentScheduleAsPaid(
        scheduleId,
        amountPaid,
        datePaid,
        accountId,
        receipt
      );
    
    if (scheduleError) {
      throw new Error('Failed to mark schedule as paid');
    }
    
    // 2. Create a transaction linked to this schedule
    const { data: transaction, error: transactionError } = 
      await createTransaction({
        name: `Payment for schedule ${scheduleId}`,
        date: datePaid,
        amount: amountPaid,
        payment_method_id: accountId,
        payment_schedule_id: scheduleId, // This link prevents duplicate payments
      });
    
    if (transactionError) {
      throw new Error('Failed to create transaction');
    }
    
    return { schedule, transaction };
  } catch (error) {
    console.error('Payment processing failed:', error);
    throw error;
  }
}
```

### Querying Payment Status

Check payment status using the new system:

```typescript
import { 
  getPaymentSchedulesByBiller,
  getPaymentSchedulesByInstallment,
  getUnpaidPaymentSchedules 
} from '../services/paymentSchedulesService';

// Get all schedules for a biller
async function getBillerSchedules(billerId: string) {
  const { data: schedules, error } = await getPaymentSchedulesByBiller(billerId);
  
  if (error) {
    console.error('Failed to fetch schedules:', error);
    return [];
  }
  
  return schedules.map(schedule => ({
    ...schedule,
    isPaid: schedule.amount_paid !== null,
  }));
}

// Get unpaid schedules for current month
async function getUnpaidSchedulesForMonth(month: string, year: string) {
  const { data: schedules, error } = await getPaymentSchedulesByMonthYear(month, year);
  
  if (error) {
    console.error('Failed to fetch schedules:', error);
    return [];
  }
  
  return schedules.filter(s => s.amount_paid === null);
}
```

---

## API Reference

### paymentSchedulesService.ts

#### Query Functions

- `getAllPaymentSchedules()` - Get all payment schedules
- `getPaymentScheduleById(id: string)` - Get single schedule by ID
- `getPaymentSchedulesByBiller(billerId: string)` - Get all schedules for a biller
- `getPaymentSchedulesByInstallment(installmentId: string)` - Get all schedules for an installment
- `getPaymentSchedulesByMonthYear(month: string, year: string, timing?: string)` - Get schedules by month/year
- `getUnpaidPaymentSchedules()` - Get all unpaid schedules
- `getPaidPaymentSchedules()` - Get all paid schedules

#### Mutation Functions

- `createPaymentSchedule(schedule: CreatePaymentScheduleInput)` - Create single schedule
- `createPaymentSchedulesBatch(schedules: CreatePaymentScheduleInput[])` - Create multiple schedules
- `updatePaymentSchedule(id: string, updates: UpdatePaymentScheduleInput)` - Update schedule
- `markPaymentScheduleAsPaid(scheduleId, amountPaid, datePaid, accountId, receipt?)` - Mark as paid
- `deletePaymentSchedule(id: string)` - Delete schedule

#### Generator Functions

- `generateBillerSchedules(billerId, activationDate, expectedAmount, timing, monthsAhead)` - Auto-generate biller schedules
- `generateInstallmentSchedules(installmentId, startDate, termDuration, monthlyAmount, timing?)` - Auto-generate installment schedules

---

## UI Integration

### Updating Payment Forms

Update your payment forms in `pages/Billers.tsx` and `pages/Installments.tsx`:

#### Before (Old Approach)
```typescript
// Old: Updating JSON array in billers.schedules
const handlePaySubmit = async (e: React.FormEvent) => {
  const updatedSchedules = biller.schedules.map(s => {
    if (s.month === schedule.month && s.year === schedule.year) {
      return { ...s, amountPaid: parseFloat(payFormData.amount) };
    }
    return s;
  });
  await onUpdate({ ...biller, schedules: updatedSchedules });
};
```

#### After (New Approach)
```typescript
// New: Using payment_schedule_id
import { markPaymentScheduleAsPaid } from '../services/paymentSchedulesService';
import { createTransaction } from '../services/transactionsService';

const handlePaySubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!showPayModal || isSubmitting) return;
  
  setIsSubmitting(true);
  try {
    const { schedule } = showPayModal;
    
    // Mark schedule as paid
    const { error: scheduleError } = await markPaymentScheduleAsPaid(
      schedule.id, // Use the unique schedule ID
      parseFloat(payFormData.amount),
      payFormData.datePaid,
      payFormData.accountId,
      payFormData.receipt
    );
    
    if (scheduleError) throw scheduleError;
    
    // Create transaction (with unique payment_schedule_id to prevent duplicates)
    const { error: txError } = await createTransaction({
      name: `${biller.name} - ${schedule.schedule_month} ${schedule.schedule_year}`,
      date: payFormData.datePaid,
      amount: parseFloat(payFormData.amount),
      payment_method_id: payFormData.accountId,
      payment_schedule_id: schedule.id, // Critical: Links to schedule
    });
    
    if (txError) throw txError;
    
    setShowPayModal(null);
    // Refresh data
  } catch (error) {
    console.error('Failed to process payment:', error);
    alert('Failed to process payment. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};
```

### Displaying Payment Status

Update your schedule display to fetch from payment_schedules:

```typescript
import { getPaymentSchedulesByBiller } from '../services/paymentSchedulesService';

const [schedules, setSchedules] = useState<SupabasePaymentSchedule[]>([]);

useEffect(() => {
  async function loadSchedules() {
    const { data } = await getPaymentSchedulesByBiller(billerId);
    if (data) setSchedules(data);
  }
  loadSchedules();
}, [billerId]);

// Display schedules
{schedules.map(schedule => (
  <tr key={schedule.id}>
    <td>{schedule.schedule_month} {schedule.schedule_year}</td>
    <td>₱{schedule.expected_amount.toFixed(2)}</td>
    <td>
      {schedule.amount_paid ? (
        <CheckCircle2 className="text-green-600" />
      ) : (
        <button onClick={() => handlePay(schedule)}>Pay</button>
      )}
    </td>
  </tr>
))}
```

---

## Troubleshooting

### Issue: Duplicate Payment Error

**Symptom:** Error when trying to create a transaction with an existing payment_schedule_id

**Cause:** The unique index on `transactions.payment_schedule_id` prevents double payments

**Solution:** This is working as intended! Check if a payment already exists:
```sql
SELECT * FROM transactions WHERE payment_schedule_id = '<schedule-id>';
```

### Issue: Missing Schedules After Backfill

**Symptom:** Some billers/installments don't have schedules

**Cause:** 
- Billers: No schedules in the JSON array
- Installments: Missing `start_date` field

**Solution:**
```typescript
// For billers: Generate missing schedules manually
await generateBillerSchedules(billerId, activationDate, expectedAmount, timing, 12);

// For installments: Set start_date first, then generate
await updateInstallment(installmentId, { start_date: '2024-01' });
await generateInstallmentSchedules(installmentId, '2024-01', termDuration, monthlyAmount);
```

### Issue: Orphaned Schedules

**Symptom:** Schedules exist but parent biller/installment was deleted

**Cause:** CASCADE delete should handle this, but check your foreign key constraints

**Solution:**
```sql
-- Find orphaned schedules
SELECT * FROM payment_schedules ps
LEFT JOIN billers b ON ps.biller_id = b.id
LEFT JOIN installments i ON ps.installment_id = i.id
WHERE b.id IS NULL AND i.id IS NULL;

-- Clean up orphaned schedules
DELETE FROM payment_schedules
WHERE (biller_id IS NOT NULL AND biller_id NOT IN (SELECT id FROM billers))
   OR (installment_id IS NOT NULL AND installment_id NOT IN (SELECT id FROM installments));
```

---

## Future Maintenance

### When to Remove Backfill Scripts

The backfill scripts (`20260201_backfill_biller_schedules.sql` and `20260201_backfill_installment_schedules.sql`) are **one-off migrations**.

**Remove after:**
1. All production data has been successfully backfilled
2. At least 1-2 months of using the new system without issues
3. Verification that all existing billers/installments have proper schedules
4. Confirmation that no old data needs to be migrated

**Timeline:** Estimated 1-2 months after deployment (around April 2026)

**Files to remove:**
- `supabase/migrations/20260201_backfill_biller_schedules.sql`
- `supabase/migrations/20260201_backfill_installment_schedules.sql`
- `scripts/backfill-payment-schedules.ts`

### Ongoing Maintenance

**Monthly Tasks:**
- Review payment schedules for accuracy
- Generate new schedules for upcoming months (if needed)
- Archive old paid schedules (optional, for performance)

**Quarterly Tasks:**
- Review and clean up any duplicate or orphaned schedules
- Verify foreign key constraints are working correctly
- Check transaction → schedule linkage integrity

### Future Enhancements

Potential improvements to consider:

1. **Automatic Schedule Generation**
   - Background job to auto-generate schedules 3 months ahead
   - Webhook to create schedules when billers/installments are created

2. **Payment Reminders**
   - Query unpaid schedules approaching due date
   - Send notifications to users

3. **Reporting & Analytics**
   - Payment history reports
   - Spending trends by category
   - Cash flow projections

4. **Reconciliation Tools**
   - UI to review and match payments to schedules
   - Bulk payment processing
   - Import from bank statements

---

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Foreign Keys](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [React Best Practices](https://react.dev/learn)

---

## Support

If you encounter issues or have questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review migration logs in Supabase SQL Editor
3. Check browser console for errors
4. Review this documentation thoroughly

---

**Last Updated:** February 1, 2026  
**Version:** 1.0.0  
**Status:** ✅ Complete and ready for deployment
