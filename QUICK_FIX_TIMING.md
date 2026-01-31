# QUICK FIX: 400 Error When Changing Timing

## The Problem
❌ Getting a 400 error when changing installment timing

## The Cause
The `timing` column doesn't exist in your Supabase database yet

## The Solution (2 Minutes)

### Step 1: Open Supabase
Go to https://supabase.com/dashboard and select your project

### Step 2: Open SQL Editor
Click "SQL Editor" → "New Query"

### Step 3: Copy & Paste This SQL
```sql
ALTER TABLE installments 
ADD COLUMN IF NOT EXISTS timing TEXT CHECK (timing IN ('1/2', '2/2'));

CREATE INDEX IF NOT EXISTS idx_installments_timing 
ON installments(timing);
```

### Step 4: Run It
Click the "Run" button (or press Ctrl+Enter)

### Step 5: Test
- Go to your Installments page
- Edit an installment
- Change the timing
- Save
- ✅ Should work now!

## Need More Help?
See `HOW_TO_ADD_TIMING_COLUMN.md` for detailed instructions with screenshots

## After You Run This
The app will now:
- ✅ Save timing values without errors
- ✅ Filter installments by timing in Budget Setup
- ✅ Show helpful error messages if issues occur

---

**Note:** This only needs to be done once. After adding the column, all timing features will work correctly.
