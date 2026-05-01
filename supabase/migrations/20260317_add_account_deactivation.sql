-- Migration: Add account deactivation fields
-- Adds flags to allow accounts to be soft-deactivated without deleting historical transactions and relationships

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deactivation_date JSONB;