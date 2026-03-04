-- Migration: Set up Supabase Storage for transaction receipts
-- Run this in the Supabase SQL Editor (https://app.supabase.com → SQL Editor)
--
-- This creates the "transaction-receipts" storage bucket and the RLS policies
-- that allow each authenticated user to upload, view, and delete their own receipts.
-- Files are stored under {user_id}/{transaction_id}/{timestamp}.{ext}

-- Create the storage bucket (private by default; signed URLs are used for access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('transaction-receipts', 'transaction-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own receipts
-- (path must start with their own user_id folder)
CREATE POLICY IF NOT EXISTS "Users can upload their own receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'transaction-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to read their own receipts (needed for signed URL creation)
CREATE POLICY IF NOT EXISTS "Users can view their own receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'transaction-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to overwrite/update their own receipts
CREATE POLICY IF NOT EXISTS "Users can update their own receipts"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'transaction-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own receipts
CREATE POLICY IF NOT EXISTS "Users can delete their own receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'transaction-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
