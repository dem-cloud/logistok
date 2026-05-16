-- Remove legacy synthetic rows:
--   * payments.is_auto = true (old PUR immediate auto-pay, cn_auto:*, dbn_auto:*, etc.)
--   * receipts.is_auto = true (old sales auto-receipt for REC / immediate INV)
--
-- After running this migration, execute from the backend folder:
--   node scripts/recomputeBalancesAfterAutoCleanup.js
-- so every PUR and REC/INV sale gets payment_status / amount_due from real rows only.
--
-- Safe to re-run (DELETE is idempotent when nothing matches).

BEGIN;

DELETE FROM payments
WHERE is_auto IS TRUE;

DELETE FROM receipts
WHERE is_auto IS TRUE;

COMMIT;
