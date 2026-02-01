# Database Migrations

This folder contains SQL migration files for setting up the Budget Book database.

## 🚨 IMPORTANT: Migration Order Matters!

**If you get errors like "relation does not exist", you're running migrations out of order!**

👉 **See [HOW_TO_RUN_MIGRATIONS.md](../HOW_TO_RUN_MIGRATIONS.md) for detailed instructions.**

## Quick Start

Run migrations in **this exact order**:

### 1. Base Tables (REQUIRED - Run First!)
```
20260100_create_base_tables.sql
```
Creates: `accounts`, `billers`, `installments`, `savings`, `transactions`

**⚠️ If this fails, nothing else will work!**

### 2. Additional Tables
```
20260130_create_budget_setups_table.sql
```
Creates: `budget_setups`

### 3. Schema Updates
```
20260131_add_linked_account_to_billers.sql
20260131_add_installment_timing.sql
```
Adds columns to existing tables

### 4. Payment Schedules System
```
20260201_create_payment_schedules_table.sql
20260201_add_payment_schedule_to_transactions.sql
```
Creates: `payment_schedules` table and links it to transactions

### 5. Data Migration (Optional)
```
20260201_backfill_biller_schedules.sql
20260201_backfill_installment_schedules.sql
```
**Only run these if you have existing data in billers/installments tables**

---

## How to Run

### Option 1: Supabase Dashboard (Recommended)
1. Go to your Supabase project
2. Click "SQL Editor" in sidebar
3. Create "New Query"
4. Copy contents from migration file
5. Click "Run"
6. Repeat for each file in order

### Option 2: Supabase CLI (Advanced)
```bash
# If you have Supabase CLI installed
supabase db reset
```

---

## Troubleshooting

**Error: "relation X does not exist"**
- You skipped step 1! Run `20260100_create_base_tables.sql` first.

**Error: "column already exists"**
- That's okay! Migration already ran. Continue to next file.

**Backfill reports "0 records"**
- Normal if you don't have existing data. Skip to next migration.

---

## Files Explained

| File | Purpose | Required? |
|------|---------|-----------|
| `20260100_create_base_tables.sql` | Creates core tables | ✅ YES - Run First! |
| `20260130_create_budget_setups_table.sql` | Budget tracking | ✅ YES |
| `20260131_add_linked_account_to_billers.sql` | Links billers to accounts | ✅ YES |
| `20260131_add_installment_timing.sql` | Payment timing | ✅ YES |
| `20260201_create_payment_schedules_table.sql` | Payment schedules | ✅ YES |
| `20260201_add_payment_schedule_to_transactions.sql` | Links schedules to transactions | ✅ YES |
| `20260201_backfill_biller_schedules.sql` | Migrate old data | ⚠️ Only if you have data |
| `20260201_backfill_installment_schedules.sql` | Migrate old data | ⚠️ Only if you have data |

---

**Need more help?** See [HOW_TO_RUN_MIGRATIONS.md](../HOW_TO_RUN_MIGRATIONS.md)
