# Quick Start: Installment Payments via Transactions

## What Changed?

Installment payments now create **transaction records** linked to **payment schedules**. When you delete a transaction, the payment schedule automatically reverts.

## Migration Required (30 seconds)

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" → "New Query"

### Step 2: Run This SQL
```sql
-- Add payment_schedule_id to transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS payment_schedule_id UUID 
REFERENCES monthly_payment_schedules(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_payment_schedule 
ON transactions(payment_schedule_id);
```

### Step 3: Click Run
That's it! The feature is now enabled.

## How It Works

### Before
```
Make Payment → Update installment.paidAmount
```
❌ No transaction record  
❌ Can't track individual payments  
❌ Can't undo payments  

### After
```
Make Payment → Create Transaction → Link to Payment Schedule → Update Installment
```
✅ Transaction record created  
✅ Linked to specific month's schedule  
✅ Deleting transaction reverts the payment  

## Using the Feature

### 1. Make a Payment

Same as before! Just click "Pay" on an installment:

1. Open Installments page
2. Click "Pay" button
3. Fill in:
   - Amount
   - Date
   - Account
   - Receipt (optional)
4. Click "Record Payment"

**What happens behind the scenes:**
- System finds the right payment schedule (current month or next unpaid)
- Records payment on that schedule
- Creates a transaction linked to the schedule
- Updates installment total
- Logs everything for debugging

### 2. View Transactions

Go to Transactions page to see all payment transactions.

Each transaction shows:
- Name (e.g., "Car Loan - January 2026")
- Date
- Amount
- Account used

### 3. Delete/Undo a Payment

Just delete the transaction:

1. Go to Transactions page
2. Find the payment transaction
3. Click delete

**What happens:**
- Transaction is deleted
- Payment schedule automatically reverts:
  - Amount paid reduced
  - Status updated (paid → partial/pending)
  - Payment details cleared if needed
- Installment total updated

## Smart Features

### Automatic Schedule Selection

The system picks the right payment schedule:

1. **First choice**: Schedule for payment date (e.g., January payment → January schedule)
2. **Fallback**: First unpaid schedule
3. **Skip**: Already paid schedules

### Status Management

Payment schedules automatically update their status:

- **pending**: No payment yet
- **partial**: Some payment made
- **paid**: Fully paid
- **overdue**: Past due (future feature)

### Transaction Linking

Every payment transaction has:
- `name`: Describes what was paid
- `date`: When payment was made
- `amount`: How much was paid
- `payment_method_id`: Which account was used
- `payment_schedule_id`: Links to specific schedule ✨ NEW

## Console Logs

Watch the browser console to see what's happening:

### Successful Payment
```
[App] Processing installment payment with transaction
[App] Found target payment schedule
[PaymentSchedules] Payment recorded
[Transactions] Created payment schedule transaction
[App] Transaction created successfully
[App] Installment payment processed successfully
```

### Successful Deletion
```
[Transactions] Reverting payment schedule for transaction deletion
[Transactions] Payment schedule reverted
[Transactions] Transaction deleted successfully
```

## Troubleshooting

### "Could not find payment schedules for this installment"

**Fix**: Make sure the installment has payment schedules.
- Payment schedules are auto-created when you create an installment with a start date
- Check that `monthly_payment_schedules` table has records for this installment

### "No unpaid payment schedule found"

**Fix**: All schedules are already paid!
- This is expected when all payments are complete
- You can't make additional payments beyond the installment total

### Transaction created but not linked

**Check**:
1. Did you run the migration?
2. Check console for errors
3. Verify `payment_schedule_id` column exists in transactions table

## Testing

### Quick Test Flow

1. **Create Installment**
   - Name: "Test Loan"
   - Amount: $1200
   - Monthly: $100
   - Term: 12 months
   - Start: Current month

2. **Make Payment**
   - Amount: $100
   - Submit

3. **Verify**
   - Check Transactions page - new transaction appears
   - Check browser console - logs show success
   - Check Installments page - paid amount increases

4. **Delete Payment**
   - Go to Transactions page
   - Delete the payment transaction

5. **Verify Reversion**
   - Check browser console - logs show reversion
   - Installment paid amount decreases
   - Payment schedule status reverts

## Database Queries

### Check if migration ran
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
AND column_name = 'payment_schedule_id';
```

### View payment transactions
```sql
SELECT 
  t.id,
  t.name,
  t.date,
  t.amount,
  t.payment_schedule_id,
  s.month,
  s.year,
  s.status
FROM transactions t
LEFT JOIN monthly_payment_schedules s ON t.payment_schedule_id = s.id
WHERE t.payment_schedule_id IS NOT NULL;
```

### Check payment schedule status
```sql
SELECT 
  id,
  month,
  year,
  expected_amount,
  amount_paid,
  status
FROM monthly_payment_schedules
WHERE source_type = 'installment'
ORDER BY year, month;
```

## Benefits

✅ **Complete History**: Every payment is tracked  
✅ **Reversible**: Can undo payments by deleting transaction  
✅ **Automatic**: System handles all the linking  
✅ **Smart**: Picks the right schedule automatically  
✅ **Backward Compatible**: Old code still works  
✅ **Auditable**: Comprehensive logs  

## Need Help?

See full documentation: `INSTALLMENT_PAYMENTS_VIA_TRANSACTIONS.md`

Common issues:
- Migration not run → Run the SQL above
- No schedules → Create installment with start date
- Errors → Check browser console logs

## Summary

This feature makes installment payments more robust and trackable:
- Every payment creates a transaction
- Transactions link to payment schedules
- Deleting transactions reverts payments
- Everything is automatic and logged

Just run the migration and start using it! 🚀
