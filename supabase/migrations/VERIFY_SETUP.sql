-- Database Verification Script
-- Run this after migrations to verify everything is set up correctly
-- 
-- How to use:
-- 1. Copy this entire script
-- 2. Paste into Supabase SQL Editor
-- 3. Click "Run"
-- 4. Review the output
--
-- Expected results:
-- - All tables should exist
-- - All columns should be present
-- - All foreign keys should be set up
-- - RLS should be enabled

\echo '================================================================================'
\echo '                     DATABASE VERIFICATION SCRIPT'
\echo '================================================================================'
\echo ''

-- ============================================================================
-- CHECK 1: Base Tables Exist
-- ============================================================================
\echo 'CHECK 1: Verifying base tables exist...'
\echo ''

SELECT 
  CASE 
    WHEN COUNT(*) = 5 THEN '✓ PASS: All 5 base tables exist'
    ELSE '✗ FAIL: Missing ' || (5 - COUNT(*))::TEXT || ' base table(s). Run 20260100_create_base_tables.sql'
  END as base_tables_check
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('accounts', 'billers', 'installments', 'savings', 'transactions');

\echo ''

-- ============================================================================
-- CHECK 2: Additional Tables Exist
-- ============================================================================
\echo 'CHECK 2: Verifying additional tables exist...'
\echo ''

SELECT 
  tablename,
  CASE 
    WHEN tablename = 'budget_setups' THEN '✓ Present'
    WHEN tablename = 'payment_schedules' THEN '✓ Present'
    ELSE '? Unknown'
  END as status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('budget_setups', 'payment_schedules')
ORDER BY tablename;

\echo ''

-- ============================================================================
-- CHECK 3: Critical Columns Exist
-- ============================================================================
\echo 'CHECK 3: Verifying critical columns exist...'
\echo ''

-- Check for linked_account_id in billers
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'billers' AND column_name = 'linked_account_id'
    ) THEN '✓ billers.linked_account_id exists'
    ELSE '✗ billers.linked_account_id MISSING - Run 20260131_add_linked_account_to_billers.sql'
  END as linked_account_check;

-- Check for timing in installments
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'installments' AND column_name = 'timing'
    ) THEN '✓ installments.timing exists'
    ELSE '✗ installments.timing MISSING - Run 20260131_add_installment_timing.sql'
  END as timing_check;

-- Check for payment_schedule_id in transactions
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'transactions' AND column_name = 'payment_schedule_id'
    ) THEN '✓ transactions.payment_schedule_id exists'
    ELSE '✗ transactions.payment_schedule_id MISSING - Run 20260201_add_payment_schedule_to_transactions.sql'
  END as payment_schedule_check;

\echo ''

-- ============================================================================
-- CHECK 4: Foreign Keys
-- ============================================================================
\echo 'CHECK 4: Verifying foreign keys...'
\echo ''

SELECT 
  COUNT(*) as foreign_key_count,
  CASE 
    WHEN COUNT(*) >= 8 THEN '✓ Foreign keys look good'
    ELSE '⚠ Only ' || COUNT(*)::TEXT || ' foreign keys found (expected >= 8)'
  END as status
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY'
  AND table_schema = 'public'
  AND table_name IN ('billers', 'installments', 'savings', 'transactions', 'payment_schedules');

\echo ''

-- ============================================================================
-- CHECK 5: Unique Constraints for Duplicate Prevention
-- ============================================================================
\echo 'CHECK 5: Verifying unique constraints for duplicate prevention...'
\echo ''

-- Check for unique constraint on payment_schedule_id in transactions
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE indexname = 'idx_transactions_unique_payment_schedule'
    ) THEN '✓ Duplicate payment prevention index exists'
    ELSE '✗ MISSING duplicate prevention index - Run 20260201_add_payment_schedule_to_transactions.sql'
  END as duplicate_prevention_check;

\echo ''

-- ============================================================================
-- CHECK 6: Row Level Security (RLS)
-- ============================================================================
\echo 'CHECK 6: Verifying Row Level Security is enabled...'
\echo ''

SELECT 
  tablename,
  CASE 
    WHEN rowsecurity THEN '✓ RLS Enabled'
    ELSE '✗ RLS Disabled'
  END as rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'accounts', 'billers', 'installments', 'savings', 'transactions',
    'budget_setups', 'payment_schedules'
  )
ORDER BY tablename;

\echo ''

-- ============================================================================
-- CHECK 7: Data Counts
-- ============================================================================
\echo 'CHECK 7: Checking data counts...'
\echo ''

SELECT 'accounts' as table_name, COUNT(*) as row_count FROM accounts
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

-- ============================================================================
-- CHECK 8: Payment Schedules Integration
-- ============================================================================
\echo 'CHECK 8: Verifying payment schedules integration...'
\echo ''

-- Check if payment_schedules table has correct structure
SELECT 
  COUNT(*) as payment_schedule_columns,
  CASE 
    WHEN COUNT(*) >= 11 THEN '✓ payment_schedules table structure looks correct'
    ELSE '⚠ payment_schedules table may be incomplete'
  END as structure_check
FROM information_schema.columns 
WHERE table_name = 'payment_schedules';

\echo ''

-- ============================================================================
-- SUMMARY
-- ============================================================================
\echo '================================================================================'
\echo '                              VERIFICATION SUMMARY'
\echo '================================================================================'
\echo ''
\echo 'If all checks show ✓, your database is set up correctly!'
\echo ''
\echo 'If you see ✗ or ⚠, follow the instructions to run missing migrations.'
\echo 'See HOW_TO_RUN_MIGRATIONS.md for detailed guidance.'
\echo ''
\echo '================================================================================'
