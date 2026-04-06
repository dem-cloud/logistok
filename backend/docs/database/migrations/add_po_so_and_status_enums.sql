-- Add PO (Purchase Order) and SO (Sales Order) document types.
-- Extend status values for spec-aligned document lifecycle.

-- 1. Purchases: add PO to document_type
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_document_type_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_document_type_check CHECK (
  document_type IN ('PUR', 'SDN', 'DBN', 'PO')
);
COMMENT ON COLUMN purchases.document_type IS 'PO=Purchase Order, SDN=GRN Goods Received, PUR=Purchase Invoice, DBN=Purchase Credit Note';

-- 2. Purchases: extend status for spec lifecycle
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_status_check CHECK (
  status IN (
    'draft', 'ordered', 'received', 'completed', 'cancelled', 'invoiced',
    'sent', 'partially_received', 'closed', 'pending_invoice', 'reversed', 'credited', 'posted'
  )
);

-- 3. Sales: add SO to invoice_type
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_invoice_type_check;
ALTER TABLE sales ADD CONSTRAINT sales_invoice_type_check CHECK (
  invoice_type IN ('QUO', 'REC', 'INV', 'CRN', 'DNO', 'SO')
);
COMMENT ON COLUMN sales.invoice_type IS 'QUO=Quote, SO=Sales Order, DNO=Delivery Note, INV=Invoice, REC=Receipt, CRN=Credit Note';
