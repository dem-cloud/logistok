-- Remove the legacy is_auto `dbn_auto:<id>` payment rows.
--
-- Credit Notes (DBNs) no longer insert a payment row on finalize. The PUR's
-- amount_due is now derived directly from (real payments) + (non-reversed DBN
-- totals) via helpers/paymentStatus.js → recomputePurchasePaymentStatus.
-- Any leftover rows from the previous design would double-count if left in place.
--
-- Also fixes DBN rows that were auto-closed under the old logic but whose source
-- PUR is not actually fully credited — those should revert to `completed` so the
-- Αντιλογισμός Πιστωτικού button becomes enabled again.
--
-- Safe to re-run.

BEGIN;

DELETE FROM payments
WHERE is_auto = true
  AND notes LIKE 'dbn_auto:%';

UPDATE purchases AS dbn
SET status = 'completed'
FROM purchases AS src
WHERE dbn.document_type = 'DBN'
  AND dbn.status = 'closed'
  AND dbn.converted_from_id = src.id
  AND dbn.company_id = src.company_id
  AND COALESCE(src.payment_status, '') NOT IN ('credited', 'paid');

COMMIT;
