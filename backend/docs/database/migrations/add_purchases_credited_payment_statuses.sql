-- Add `partially_credited` and `credited` payment statuses to purchases.
-- Also migrate any existing DBN records with status = 'posted' to 'completed'
-- so they use the canonical finalized status (displayed as "Ολοκλήρωση").
--
-- Safe to re-run.

BEGIN;

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_payment_status_check;
ALTER TABLE purchases
    ADD CONSTRAINT purchases_payment_status_check
    CHECK (
        payment_status IS NULL
        OR payment_status IN (
            'unpaid',
            'partial',
            'paid',
            'overdue',
            'partially_credited',
            'credited'
        )
    );

UPDATE purchases
SET status = 'completed'
WHERE document_type = 'DBN' AND status = 'posted';

COMMIT;
