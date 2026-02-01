# 🚀 Quick Migration Guide - How to Run SQL Migrations

This guide shows you exactly how to run the SQL migrations to set up your database.

## ⚠️ The Issue

If you tried to run the payment schedules migrations and got errors like:
- `relation "accounts" does not exist`
- `relation "billers" does not exist`
- `relation "transactions" does not exist`

**You're in the right place!** The base tables need to be created first.

---

## ✅ Solution: Run Migrations in Order

You have **two options** to set up your database:

### Option 1: Quick Setup (Recommended for New Databases)

**Copy and paste this COMPLETE SQL into Supabase SQL Editor:**

1. Go to your Supabase project
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy ALL the SQL from these files in order:
   - `20260100_create_base_tables.sql`
   - `20260130_create_budget_setups_table.sql`
   - `20260131_add_linked_account_to_billers.sql`
   - `20260131_add_installment_timing.sql`
   - `20260201_create_payment_schedules_table.sql`
   - `20260201_add_payment_schedule_to_transactions.sql`
5. Click "Run"
6. **ONLY if you have existing data**, also run:
   - `20260201_backfill_biller_schedules.sql`
   - `20260201_backfill_installment_schedules.sql`

### Option 2: Step-by-Step (Recommended if Something Failed)

Run each file individually in Supabase SQL Editor:

#### Step 1: Create Base Tables ⭐ **CRITICAL - RUN THIS FIRST**
```sql
-- File: 20260100_create_base_tables.sql
-- Creates: accounts, billers, installments, savings, transactions
```
Copy contents from `supabase/migrations/20260100_create_base_tables.sql` and run.

✅ **Verify:** Run this query:
```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('accounts', 'billers', 'installments', 'savings', 'transactions');
```
You should see 5 tables listed.

---

#### Step 2: Create Budget Setups Table
```sql
-- File: 20260130_create_budget_setups_table.sql
-- Creates: budget_setups table
```
Copy and run.

---

#### Step 3: Add Linked Account to Billers
```sql
-- File: 20260131_add_linked_account_to_billers.sql
-- Adds: linked_account_id column to billers
```
Copy and run.

---

#### Step 4: Add Timing to Installments
```sql
-- File: 20260131_add_installment_timing.sql
-- Adds: timing column to installments
```
Copy and run.

---

#### Step 5: Create Payment Schedules Table
```sql
-- File: 20260201_create_payment_schedules_table.sql
-- Creates: payment_schedules table
```
Copy and run.

✅ **Verify:** Run this query:
```sql
SELECT COUNT(*) FROM payment_schedules;
```
Should return 0 (or number of schedules if backfilled).

---

#### Step 6: Add Payment Schedule to Transactions
```sql
-- File: 20260201_add_payment_schedule_to_transactions.sql
-- Adds: payment_schedule_id column to transactions
```
Copy and run.

✅ **Verify:** Run this query:
```sql
\d transactions
```
Should show `payment_schedule_id` column.

---

#### Step 7 & 8: Backfill Scripts (Optional - Only if You Have Existing Data)

If you already have billers or installments with data:

**Step 7:** Backfill Biller Schedules
```sql
-- File: 20260201_backfill_biller_schedules.sql
```

**Step 8:** Backfill Installment Schedules
```sql
-- File: 20260201_backfill_installment_schedules.sql
```

If you're starting fresh, **skip these** - they'll just report 0 records processed.

---

## 🎯 Final Verification

After running all migrations, verify everything worked:

```sql
-- Check all tables exist
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'accounts', 
    'billers', 
    'installments', 
    'savings', 
    'transactions',
    'budget_setups',
    'payment_schedules'
  )
ORDER BY tablename;
```

You should see **7 tables** (or 8 if you have budget_setups).

---

## 🐛 Troubleshooting

### Error: "relation X does not exist"
**Solution:** You skipped Step 1! Run `20260100_create_base_tables.sql` first.

### Error: "duplicate key value violates unique constraint"
**Solution:** The migration already ran. This is fine - the script is idempotent.

### Error: "column X already exists"
**Solution:** That's okay! The migrations use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`.

### Backfill reports "0 records processed"
**Solution:** That's normal if you don't have existing data. The app will work fine.

---

## 📝 Migration Order Summary

```
1. 20260100_create_base_tables.sql          ← START HERE (creates accounts, billers, etc.)
2. 20260130_create_budget_setups_table.sql
3. 20260131_add_linked_account_to_billers.sql
4. 20260131_add_installment_timing.sql
5. 20260201_create_payment_schedules_table.sql
6. 20260201_add_payment_schedule_to_transactions.sql
7. 20260201_backfill_biller_schedules.sql   ← Optional (only if you have data)
8. 20260201_backfill_installment_schedules.sql ← Optional (only if you have data)
```

---

## ✨ What's Next?

After migrations complete:

1. ✅ Start your application: `npm run dev`
2. ✅ Create a test biller - schedules auto-generate!
3. ✅ Create a test installment - schedules auto-generate!
4. ✅ View the PAYMENT_SCHEDULES_IMPLEMENTATION.md for usage guide

---

## 💡 Why This Happened

The original setup guide (`SUPABASE_SETUP.md`) had the base table SQL, but it wasn't in a migration file. We've now fixed this by:

✅ Creating `20260100_create_base_tables.sql` with all base tables  
✅ All migrations use `IF NOT EXISTS` for safety  
✅ Clear migration order documented  

---

## 🙋 Still Having Issues?

1. Check you're running migrations in the correct order
2. Verify you have Supabase project access
3. Check Supabase logs for detailed error messages
4. Make sure you're in the correct database/schema

---

**Last Updated:** February 1, 2026  
**Status:** ✅ Fixed and Ready to Use
