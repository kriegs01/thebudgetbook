-- Migration: Add archive fields to budget_setups
-- Adds is_archived, closed_at, and reopened_at columns for the
-- Close (Archive) + Reopen lifecycle feature.

ALTER TABLE budget_setups
ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS closed_at   timestamptz,
ADD COLUMN IF NOT EXISTS reopened_at timestamptz;
