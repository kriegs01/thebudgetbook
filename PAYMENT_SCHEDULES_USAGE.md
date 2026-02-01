# Payment Schedules System - Usage Guide

This document provides examples and usage patterns for the new Payment Schedules system.

## Overview

The Payment Schedules system provides:
- **1-to-1 mapping** between payments and scheduled periods
- **Duplicate prevention** - no more accidental double payments
- **Traceability** - every payment is linked to a specific schedule
- **Foundation** for future features like reminders and auto-pay

## Database Schema

### payment_schedules Table
```sql
CREATE TABLE payment_schedules (
  id UUID PRIMARY KEY,
  biller_id UUID REFERENCES billers(id),          -- For biller schedules
  installment_id UUID REFERENCES installments(id), -- For installment schedules
  schedule_month TEXT NOT NULL,                    -- Format: 'YYYY-MM'
  expected_amount NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### transactions Table (Updated)
```sql
ALTER TABLE transactions 
ADD COLUMN payment_schedule_id UUID REFERENCES payment_schedules(id);

-- Unique constraint prevents duplicate payments
CREATE UNIQUE INDEX idx_transactions_unique_payment_schedule 
ON transactions(payment_schedule_id) WHERE payment_schedule_id IS NOT NULL;
```

## Automatic Schedule Generation

### When Creating a Biller
Schedules are automatically generated for the next 24 months:

```typescript
// Example: Creating a new biller
const newBiller = {
  name: "Electric Bill",
  category: "Utilities",
  due_date: "15",
  expected_amount: 2500,
  timing: "1/2",
  activation_date: { month: "January", year: "2026" },
  status: "active",
  schedules: []
};

// When you call createBiller(), it automatically:
// 1. Creates the biller record
// 2. Generates 24 payment schedules (one per month)
const { data, error } = await createBiller(newBiller);

// Payment schedules created:
// - 2026-01, 2026-02, 2026-03, ... 2027-12
```

### When Creating an Installment
Schedules are generated based on start date and term duration:

```typescript
// Example: Creating a 12-month installment
const newInstallment = {
  name: "Laptop Payment",
  total_amount: 36000,
  monthly_amount: 3000,
  term_duration: 12,
  paid_amount: 0,
  account_id: "account-uuid",
  start_date: "2026-01-01",
  timing: "1/2"
};

// When you call createInstallment(), it automatically:
// 1. Creates the installment record
// 2. Generates 12 payment schedules (one per month)
const { data, error } = await createInstallment(newInstallment);

// Payment schedules created:
// - 2026-01, 2026-02, 2026-03, ... 2026-12
```

## Making Payments

### Biller Payment Flow

1. User clicks "Pay" on a specific month's schedule
2. System looks up the payment_schedule record for that biller/month
3. System checks if a transaction already exists for that schedule
4. If no duplicate exists, creates transaction with payment_schedule_id

```typescript
// This happens automatically in Billers.tsx
const handlePaySubmit = async (e: React.FormEvent) => {
  // 1. Look up payment schedule
  const { data: paymentSchedule } = await getPaymentScheduleByBillerAndMonth(
    biller.id,
    "2026-01" // schedule_month format
  );
  
  // 2. Check for duplicates
  const exists = await checkTransactionExistsForSchedule(paymentSchedule.id);
  if (exists) {
    alert("Duplicate payment prevented!");
    return;
  }
  
  // 3. Create transaction
  await createTransaction({
    name: "Electric Bill - January 2026",
    date: new Date().toISOString(),
    amount: 2500,
    payment_method_id: "account-uuid",
    payment_schedule_id: paymentSchedule.id // Links to schedule
  });
};
```

### Installment Payment Flow

Similar to billers, but calculates which schedule period based on paid amount:

```typescript
// This happens automatically in Installments.tsx
const handlePaySubmit = async (e: React.FormEvent) => {
  // Calculate which payment this is (1st, 2nd, 3rd, etc.)
  const paymentNumber = Math.floor(paidAmount / monthlyAmount);
  
  // Determine schedule month
  const scheduleMonth = calculateMonthOffset(startDate, paymentNumber);
  
  // Look up schedule and create transaction
  const { data: paymentSchedule } = await getPaymentScheduleByInstallmentAndMonth(
    installment.id,
    scheduleMonth
  );
  
  // Duplicate prevention same as billers
  // ...
};
```

## Querying Payment Schedules

### Get All Schedules for a Biller
```typescript
import { getPaymentSchedulesByBiller } from './services/paymentSchedulesService';

const { data: schedules } = await getPaymentSchedulesByBiller('biller-uuid');
// Returns array of schedules for all months
```

### Get Specific Schedule
```typescript
import { getPaymentScheduleByBillerAndMonth } from './services/paymentSchedulesService';

const { data: schedule } = await getPaymentScheduleByBillerAndMonth(
  'biller-uuid',
  '2026-03' // March 2026
);
```

### Check if Schedule is Paid
```typescript
import { getTransactionByPaymentSchedule } from './services/transactionsService';

const { data: transaction } = await getTransactionByPaymentSchedule(
  'schedule-uuid'
);

const isPaid = !!transaction;
```

## Duplicate Prevention

The system prevents duplicates through:

1. **Database constraint**: Unique index on `transactions(payment_schedule_id)`
2. **Pre-flight check**: `checkTransactionExistsForSchedule()` before creating
3. **User feedback**: Alert message if duplicate attempt detected

```typescript
// Example: Attempting a duplicate payment
const scheduleId = 'schedule-123';

// First payment - succeeds
await createTransaction({
  name: "Bill Payment 1",
  payment_schedule_id: scheduleId,
  // ... other fields
});

// Second payment - fails with error
await createTransaction({
  name: "Bill Payment 2",
  payment_schedule_id: scheduleId, // Same schedule!
  // ... other fields
});
// Error: "A transaction already exists for this payment schedule"
```

## Migration from Legacy Data

For existing billers/installments without payment schedules:

1. Run the migrations to create the tables
2. Use the service functions to generate schedules:

```typescript
import { generateBillerSchedules, generateInstallmentSchedules } from './services/paymentSchedulesService';

// For each existing biller
for (const biller of existingBillers) {
  await generateBillerSchedules(
    biller.id,
    biller.expected_amount,
    '2026-01', // Start month
    24 // Number of months
  );
}

// For each existing installment
for (const installment of existingInstallments) {
  if (installment.start_date) {
    await generateInstallmentSchedules(
      installment.id,
      installment.monthly_amount,
      installment.start_date,
      installment.term_duration
    );
  }
}
```

## Benefits

### 1. Duplicate Prevention
- Database enforces uniqueness
- User gets immediate feedback
- Historical data remains accurate

### 2. Traceability
- Every payment links to exact schedule period
- Easy to query "What was paid for March 2026?"
- Clear audit trail

### 3. Reporting
```typescript
// Example: Get all paid schedules for a month
const paidSchedules = await supabase
  .from('payment_schedules')
  .select(`
    *,
    transactions(*)
  `)
  .eq('schedule_month', '2026-03')
  .not('transactions', 'is', null);
```

### 4. Future Features Ready
- **Reminders**: Query unpaid schedules for current month
- **Auto-pay**: Use schedule IDs to automate payments
- **Status tracking**: Mark schedules as "pending", "paid", "overdue"

## Testing Checklist

- [x] Database migrations run successfully
- [ ] Creating biller generates schedules
- [ ] Creating installment generates schedules
- [ ] Making payment creates transaction with schedule_id
- [ ] Attempting duplicate payment shows error
- [ ] Transaction appears in transactions list
- [ ] Schedule shows as paid in UI

## Troubleshooting

### Schedule Not Found
If you get "Payment schedule not found":
- Check that the biller/installment was created after migrations
- Legacy data may need manual schedule generation
- Verify schedule_month format is 'YYYY-MM'

### Duplicate Error
If you get duplicate error unexpectedly:
- Check transactions table for existing payment
- Verify the schedule is actually unpaid
- May need to delete erroneous transaction

### Performance
- Indexes are created on biller_id, installment_id, and schedule_month
- Bulk operations use `createPaymentSchedules()` for efficiency
- Consider archiving old schedules (>2 years) if needed
