-- =============================================================================
-- Purge ALL sales + ALL purchases for ONE company (run manually in SQL editor).
-- =============================================================================
--
-- What it removes
--   • stock_movements linked to those sales/purchases (by related_document_type + id)
--   • payments tied to company purchases
--   • all receipts rows for that company_id
--   • sale_items, purchase_items
--   • all sales and all purchases for the company
--   • document_sequences for that company (invoice counters reset)
--
-- What it does NOT do
--   • It does NOT reverse inventory to a “before invoices” state — quantities
--     in store_products are unchanged. Fix stock separately if you need to.
--
-- How to run
--   1. Copy your company UUID from table `companies` (column `id`).
--   2. Replace the placeholder in `cid` below (only that line).
--   3. Run the entire `DO $$ ... END $$;` block once.
--
-- Optional: wrap in BEGIN; … COMMIT; for a single transaction (psql / some clients).
--

DO $$
DECLARE
  cid uuid := '00000000-0000-0000-0000-000000000000';  -- <<< REPLACE with companies.id
BEGIN
  -- Movements for purchase documents (PUR, GRN, CN rows live in purchases)
  DELETE FROM stock_movements sm
  USING purchases p
  WHERE sm.company_id = p.company_id
    AND p.company_id = cid
    AND sm.related_document_type = 'purchase'
    AND sm.related_document_id = p.id;

  DELETE FROM stock_movements sm
  USING purchases p
  WHERE sm.company_id = p.company_id
    AND p.company_id = cid
    AND sm.related_document_type = 'credit_note'
    AND sm.related_document_id = p.id;

  -- Movements for sales documents (REC, INV, CRN, …)
  DELETE FROM stock_movements sm
  USING sales s
  WHERE sm.company_id = s.company_id
    AND s.company_id = cid
    AND sm.related_document_type IN ('sale', 'sale_reversal')
    AND sm.related_document_id = s.id;

  DELETE FROM stock_movements sm
  USING sales s
  WHERE sm.company_id = s.company_id
    AND s.company_id = cid
    AND sm.related_document_type = 'credit_note'
    AND sm.related_document_id = s.id;

  DELETE FROM payments
  WHERE purchase_id IN (SELECT id FROM purchases WHERE company_id = cid);

  DELETE FROM receipts
  WHERE company_id = cid;

  DELETE FROM sale_items
  WHERE sale_id IN (SELECT id FROM sales WHERE company_id = cid);

  DELETE FROM purchase_items
  WHERE purchase_id IN (SELECT id FROM purchases WHERE company_id = cid);

  UPDATE sales SET converted_from_id = NULL WHERE company_id = cid;
  UPDATE purchases SET converted_from_id = NULL WHERE company_id = cid;

  DELETE FROM sales WHERE company_id = cid;
  DELETE FROM purchases WHERE company_id = cid;

  DELETE FROM document_sequences WHERE company_id = cid;
END $$;
