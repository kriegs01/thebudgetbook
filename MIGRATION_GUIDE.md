# Migration Guide: localStorage to Supabase

This guide explains how to migrate your existing Budget Book data from localStorage to Supabase.

## Overview

Budget Book v2 now uses Supabase for full data persistence. If you have been using a previous version that stored data in localStorage, you can migrate your data using the built-in migration tools.

## What Gets Migrated

The migration tools handle the following data types:

1. **Transactions** - All transactions stored in localStorage will be migrated to the Supabase `transactions` table
2. **Default Categories** - Budget categories and subcategories will be initialized in the Supabase `categories` table

## Prerequisites

Before starting the migration:

1. ✅ Supabase project is set up and configured (see [SUPABASE_SETUP.md](SUPABASE_SETUP.md))
2. ✅ Environment variables are properly configured (`.env.local` file exists with valid credentials)
3. ✅ All required database tables are created (run the SQL from `supabase_migration.sql`)
4. ✅ The application is running and can connect to Supabase

## Migration Methods

### Method 1: Using the Settings UI (Recommended)

This is the easiest way to migrate your data:

1. **Navigate to Settings**
   - Open the Budget Book application
   - Click on "Settings" in the navigation menu

2. **Find the Data Migration Section**
   - Scroll to find "Data Migration" section
   - Click to expand if collapsed

3. **Run the Migration**
   - Click the "Run Migration" button
   - Wait for the process to complete
   - Review the migration status message

4. **Verify Success**
   - Check for success message showing count of migrated items
   - Navigate to Transactions page to see your migrated data
   - Navigate to Settings > Budget Categories to see categories

### Method 2: Using Browser Console (Advanced)

If you prefer to run migrations manually or need more control:

1. **Open Browser Console**
   - Press F12 or Right-click → Inspect
   - Navigate to the Console tab

2. **Import Migration Functions**
   ```javascript
   // The functions are already available if you're on the app
   // Just call them directly:
   ```

3. **Migrate Transactions**
   ```javascript
   const { migrateTransactionsFromLocalStorage } = await import('./src/utils/migrationUtils');
   const txResult = await migrateTransactionsFromLocalStorage();
   console.log(txResult);
   ```

4. **Migrate Categories**
   ```javascript
   const { migrateDefaultCategories } = await import('./src/utils/migrationUtils');
   const catResult = await migrateDefaultCategories();
   console.log(catResult);
   ```

5. **Run All Migrations**
   ```javascript
   const { runAllMigrations } = await import('./src/utils/migrationUtils');
   const results = await runAllMigrations();
   console.log(results);
   ```

## Migration Behavior

### Safety Features

- **One-Time Execution**: Each migration runs only once per browser. A flag is stored in localStorage to prevent duplicate migrations.
- **Non-Destructive**: Your localStorage data is NOT deleted during migration. It remains intact.
- **Duplicate Prevention**: Categories that already exist in Supabase will be skipped.

### What Happens During Migration

1. **Transactions Migration**:
   - Reads all transactions from localStorage key `'transactions'`
   - Converts each transaction to Supabase format
   - Inserts into `transactions` table
   - Sets flag `'transactions_migrated' = 'true'` in localStorage
   - Returns count of successful migrations

2. **Categories Migration**:
   - Takes default categories from `INITIAL_CATEGORIES` constant
   - Checks if each category already exists in Supabase
   - Creates only new categories (skips existing ones)
   - Sets flag `'categories_migrated' = 'true'` in localStorage
   - Returns count of successful migrations

## Troubleshooting

### Migration Already Run

**Problem**: You see "Already migrated" message but want to re-run migration.

**Solution**: Reset migration flags in browser console:
```javascript
localStorage.removeItem('transactions_migrated');
localStorage.removeItem('categories_migrated');
```

Then run the migration again.

### Migration Fails with Error

**Problem**: Migration fails with database error or timeout.

**Possible Causes & Solutions**:

1. **Database not connected**
   - Check your `.env.local` file has correct Supabase credentials
   - Verify you can see data in Supabase Dashboard

2. **Tables don't exist**
   - Run the SQL from `supabase_migration.sql` in Supabase SQL Editor
   - Verify tables exist in Supabase Dashboard

3. **RLS policies blocking insert**
   - Check that RLS policies exist and allow inserts
   - See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for policy examples

4. **Invalid data format**
   - Check browser console for specific error messages
   - Verify your localStorage data is valid JSON

### Some Transactions Failed to Migrate

**Problem**: Migration completes but some transactions show errors.

**Solution**:
1. Check the errors array in the migration result
2. Common issues:
   - Missing `payment_method_id`: The transaction references an account that doesn't exist
   - Invalid amount: The amount field is not a valid number
   - Missing required fields: Name or date is missing

3. Fix invalid data in localStorage and re-run migration

### No Data in localStorage

**Problem**: Migration reports "No transactions to migrate".

**Explanation**: This is normal if:
- You're a new user with no previous data
- You already cleared localStorage
- Data was stored under different keys

**Action**: No action needed. Start using Supabase directly for new data.

## Post-Migration

### Verify Migration Success

1. **Check Transactions Page**
   - Navigate to Transactions page
   - Verify all your transactions are visible
   - Check that dates and amounts are correct

2. **Check Supabase Dashboard**
   - Open your Supabase project dashboard
   - Navigate to Table Editor
   - Check `transactions` table has your data
   - Check `categories` table has default categories

3. **Test CRUD Operations**
   - Try adding a new transaction
   - Try editing a transaction
   - Try deleting a transaction (it should move to trash)
   - Verify changes reflect in Supabase Dashboard

### Clean Up (Optional)

After successful migration, you may want to clean up:

1. **Keep localStorage for now**: It's safe to leave your old data in localStorage as backup
2. **Manual cleanup**: If you want to clear it, use browser settings:
   - Chrome: DevTools → Application → Local Storage → Delete
   - Firefox: DevTools → Storage → Local Storage → Delete
   - Edge: DevTools → Application → Local Storage → Delete

⚠️ **Warning**: Only clear localStorage after confirming all data is successfully migrated to Supabase!

## Data Not Migrated

The following data types are NOT automatically migrated:

- **Accounts** - Already using Supabase (no migration needed)
- **Billers** - Already using Supabase (no migration needed)
- **Installments** - Already using Supabase (no migration needed)
- **Savings** - Already using Supabase (no migration needed)
- **Budget Setups** - Currently stored in component state (not persisted)
- **Trash Items** - Only newly deleted items will go to trash table

## Getting Help

If you encounter issues during migration:

1. Check the browser console for detailed error messages
2. Review this guide's Troubleshooting section
3. Check [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for database setup issues
4. Verify your Supabase connection using the SupabaseDemo page
5. Check Supabase Dashboard logs for server-side errors

## Manual Data Export/Import (Advanced)

If you need to manually export or import data:

### Export from localStorage

```javascript
// Export transactions
const transactions = localStorage.getItem('transactions');
console.log(JSON.parse(transactions));

// Or export all localStorage
console.log(JSON.stringify(localStorage));
```

### Import to Supabase Manually

```javascript
import { createTransaction } from './src/services/transactionsService';

const transactions = [/* your transaction data */];

for (const tx of transactions) {
  await createTransaction({
    name: tx.name,
    date: tx.date,
    amount: tx.amount,
    payment_method_id: tx.paymentMethodId
  });
}
```

## Best Practices

1. **Backup First**: Before migration, export your localStorage data as a backup
2. **Verify Connection**: Test Supabase connection before migrating large datasets
3. **Migrate in Steps**: Use console method to migrate one type at a time
4. **Check Logs**: Monitor browser console and Supabase logs during migration
5. **Test After**: Perform CRUD operations to ensure everything works
6. **Don't Clear localStorage**: Keep it as backup until fully confident in Supabase

## Migration Checklist

- [ ] Supabase project configured
- [ ] Environment variables set
- [ ] Database tables created
- [ ] App can connect to Supabase
- [ ] Backup localStorage data (optional)
- [ ] Run migration via Settings or Console
- [ ] Verify transactions in app
- [ ] Verify categories in app
- [ ] Check Supabase Dashboard
- [ ] Test CRUD operations
- [ ] Clean up localStorage (optional)

## Next Steps

After successful migration:

1. All new data will automatically be stored in Supabase
2. Use Trash page to recover deleted items
3. Use Settings to manage categories
4. Enjoy real-time sync across devices (future feature)
5. Your data is backed up in the cloud

Congratulations! You're now using Supabase for full data persistence! 🎉
