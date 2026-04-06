-- Add DBN (Debit Note) as a purchase document type.
-- DBN is the purchase equivalent of CRN (Credit Note) - used when returning goods to a vendor.

-- 1. Add DBN to purchases document_type check
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_document_type_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_document_type_check CHECK (
  document_type IN ('PUR', 'SDN', 'DBN')
);

COMMENT ON COLUMN purchases.document_type IS 'PUR = Purchase Invoice, SDN = Supplier Delivery Note, DBN = Debit Note (return to vendor).';

-- 2. Add debit_note to stock_movements related_document_type
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_related_document_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_related_document_type_check CHECK (
  related_document_type IS NULL OR
  related_document_type = ANY (ARRAY[
    'sale'::text, 'purchase'::text, 'adjustment'::text, 'transfer'::text,
    'sale_reversal'::text, 'credit_note'::text, 'debit_note'::text
  ])
);
