# Troubleshooting Installments 400 Error

## Problem
Getting 400 error when creating installments: "Error creating installment: Object"

## Diagnostic Steps

### 1. Check Browser Console
After the latest update, you should see detailed error logs:
- `Creating installment with data: {...}` - Shows what's being sent
- `Supabase error creating installment: {...}` - Shows the actual error from Supabase

### 2. Verify Database Schema

The installments table needs to have a `start_date` column. Check if it exists in your Supabase database:

1. Go to Supabase Dashboard
2. Navigate to SQL Editor
3. Run this query:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'installments'
ORDER BY ordinal_position;
```

### 3. Expected Schema

Your installments table should have these columns:
- `id` (uuid, primary key)
- `name` (text, not null)
- `total_amount` (numeric, not null)
- `monthly_amount` (numeric, not null)
- `term_duration` (integer, not null)
- `paid_amount` (numeric, not null, default 0)
- `account_id` (uuid, references accounts)
- **`start_date` (date, nullable)** ← This might be missing!

### 4. Fix Missing start_date Column

If the `start_date` column is missing, run the SQL script in `ADD_START_DATE_COLUMN.sql`:

```sql
ALTER TABLE installments 
ADD COLUMN IF NOT EXISTS start_date DATE;
```

## Common Issues and Solutions

### Issue 1: Column "start_date" does not exist
**Solution**: Run the ADD_START_DATE_COLUMN.sql script in your Supabase SQL Editor

### Issue 2: Date format error
**Solution**: Already fixed - the adapter now converts YYYY-MM to YYYY-MM-01

### Issue 3: Account ID validation error
**Solution**: Make sure the selected account exists in the accounts table and has a valid UUID

### Issue 4: Required fields missing
**Solution**: Ensure all required fields (name, total_amount, monthly_amount, term_duration, account_id) are filled

## Testing After Fix

1. Open browser DevTools (F12)
2. Go to Console tab
3. Try creating an installment
4. Check the console logs for:
   - "Creating installment with data:" to see what's being sent
   - If successful, you'll see the installment created
   - If failed, you'll see the specific Supabase error

## Still Having Issues?

Share the console output from:
1. "Creating installment with data:"
2. "Supabase error creating installment:"

This will help identify the exact problem.
