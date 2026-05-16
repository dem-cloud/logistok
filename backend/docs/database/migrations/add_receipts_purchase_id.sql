-- Extend receipts to also cover Είσπραξη against a Πιστωτικό Αγοράς (DBN).
--
-- Until now `receipts` was always keyed to a `sales` row (cash/credit received
-- from a customer). When a supplier issues a credit note (DBN) against a PUR
-- that was already paid, we now record the refund via a receipt linked to the
-- DBN. We therefore add a nullable `purchase_id` column with a CHECK constraint
-- that forces exactly one of `sale_id` / `purchase_id` to be set.
--
-- Safe to run multiple times.

ALTER TABLE receipts
    ADD COLUMN IF NOT EXISTS purchase_id BIGINT;

-- Make sale_id nullable (was already null per schema but keep explicit in case
-- some environments have an older not-null definition).
ALTER TABLE receipts
    ALTER COLUMN sale_id DROP NOT NULL;

-- FK on the new purchase_id column. Using NO ACTION so we never silently
-- cascade-delete a receipt when the linked DBN gets removed.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'receipts'
          AND constraint_name = 'receipts_purchase_id_fkey'
    ) THEN
        ALTER TABLE receipts
            ADD CONSTRAINT receipts_purchase_id_fkey
            FOREIGN KEY (purchase_id) REFERENCES purchases (id);
    END IF;
END $$;

-- Enforce: exactly one of sale_id / purchase_id must be set.
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_source_xor_check;
ALTER TABLE receipts
    ADD CONSTRAINT receipts_source_xor_check
    CHECK (
        (sale_id IS NOT NULL AND purchase_id IS NULL)
        OR (sale_id IS NULL AND purchase_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS receipts_purchase_id_idx
    ON receipts (purchase_id);
