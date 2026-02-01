-- Complete Migration Runner
-- This script runs all migrations in the correct order
-- Run this in Supabase SQL Editor to set up the complete database schema
--
-- Last updated: February 1, 2026

\echo 'Starting complete database migration...'
\echo ''

-- ============================================================================
-- STEP 1: Create Base Tables
-- ============================================================================
\echo 'Step 1: Creating base tables (accounts, billers, installments, savings, transactions)...'
\i 20260100_create_base_tables.sql
\echo 'Base tables created successfully.'
\echo ''

-- ============================================================================
-- STEP 2: Create Budget Setups Table
-- ============================================================================
\echo 'Step 2: Creating budget_setups table...'
\i 20260130_create_budget_setups_table.sql
\echo 'Budget setups table created successfully.'
\echo ''

-- ============================================================================
-- STEP 3: Add Linked Account to Billers
-- ============================================================================
\echo 'Step 3: Adding linked_account_id to billers...'
\i 20260131_add_linked_account_to_billers.sql
\echo 'Linked account column added successfully.'
\echo ''

-- ============================================================================
-- STEP 4: Add Timing to Installments
-- ============================================================================
\echo 'Step 4: Adding timing column to installments...'
\i 20260131_add_installment_timing.sql
\echo 'Installment timing column added successfully.'
\echo ''

-- ============================================================================
-- STEP 5: Create Payment Schedules Table
-- ============================================================================
\echo 'Step 5: Creating payment_schedules table...'
\i 20260201_create_payment_schedules_table.sql
\echo 'Payment schedules table created successfully.'
\echo ''

-- ============================================================================
-- STEP 6: Add Payment Schedule to Transactions
-- ============================================================================
\echo 'Step 6: Adding payment_schedule_id to transactions...'
\i 20260201_add_payment_schedule_to_transactions.sql
\echo 'Transaction payment schedule column added successfully.'
\echo ''

-- ============================================================================
-- STEP 7: Backfill Biller Schedules (Optional - only if you have existing data)
-- ============================================================================
\echo 'Step 7: Backfilling biller schedules...'
\i 20260201_backfill_biller_schedules.sql
\echo 'Biller schedules backfilled successfully.'
\echo ''

-- ============================================================================
-- STEP 8: Backfill Installment Schedules (Optional - only if you have existing data)
-- ============================================================================
\echo 'Step 8: Backfilling installment schedules...'
\i 20260201_backfill_installment_schedules.sql
\echo 'Installment schedules backfilled successfully.'
\echo ''

-- ============================================================================
-- VERIFICATION
-- ============================================================================
\echo 'Migration complete! Running verification...'
\echo ''

-- Check all tables exist
SELECT 
  CASE 
    WHEN COUNT(*) = 8 THEN '✓ All tables created successfully'
    ELSE '✗ Missing tables: ' || (8 - COUNT(*))::TEXT
  END as table_check
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
  );

-- Show table counts
SELECT 
  'accounts' as table_name, COUNT(*) as row_count FROM accounts
UNION ALL
SELECT 'billers', COUNT(*) FROM billers
UNION ALL
SELECT 'installments', COUNT(*) FROM installments
UNION ALL
SELECT 'savings', COUNT(*) FROM savings
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'budget_setups', COUNT(*) FROM budget_setups
UNION ALL
SELECT 'payment_schedules', COUNT(*) FROM payment_schedules
ORDER BY table_name;

\echo ''
\echo '============================================================================'
\echo 'Migration completed successfully!'
\echo 'Your database is now ready to use.'
\echo '============================================================================'
