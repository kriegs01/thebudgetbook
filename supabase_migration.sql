-- ============================================
-- Supabase Migration: Add Trash and Categories Tables
-- ============================================
-- This migration adds support for:
-- 1. Trash table for soft-deleted items
-- 2. Categories table for budget categories
-- ============================================

-- Create trash table for soft-deleted items
CREATE TABLE IF NOT EXISTS trash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'transaction', 'account', 'biller', 'installment', 'savings', 'budget'
  original_id UUID NOT NULL, -- ID from the original table
  data JSONB NOT NULL, -- Store the full record as JSON
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on type for faster filtering
CREATE INDEX IF NOT EXISTS idx_trash_type ON trash(type);
CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON trash(deleted_at);

-- Create categories table for budget categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  subcategories JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- Enable Row Level Security (RLS)
ALTER TABLE trash ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust based on your auth needs)
-- WARNING: These policies allow anyone to read/write. 
-- In production, restrict based on user authentication!
CREATE POLICY "Enable all for trash" ON trash FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for categories" ON categories FOR ALL USING (true) WITH CHECK (true);

-- Add comment documentation
COMMENT ON TABLE trash IS 'Stores soft-deleted records from various tables';
COMMENT ON TABLE categories IS 'Stores budget categories and their subcategories';
COMMENT ON COLUMN trash.type IS 'The type of record (transaction, account, biller, etc.)';
COMMENT ON COLUMN trash.original_id IS 'The original ID from the source table';
COMMENT ON COLUMN trash.data IS 'Full JSON representation of the deleted record';
COMMENT ON COLUMN categories.subcategories IS 'Array of subcategory names stored as JSONB';
