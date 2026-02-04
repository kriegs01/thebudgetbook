-- Migration: Enable Real-time for Transactions Table
-- This enables Supabase real-time subscriptions for instant balance updates
-- Run this in your Supabase SQL Editor

-- Step 1: Set REPLICA IDENTITY to FULL
-- This allows real-time to broadcast the full row data when changes occur
ALTER TABLE transactions REPLICA IDENTITY FULL;

-- Step 2: Add the transactions table to the realtime publication
-- Note: If you get an error that the publication doesn't exist, see below
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;

-- Troubleshooting:
-- If you get "publication supabase_realtime does not exist", run this first:
-- CREATE PUBLICATION supabase_realtime;
-- Then run the ALTER PUBLICATION command above again.

-- Verify the setup with these queries:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- SELECT relreplident FROM pg_class WHERE relname = 'transactions';
-- (relreplident should be 'f' for FULL)

-- Note: You may also need to enable Realtime in the Supabase Dashboard:
-- 1. Go to Database > Replication
-- 2. Ensure 'transactions' table is listed and toggled ON
-- 3. If not, click "Enable" next to the transactions table
