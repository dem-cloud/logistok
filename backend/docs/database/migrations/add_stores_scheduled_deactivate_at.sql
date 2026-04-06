-- Migration: Add scheduled_deactivate_at to stores table
-- Option A: Store removal at end of billing period

ALTER TABLE stores
ADD COLUMN IF NOT EXISTS scheduled_deactivate_at TIMESTAMP NULL;

COMMENT ON COLUMN stores.scheduled_deactivate_at IS 'When store will be deactivated (end of billing period). NULL = not scheduled. Cleared when deactivated or user cancels.';
