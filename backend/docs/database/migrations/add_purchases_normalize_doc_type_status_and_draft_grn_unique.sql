-- Normalize purchases.status to lowercase (trimmed). Keep document_type as stored by the app:
-- PUR, GRN, DBN, PO (UPPERCASE) — required by purchases_document_type_check until a migration changes it.
-- Then enforce at most one draft GRN per PO (race-safe with POST /create-grn).
--
-- Run order: 1) fix duplicate draft GRNs per (company_id, converted_from_id) if any
--            2) this migration

BEGIN;

UPDATE purchases
SET status = lower(trim(status::text));

CREATE UNIQUE INDEX IF NOT EXISTS purchases_one_draft_grn_per_po
ON purchases (company_id, converted_from_id)
WHERE document_type = 'GRN' AND status = 'draft';

COMMIT;
