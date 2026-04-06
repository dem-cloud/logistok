-- GRN (SDN) lines: link to PO line; flag lines not on the PO
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS po_line_id BIGINT NULL REFERENCES purchase_items (id) ON DELETE SET NULL;

ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS is_extra BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN purchase_items.po_line_id IS 'For SDN lines from a PO: references the PO purchase_items.id this receipt line fulfills.';
COMMENT ON COLUMN purchase_items.is_extra IS 'True when the line was added on the GRN and was not on the source PO.';

CREATE INDEX IF NOT EXISTS idx_purchase_items_po_line_id ON purchase_items (po_line_id) WHERE po_line_id IS NOT NULL;
