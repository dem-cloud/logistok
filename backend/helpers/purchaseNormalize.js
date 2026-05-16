/**
 * Canonical storage:
 * - purchases.document_type: UPPERCASE abbreviations (PUR, GRN, CN, PO) — required by DB CHECK constraint.
 * - purchases.status: lowercase, trimmed (draft, sent, pending_invoice, …).
 */

const VALID_DOC_TYPES_UPPER = new Set(["PUR", "GRN", "CN", "PO"]);

/**
 * @param {unknown} s
 * @returns {'PUR'|'GRN'|'CN'|'PO'}
 */
function normalizePurchaseDocType(s) {
    const u = (s == null ? "" : String(s)).trim().toUpperCase();
    if (VALID_DOC_TYPES_UPPER.has(u)) return /** @type {'PUR'|'GRN'|'CN'|'PO'} */ (u);
    return "PUR";
}

/**
 * @param {unknown} s
 * @returns {string}
 */
function normalizePurchaseStatus(s) {
    return (s == null ? "" : String(s)).trim().toLowerCase();
}

module.exports = {
    normalizePurchaseDocType,
    normalizePurchaseStatus,
    VALID_DOC_TYPES_UPPER,
};
