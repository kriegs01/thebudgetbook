-- Migration: Add receipt_url to transactions table
-- This enables storing receipt images uploaded to Supabase Storage

-- Add receipt_url column to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Also add to test table if it exists
ALTER TABLE IF EXISTS transactions_test
ADD COLUMN IF NOT EXISTS receipt_url TEXT;

COMMENT ON COLUMN transactions.receipt_url IS 'URL of receipt image stored in Supabase Storage (transaction-receipts bucket)';

-- Create the Supabase Storage bucket for transaction receipts
-- Note: Run this in the Supabase dashboard SQL editor or via management API if the bucket doesn't exist
-- INSERT INTO storage.buckets (id, name, public) VALUES ('transaction-receipts', 'transaction-receipts', false)
-- ON CONFLICT (id) DO NOTHING;

-- Storage policies for the transaction-receipts bucket
-- Allow authenticated users to upload their own receipts
-- CREATE POLICY "Users can upload their own receipts"
-- ON storage.objects FOR INSERT TO authenticated
-- WITH CHECK (bucket_id = 'transaction-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to view their own receipts
-- CREATE POLICY "Users can view their own receipts"
-- ON storage.objects FOR SELECT TO authenticated
-- USING (bucket_id = 'transaction-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to delete their own receipts
-- CREATE POLICY "Users can delete their own receipts"
-- ON storage.objects FOR DELETE TO authenticated
-- USING (bucket_id = 'transaction-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
