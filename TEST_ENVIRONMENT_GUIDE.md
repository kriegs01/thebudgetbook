# Test Environment Feature - User Guide

## Overview
The Test Environment feature allows you to safely experiment with your budget application without affecting your production data. All test operations use separate database tables with a `_test` suffix.

## Setup Instructions

### 1. Deploy the Migration to Supabase

Before using the test environment, you need to create the test tables in your Supabase database:

1. Open your Supabase project dashboard
2. Go to the SQL Editor
3. Copy the contents of `supabase/migrations/20260207_create_test_environment_tables.sql`
4. Paste into the SQL Editor
5. Click "Run" to execute the migration
6. Verify that 7 new tables ending in `_test` were created

**Tables created:**
- `accounts_test`
- `billers_test`
- `installments_test`
- `savings_test`
- `transactions_test`
- `budget_setups_test`
- `monthly_payment_schedules_test`

### 2. Deploy Your Application

Build and deploy your application with the new changes:

```bash
npm run build
# Then deploy to your hosting platform (Vercel, Netlify, etc.)
```

## How to Use

### Enabling Test Mode

1. Navigate to **Settings** page
2. Scroll to the **Test Environment** section
3. Click the toggle switch to enable test mode
4. The page will reload automatically
5. You'll see an **orange banner** at the top indicating test mode is active

### Working in Test Mode

When test mode is enabled:
- All your operations (create, read, update, delete) use the `_test` tables
- Your production data remains completely untouched
- The orange banner is always visible as a reminder
- Your test mode preference is saved in localStorage

### Copying Production Data to Test

To work with realistic data in test mode:

1. Go to **Settings** → **Test Environment**
2. Click **"Copy Production to Test"** button
3. Confirm the operation
4. Wait for the success message

This will:
- Clear all existing test data
- Copy all production data to test tables
- Preserve all relationships between records

**Note:** This operation overwrites all test data, so make sure you want to do this!

### Clearing Test Data

To start fresh with empty test tables:

1. Go to **Settings** → **Test Environment**
2. Click **"Clear Test Data"** button
3. Confirm the operation
4. Wait for the success message

This will:
- Delete all records from all test tables
- Maintain table structure and relationships
- Leave production data untouched

### Exiting Test Mode

You can exit test mode in two ways:

**Option 1: Via Banner**
- Click the **"Exit Test Mode"** button in the orange banner at the top

**Option 2: Via Settings**
- Go to **Settings** → **Test Environment**
- Click the toggle switch to disable test mode

After exiting:
- The page will reload automatically
- The orange banner disappears
- You're back to working with production data

## Use Cases

### Testing New Features
1. Enable test mode
2. Copy production data to have realistic test data
3. Try out new features
4. Exit test mode when done
5. Production data remains unchanged

### Training or Demos
1. Enable test mode
2. Copy production data or create custom demo data
3. Demonstrate features without worry
4. Clear test data afterwards
5. Exit test mode

### Experimenting with Settings
1. Enable test mode
2. Try different budget configurations
3. Test various scenarios
4. Exit test mode to revert

### Data Migration Testing
1. Enable test mode
2. Copy production data
3. Test data transformation or migration scripts
4. Verify results
5. Clear test data if needed
6. Exit test mode

## Visual Indicators

### Test Mode Active
- **Orange banner** at the top of every page
- **Orange "TEST"** label in Settings
- Banner shows: "Test Environment Active - Changes will not affect production data"

### Production Mode Active
- No banner visible
- **Green "PRODUCTION"** label in Settings
- Normal operation

## Data Flow Diagram

```
┌─────────────────────────────────────────────────┐
│              User Interface                      │
│  (Shows banner if test mode is active)          │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│         Test Environment Context                 │
│  (Manages test mode state via localStorage)     │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│          getTableName() Function                 │
│  Checks test mode and returns correct table      │
└─────────────────────┬───────────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        ▼                            ▼
┌──────────────┐            ┌──────────────────┐
│  Production  │            │   Test Tables    │
│   Tables     │            │   (*_test)       │
│              │            │                  │
│ - accounts   │            │ - accounts_test  │
│ - billers    │            │ - billers_test   │
│ - etc.       │            │ - etc.           │
└──────────────┘            └──────────────────┘
```

## Safety Features

### 1. Confirmation Dialogs
- Both "Copy Production to Test" and "Clear Test Data" require confirmation
- Prevents accidental data loss

### 2. Visual Warnings
- Persistent orange banner when in test mode
- Color-coded environment indicators
- Clear labeling throughout the UI

### 3. Complete Data Isolation
- Test tables are completely separate from production
- Foreign keys only reference other test tables
- Zero risk of cross-contamination

### 4. Automatic Page Reload
- Ensures all components use correct tables after mode switch
- Prevents mixed-mode operations

### 5. localStorage Persistence
- Your test mode preference persists across page refreshes
- You won't accidentally switch modes

## Troubleshooting

### Banner Not Showing
- Check if test mode is enabled in Settings
- Try refreshing the page
- Check browser console for errors

### Toggle Not Working
- Ensure the migration has been run
- Check Supabase connection
- Try clearing localStorage and toggling again

### Copy Operation Fails
- Verify you have data in production tables
- Check Supabase logs for errors
- Ensure test tables were created by the migration

### Clear Operation Fails
- Check Supabase logs for errors
- Verify test tables exist
- Try running the operation again

### Production Data Accidentally Modified
**This should never happen** if you:
- See the orange banner when working
- Verify the "TEST" label in Settings before making changes

If you somehow modified production data in test mode:
- This indicates a bug - please report it
- Check your recent commits/changes
- Restore from Supabase backups if needed

## Technical Details

### How It Works

1. **Test Mode State:** Stored in localStorage as `test_environment_enabled`
2. **Table Resolution:** The `getTableName()` function checks localStorage and appends `_test` if needed
3. **Service Layer:** All 72 database queries automatically route to correct tables
4. **UI Layer:** Context provides current mode to all components

### Performance Impact

- **Minimal:** Only a localStorage check per query
- **No network overhead:** Same number of database queries
- **Same speed:** Test and production tables have identical structure and indexes

### Browser Storage

The test mode preference is stored in your browser's localStorage:
- **Key:** `test_environment_enabled`
- **Values:** `'true'` or `'false'`
- **Scope:** Per browser, per domain
- **Persistence:** Until cleared or changed

## Best Practices

1. **Always check the banner** before making changes
2. **Copy production to test** for realistic testing
3. **Clear test data** regularly to avoid confusion
4. **Exit test mode** when done testing
5. **Use confirmation dialogs** as checkpoints
6. **Never share test URLs** as production URLs

## Frequently Asked Questions

### Q: Will my production data be deleted if I clear test data?
**A:** No! The clear operation only affects `_test` tables. Production tables remain untouched.

### Q: Can I switch between test and production mode quickly?
**A:** Yes, but the page reloads each time to ensure consistency.

### Q: What happens if I forget I'm in test mode?
**A:** The persistent orange banner reminds you. All your changes will be in test tables only.

### Q: Can multiple users use test mode simultaneously?
**A:** Yes, but they share the same test tables. Consider copying production data before testing.

### Q: Does test mode affect Supabase billing?
**A:** Minimal impact - you have 7 additional tables and duplicate data if copied.

### Q: Can I customize which tables are test tables?
**A:** Currently no, but you can modify the code to add/remove tables from the test environment.

## Support

If you encounter issues:
1. Check this guide's troubleshooting section
2. Verify the migration was run successfully
3. Check browser console for errors
4. Review Supabase logs
5. Create an issue in the repository

## Summary

The Test Environment feature provides:
- ✅ Safe experimentation space
- ✅ Complete data isolation
- ✅ Easy data seeding
- ✅ One-click switching
- ✅ Visual safety indicators
- ✅ Persistent preferences
- ✅ Zero production risk

Happy testing! 🧪
