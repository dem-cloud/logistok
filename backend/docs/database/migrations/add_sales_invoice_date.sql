-- Migration: Add invoice_date to sales table
-- Optional document date, separate from created_at (entry date)

ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN sales.invoice_date IS 'Date of the document; may differ from created_at. Optional, default today on create.';
