# Troubleshooting: 404 Error When Saving Budget Setups

## Problem
When you click "Save" after creating a budget setup, you see:
- ❌ Error alert popup
- ❌ No budget setup is saved
- ❌ Console shows: `Failed to load resource: the server responded with a status of 404`
- ❌ Console shows: `Error creating budget setup: Object`

## Root Cause
The `budget_setups` table doesn't exist in your Supabase database. This table is created by running the SQL migration script.

## Quick Fix (5 minutes)

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Click on "SQL Editor" in the left sidebar (or go to Database → SQL Editor)

### Step 2: Run the Migration Script
1. Open the file `supabase_migration.sql` in your code editor
2. Copy ALL the contents (Ctrl+A, Ctrl+C)
3. Paste into the Supabase SQL Editor
4. Click "Run" button (or press Ctrl+Enter)

### Step 3: Verify Table Creation
After running the script, verify the table exists:
1. Go to "Table Editor" in Supabase
2. Look for `budget_setups` in the list of tables
3. It should show columns: id, month, timing, status, total_amount, data, created_at, updated_at

### Step 4: Refresh Your App
1. Go back to your Budget Book application
2. Refresh the page (F5 or Ctrl+R)
3. Try creating and saving a budget setup again
4. ✅ It should now work!

## What the Migration Creates

The SQL script creates:
- ✅ `budget_setups` table - stores your budget setup pages
- ✅ `trash` table - stores deleted items for recovery
- ✅ `categories` table - stores budget categories
- ✅ Indexes for better performance
- ✅ RLS policies for access control

## Verification

After running the migration, check the console when you load the app:
- ✅ No errors about missing tables
- ✅ Budget setups load successfully
- ✅ Saving budget setups works

If you still see errors:
1. Check that all tables were created (see Table Editor)
2. Verify your `.env.local` has correct Supabase credentials
3. Check browser console for specific error messages

## Alternative: Manual Table Creation

If you only want to create the `budget_setups` table without other tables, run this SQL:

```sql
-- Create budget setups table
CREATE TABLE IF NOT EXISTS budget_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  timing TEXT NOT NULL,
  status TEXT NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_budget_setups_month_timing ON budget_setups(month, timing);
CREATE INDEX IF NOT EXISTS idx_budget_setups_status ON budget_setups(status);

-- Enable RLS
ALTER TABLE budget_setups ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Enable all for budget_setups" ON budget_setups FOR ALL USING (true) WITH CHECK (true);
```

## Prevention

To avoid this issue in the future:
1. ✅ Always run SQL migrations before using new features
2. ✅ Check SUPABASE_SETUP.md for setup instructions
3. ✅ Use SETUP_CHECKLIST.md to verify all tables exist
4. ✅ Watch console for helpful error messages

## Still Having Issues?

If you continue to see errors:

1. **Check Supabase Connection:**
   - Verify `VITE_SUPABASE_URL` in `.env.local`
   - Verify `VITE_SUPABASE_ANON_KEY` in `.env.local`
   - Test connection on `/supabase-demo` page

2. **Check Table Exists:**
   ```sql
   -- Run this in SQL Editor to check
   SELECT * FROM budget_setups LIMIT 1;
   ```
   If you get "relation does not exist", the table wasn't created.

3. **Check RLS Policies:**
   ```sql
   -- Run this to see policies
   SELECT * FROM pg_policies WHERE tablename = 'budget_setups';
   ```
   Should show at least one policy.

4. **Check Browser Console:**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for detailed error messages
   - Error code `42P01` means table doesn't exist

## Success Indicators

You'll know it's working when:
- ✅ No error alerts when saving
- ✅ Budget setups appear in the summary view
- ✅ Budget setups persist after page refresh
- ✅ Console shows no errors

## Need More Help?

See these resources:
- `SUPABASE_SETUP.md` - Complete Supabase setup guide
- `SETUP_CHECKLIST.md` - Step-by-step setup checklist
- `BUDGET_SETUPS_FIX.md` - Technical details of the fix
- Supabase Documentation: https://supabase.com/docs
