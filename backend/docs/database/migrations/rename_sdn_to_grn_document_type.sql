-- Rename stored purchase document type SDN → GRN (Goods Receipt Note).
-- Run after backups; deploy app only after this migration succeeds.

BEGIN;

-- Must drop the check *before* setting GRN: the old constraint allows SDN, not GRN.
ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_document_type_check;

UPDATE public.purchases
SET document_type = 'GRN'
WHERE document_type = 'SDN';

UPDATE public.document_sequences
SET document_type = 'GRN'
WHERE document_type = 'SDN';

ALTER TABLE public.purchases ADD CONSTRAINT purchases_document_type_check CHECK (
  document_type IN ('PUR', 'GRN', 'DBN', 'PO')
);

COMMENT ON COLUMN public.purchases.document_type IS 'PO=Purchase Order, GRN=Goods Receipt Note, PUR=Purchase Invoice, DBN=Purchase Credit Note';
COMMENT ON COLUMN public.purchases.converted_from_id IS 'References the GRN when this PUR was created from GRN conversion; PO id when document is a GRN from that PO.';

COMMIT;
