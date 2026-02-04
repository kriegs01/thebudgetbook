# QUICK FIX: 400 Error - Missing start_date Column

## The Problem
❌ Getting a 400 error when creating or updating installments:
```
PGRST204: Could not find the 'start_date' column of 'installments' in the schema cache
```

## The Cause
The `start_date` column doesn't exist in your Supabase database yet.

## The Solution (2 Minutes)

### Step 1: Open Supabase
Go to https://supabase.com/dashboard and select your project

### Step 2: Open SQL Editor
Click "SQL Editor" → "New Query"

### Step 3: Copy & Paste This SQL
```sql
-- Add start_date column to installments table
ALTER TABLE installments 
ADD COLUMN IF NOT EXISTS start_date DATE;

-- Add index for faster filtering by start date
CREATE INDEX IF NOT EXISTS idx_installments_start_date 
ON installments(start_date);

-- Add comment to document the column
COMMENT ON COLUMN installments.start_date IS 'Start date of the installment plan (YYYY-MM-DD format)';
```

### Step 4: Run It
Click the "Run" button (or press Ctrl+Enter)

### Step 5: Test
- Go to your Installments page
- Create a new installment
- Fill in the start date
- Save
- ✅ Should work now!

## What If I Don't Want to Run the Migration?

The app will now work WITHOUT the migration! If the column doesn't exist:
- Installments will be created successfully (without start date)
- A warning will appear in the console
- The start date field won't be saved but everything else works

However, we **recommend running the migration** to enable full functionality:
- Start dates for installment plans
- Filtering installments by start date in Budget Setup
- Better budget planning

## After You Run This

The app will now:
- ✅ Save start dates without errors
- ✅ Use start dates for budget planning
- ✅ Show installments only after their start date
- ✅ Maintain backward compatibility with old installments

## Verify the Migration

Run this query to confirm the column was added:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'installments' AND column_name = 'start_date';
```

Expected result:
- column_name: start_date
- data_type: date
- is_nullable: YES

---

**Note:** This migration only needs to be run once. After adding the column, all start date features will work correctly.

## Related Files
- Migration file: `supabase/migrations/20260131_add_start_date_to_installments.sql`
- Legacy file: `ADD_START_DATE_COLUMN.sql` (same content)
- Full troubleshooting: `TROUBLESHOOTING_INSTALLMENTS.md`
