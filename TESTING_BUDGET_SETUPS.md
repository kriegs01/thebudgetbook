# Testing Budget Setups Persistence

This document describes how to manually test the new budget setups persistence feature using Supabase.

## Prerequisites

1. Supabase project set up with the `budget_setups` table created
2. Environment variables configured in `.env.local`
3. Application running locally (`npm run dev`)

## Setup

1. Run the migration script in your Supabase SQL Editor:
   ```bash
   cat supabase/migrations/20260130_create_budget_setups_table.sql
   ```
   Copy the contents and run it in Supabase SQL Editor.

2. Verify the table was created:
   ```sql
   SELECT * FROM budget_setups;
   ```
   You should see an empty table with the correct columns.

## Test Cases

### Test Case 1: Create a New Budget Setup

1. Navigate to the Budget page in the application
2. Click "Budget Setup" to enter setup mode
3. Configure budget items:
   - Add or modify items in different categories
   - Set projected salary (e.g., 11000)
   - Optionally set actual salary
4. Click the "Save" button
5. Verify:
   - The setup appears in the "Saved Setups" table
   - Check Supabase: `SELECT * FROM budget_setups;`
   - Confirm a new record exists with the correct month, timing, and data

### Test Case 2: Load an Existing Budget Setup

1. From the Budget page summary view
2. Find a saved setup in the table
3. Click the arrow button (→) to load it
4. Verify:
   - The budget setup view opens
   - All previously saved items are displayed
   - Projected and actual salary values are restored
   - All checkboxes and amounts match the saved state

### Test Case 3: Update an Existing Budget Setup

1. Load an existing setup (see Test Case 2)
2. Make changes:
   - Toggle some item checkboxes
   - Change some amounts
   - Update salary values
3. Click "Save"
4. Verify:
   - Check Supabase: The record is updated (same ID, new data)
   - The month/timing combination remains unique
   - Reload the setup to confirm changes persisted

### Test Case 4: Delete a Budget Setup

1. From the Budget page summary view
2. Find a saved setup
3. Click the "Remove" button
4. Verify:
   - The setup disappears from the saved setups table
   - Check Supabase: `SELECT * FROM budget_setups WHERE id = 'your-id';`
   - Confirm the record is deleted
   - The setup moves to the trash (if trash functionality is enabled)

### Test Case 5: Persistence Across Browser Sessions

1. Create and save a budget setup
2. Close the browser completely
3. Reopen the browser and navigate to the application
4. Go to the Budget page
5. Verify:
   - The saved setup still appears in the table
   - The setup can be loaded with all data intact
   - This confirms data is persisted in Supabase, not just localStorage

### Test Case 6: Multiple Month/Timing Combinations

1. Create a setup for "January 1/2"
2. Switch to "January 2/2" and create another setup
3. Switch to "February 1/2" and create a third setup
4. Verify:
   - All three setups appear in the saved setups table
   - Each setup is independent
   - Loading one setup doesn't affect the others
   - Check Supabase: Three separate records should exist

### Test Case 7: Unique Constraint Validation

1. Create and save a setup for "March 1/2"
2. Try to manually insert a duplicate via Supabase SQL Editor:
   ```sql
   INSERT INTO budget_setups (month, timing, status, total_amount, data)
   VALUES ('March', '1/2', 'Test', 0, '{}');
   ```
3. Verify:
   - The insert should fail with a unique constraint violation
   - This ensures only one setup per month/timing combination

## Expected Behavior

### Success Indicators

- ✅ Budget setups save successfully without errors
- ✅ Saved setups appear in the Supabase database
- ✅ Setups can be loaded and all data is restored correctly
- ✅ Updates modify the existing record (same ID)
- ✅ Deletes remove the record from Supabase
- ✅ Data persists across browser sessions
- ✅ Multiple setups for different month/timing combinations work correctly

### Error Handling

- ❌ If Supabase is unreachable: Alert message "Failed to save budget setup"
- ❌ If duplicate month/timing: Backend prevents duplicate (unique constraint)
- ❌ Network errors: User-friendly error messages displayed

## Troubleshooting

### Issue: "Failed to save budget setup"

**Possible Causes:**
1. Supabase credentials not configured correctly
2. Network connectivity issues
3. RLS policies not configured

**Solution:**
1. Check `.env.local` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
2. Verify Supabase project is running
3. Check browser console for detailed error messages
4. Ensure RLS policy is created (see migration script)

### Issue: Setup not loading after save

**Possible Causes:**
1. Data format mismatch
2. Browser not refreshing state

**Solution:**
1. Check Supabase for the actual saved data
2. Reload the page to force a fresh fetch from Supabase
3. Check browser console for errors

### Issue: Duplicate setups for same month/timing

**Possible Causes:**
1. Migration script not run correctly
2. Unique constraint not applied

**Solution:**
1. Verify the unique constraint exists:
   ```sql
   SELECT conname, contype, conkey 
   FROM pg_constraint 
   WHERE conname = 'unique_month_timing';
   ```
2. Re-run the migration if necessary
3. Manually delete duplicates and re-run migration

## Verifying Data Structure

To inspect the data structure in Supabase:

```sql
-- View a specific setup with formatted JSON
SELECT 
  id,
  month,
  timing,
  status,
  total_amount,
  jsonb_pretty(data) as formatted_data,
  created_at
FROM budget_setups
WHERE month = 'January' AND timing = '1/2';
```

The `data` field should contain:
- Category keys (e.g., "Utilities", "Groceries")
- Arrays of `CategorizedSetupItem` objects
- `_projectedSalary` field (string)
- `_actualSalary` field (string, optional)

Example structure:
```json
{
  "Utilities": [
    {
      "id": "...",
      "name": "Electric Bill",
      "amount": "150",
      "included": true
    }
  ],
  "_projectedSalary": "11000",
  "_actualSalary": "11500"
}
```

## Summary

This testing guide covers the core functionality of the budget setups persistence feature. All operations should work seamlessly with data stored in Supabase instead of localStorage, providing better reliability and the ability to access budget data across devices.
