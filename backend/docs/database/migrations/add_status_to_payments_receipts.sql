-- Add status column to payments and receipts tables for draft lifecycle
-- Existing records default to 'posted' (already finalized); new records will be created as 'draft'

ALTER TABLE payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';
