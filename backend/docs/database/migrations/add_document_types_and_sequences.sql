-- Migration: Document types for Sales and Purchases
-- Adds document_sequences table, expands sales/purchases schema for QUO, REC, INV, CRN, DNO, PUR, SDN

-- 1. Create document_sequences table for auto-numbering
CREATE TABLE IF NOT EXISTS document_sequences (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, document_type, year)
);

COMMENT ON TABLE document_sequences IS 'Auto-numbering sequences per company, document type, and year. Format: PREFIX-YEAR-SEQ (e.g. INV-2024-0001).';

-- 2. Sales: add converted_from_id and expiry_date
ALTER TABLE sales ADD COLUMN IF NOT EXISTS converted_from_id BIGINT REFERENCES sales(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN sales.converted_from_id IS 'References the source document when this sale was created from a conversion (e.g. Quote->Receipt, DNO->Invoice).';
COMMENT ON COLUMN sales.expiry_date IS 'For Quotes: when the quote expires. Checked on view for expired status.';

-- 3. Sales: migrate invoice_type (receipt->REC, invoice->INV) and add CHECK
UPDATE sales SET invoice_type = 'REC' WHERE invoice_type = 'receipt';
UPDATE sales SET invoice_type = 'INV' WHERE invoice_type = 'invoice';

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_invoice_type_check;
ALTER TABLE sales ADD CONSTRAINT sales_invoice_type_check CHECK (
  invoice_type IN ('QUO', 'REC', 'INV', 'CRN', 'DNO')
);

ALTER TABLE sales ALTER COLUMN invoice_type SET DEFAULT 'REC';

-- 4. Purchases: add document_type and converted_from_id
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'PUR';
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS converted_from_id BIGINT REFERENCES purchases(id);

COMMENT ON COLUMN purchases.document_type IS 'PUR = Purchase Invoice, SDN = Supplier Delivery Note.';
COMMENT ON COLUMN purchases.converted_from_id IS 'References the SDN when this PUR was created from SDN conversion.';

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_document_type_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_document_type_check CHECK (
  document_type IN ('PUR', 'SDN')
);

-- 5. Purchases: add 'invoiced' status for SDN
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_status_check CHECK (
  status = ANY (ARRAY['draft'::text, 'ordered'::text, 'received'::text, 'completed'::text, 'cancelled'::text, 'invoiced'::text])
);

-- 6. Stock_movements: allow sale_reversal and credit_note in related_document_type
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_related_document_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_related_document_type_check CHECK (
  related_document_type IS NULL OR
  related_document_type = ANY (ARRAY['sale'::text, 'purchase'::text, 'adjustment'::text, 'transfer'::text, 'sale_reversal'::text, 'credit_note'::text])
);
