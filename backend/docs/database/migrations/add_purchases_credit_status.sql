-- Split purchase "credited" state off of payment_status into its own credit_status column.
--
-- A Purchase Invoice now carries three independent states:
--   * status          — document lifecycle (draft, completed/"posted", reversed, …)
--   * payment_status  — cash-only (unpaid, partial, paid, overdue)
--   * credit_status   — credit-note-only (NULL, partially_credited, credited)
--
-- Rationale: an invoice can be "Posted + Paid + Partially Credited" (cash fully
-- settled AND a partial return/credit exists against it) or "Posted + Unpaid +
-- Fully Credited" (no cash paid but a credit note fully covers the balance).
-- The two dimensions are orthogonal so they must not share a single column.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE purchases
    ADD COLUMN IF NOT EXISTS credit_status TEXT;

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_credit_status_check;
ALTER TABLE purchases
    ADD CONSTRAINT purchases_credit_status_check
    CHECK (
        credit_status IS NULL
        OR credit_status IN ('partially_credited', 'credited')
    );

-- Move legacy payment_status values ('partially_credited','credited') into
-- credit_status. Under the old (single-column) model those values implied
-- zero cash payments, so reset payment_status to 'unpaid'.
UPDATE purchases
SET credit_status = 'credited', payment_status = 'unpaid'
WHERE payment_status = 'credited';

UPDATE purchases
SET credit_status = 'partially_credited', payment_status = 'unpaid'
WHERE payment_status = 'partially_credited';

-- Backfill credit_status for any PUR that still has it NULL but has linked
-- non-reversed DBNs. Use the same formula the application now uses:
--   credits >= total → 'credited', credits > 0 → 'partially_credited'.
WITH dbn_sums AS (
    SELECT
        dbn.company_id,
        dbn.converted_from_id AS pur_id,
        SUM(ABS(dbn.total_amount)) AS credited_total
    FROM purchases dbn
    WHERE dbn.document_type = 'DBN'
      AND LOWER(COALESCE(dbn.status, '')) IN ('completed', 'posted', 'closed')
      AND dbn.converted_from_id IS NOT NULL
    GROUP BY dbn.company_id, dbn.converted_from_id
)
UPDATE purchases pur
SET credit_status = CASE
        WHEN ds.credited_total + 1e-6 >= COALESCE(pur.total_amount, 0) THEN 'credited'
        WHEN ds.credited_total > 0 THEN 'partially_credited'
        ELSE NULL
    END
FROM dbn_sums ds
WHERE ds.pur_id = pur.id
  AND ds.company_id = pur.company_id
  AND pur.document_type = 'PUR'
  AND pur.credit_status IS NULL;

-- Constrain payment_status back to cash-only states.
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_payment_status_check;
ALTER TABLE purchases
    ADD CONSTRAINT purchases_payment_status_check
    CHECK (
        payment_status IS NULL
        OR payment_status IN ('unpaid', 'partial', 'paid', 'overdue')
    );

COMMIT;
