-- Rename DBN → CN in the Purchases module.
--
-- Consolidates historical "Debit Note / DBN" terminology into "Credit Note / CN"
-- throughout the Purchases scope only. Sales (CRN, DNO, etc.) is NOT touched by
-- this migration.
--
-- Scope:
--   * purchases.document_type:  'DBN'         → 'CN'   (+ CHECK constraint)
--   * purchases.invoice_number: 'DBN-YYYY-..' → 'CN-YYYY-..' (prefix only)
--   * stock_movements.related_document_type: 'debit_note' → 'credit_note' (+ CHECK)
--   * stock_movements.source:                 'debit_note' → 'credit_note' (no CHECK)
--   * document_sequences.document_type:       'DBN'        → 'CN' (preserves counters)
--
-- Idempotent — safe to re-run (each step is a no-op when values already match).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. purchases.document_type
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchases
    DROP CONSTRAINT IF EXISTS purchases_document_type_check;

UPDATE public.purchases
SET document_type = 'CN'
WHERE document_type = 'DBN';

ALTER TABLE public.purchases
    ADD CONSTRAINT purchases_document_type_check
    CHECK (document_type = ANY (ARRAY['PUR'::text, 'GRN'::text, 'CN'::text, 'PO'::text]));

-- ---------------------------------------------------------------------------
-- 2. purchases.invoice_number prefix rename (DBN- → CN-)
-- ---------------------------------------------------------------------------
UPDATE public.purchases
SET invoice_number = 'CN-' || SUBSTRING(invoice_number FROM 5)
WHERE document_type = 'CN'
  AND invoice_number LIKE 'DBN-%';

-- ---------------------------------------------------------------------------
-- 3. stock_movements: related_document_type + source
-- ---------------------------------------------------------------------------
ALTER TABLE public.stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_related_document_type_check;

UPDATE public.stock_movements
SET related_document_type = 'credit_note'
WHERE related_document_type = 'debit_note';

UPDATE public.stock_movements
SET source = 'credit_note'
WHERE source = 'debit_note';

ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_related_document_type_check
    CHECK (
        related_document_type IS NULL
        OR related_document_type = ANY (ARRAY[
            'sale'::text,
            'purchase'::text,
            'adjustment'::text,
            'transfer'::text,
            'sale_reversal'::text,
            'credit_note'::text
        ])
    );

-- ---------------------------------------------------------------------------
-- 4. document_sequences: preserve per-year counters under the new doc type
-- ---------------------------------------------------------------------------
-- If a company had both DBN and CN rows for the same year (shouldn't happen,
-- but defensive) we keep the higher counter so future CNs don't collide.
UPDATE public.document_sequences AS ds
SET last_sequence = GREATEST(
        ds.last_sequence,
        COALESCE((
            SELECT ds2.last_sequence
            FROM public.document_sequences ds2
            WHERE ds2.company_id   = ds.company_id
              AND ds2.document_type = 'DBN'
              AND ds2.year          = ds.year
        ), 0)
    )
WHERE ds.document_type = 'CN';

-- Rename rows that are DBN-only (no existing CN row for the same company/year).
UPDATE public.document_sequences
SET document_type = 'CN'
WHERE document_type = 'DBN'
  AND NOT EXISTS (
      SELECT 1
      FROM public.document_sequences ds2
      WHERE ds2.company_id    = document_sequences.company_id
        AND ds2.document_type = 'CN'
        AND ds2.year          = document_sequences.year
  );

-- Drop any leftover DBN rows that collided with pre-existing CN rows
-- (we already rolled their counter into CN above).
DELETE FROM public.document_sequences
WHERE document_type = 'DBN';

-- ---------------------------------------------------------------------------
-- 5. payments: defensive cleanup of legacy is_auto 'dbn_auto:<id>' rows
--    (no-op if remove_dbn_auto_payments.sql already ran).
-- ---------------------------------------------------------------------------
DELETE FROM public.payments
WHERE is_auto = true
  AND notes LIKE 'dbn_auto:%';

COMMIT;
