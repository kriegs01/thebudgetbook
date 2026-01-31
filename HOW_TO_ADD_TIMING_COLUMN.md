# HOW TO FIX: 400 Error - Add Timing Column to Supabase

## Problem
You're getting a 400 error when changing installment timing because the `timing` column doesn't exist in your Supabase `installments` table yet.

## Solution: Run the Database Migration

### Option 1: Using Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy and Paste This SQL**
   ```sql
   -- Add timing column to installments table
   ALTER TABLE installments 
   ADD COLUMN IF NOT EXISTS timing TEXT CHECK (timing IN ('1/2', '2/2'));

   -- Add index for faster filtering by timing
   CREATE INDEX IF NOT EXISTS idx_installments_timing 
   ON installments(timing);

   -- Add comment to document the column
   COMMENT ON COLUMN installments.timing IS 'Payment timing within the month (1/2 for first half, 2/2 for second half)';
   ```

4. **Run the Query**
   - Click "Run" button (or press Ctrl+Enter / Cmd+Enter)
   - You should see a success message

5. **Verify the Column Was Added**
   Run this query to confirm:
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'installments' AND column_name = 'timing';
   ```
   
   Expected result:
   - column_name: timing
   - data_type: text
   - is_nullable: YES

### Option 2: Using Supabase CLI (Advanced)

If you have the Supabase CLI installed:

```bash
# Navigate to your project directory
cd /path/to/thebudgetbookv2

# Apply the migration
supabase db push

# Or run the specific migration file
supabase migration up
```

## After Running the Migration

1. **Test the Installments Page**
   - Go to Installments page
   - Create or edit an installment
   - Change the timing to "1/2" or "2/2"
   - Save
   - ✅ Should save successfully without 400 error

2. **Test Budget Setup**
   - Go to Budget Setup
   - Select timing filter (1/2 or 2/2)
   - ✅ Should show installments with matching timing

## Troubleshooting

### Error: "relation installments does not exist"
- Your installments table hasn't been created yet
- You need to set up your database schema first

### Error: "column timing already exists"
- The column has already been added
- The 400 error is from something else
- Check browser console for more details

### Still Getting 400 Error After Migration
1. **Clear browser cache** and reload
2. **Check the timing value** being sent:
   - Open browser DevTools (F12)
   - Go to Network tab
   - Make the change and look for the API request
   - Check the payload - it should show `timing: "1/2"` or `timing: "2/2"`
3. **Verify column in database**:
   ```sql
   SELECT * FROM installments LIMIT 1;
   ```
   The timing column should appear in the results

## What This Migration Does

1. **Adds the timing column**
   - Type: TEXT
   - Nullable: YES (for backward compatibility)
   - Constraint: Only allows '1/2' or '2/2'

2. **Adds an index**
   - Makes filtering by timing faster
   - Used when Budget Setup filters installments

3. **Adds documentation**
   - Column comment explains its purpose
   - Helps other developers understand the field

## Why This Is Needed

The frontend code was updated to:
- Send timing values when creating/updating installments
- Filter installments by timing in Budget Setup

But the database didn't have the column to store these values, causing the 400 error.

## Questions?

If you still have issues after running the migration:
1. Share the exact error message from browser console
2. Share the result of: `SELECT * FROM installments LIMIT 1;`
3. Share the result of the column verification query above
