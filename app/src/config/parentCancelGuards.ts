/**
 * Mirrors backend/helpers/documentCancelGuards.js for UI (disable + tooltips).
 * PO cancel: only direct GRN children (filter linked_documents by document_type === GRN — GET detail may include PUR from GRN).
 * SO cancel: only direct DNO children (linked_documents from API are DNO-only for SO).
 */

function normalizeStatus(status: string | null | undefined): string {
    return (status == null ? "" : String(status)).trim().toLowerCase();
}

/** Exact DB strings — must match backend GRN_STATUSES_ALLOW_PO_CANCEL */
const GRN_STATUSES_ALLOW_PO_CANCEL = new Set(["reversed"]);

const GRN_STATUS_DELETE_FIRST = new Set(["draft"]);

const GRN_STATUS_REVERSE_FIRST = new Set(["pending_invoice", "received", "completed", "invoiced"]);

/** Exact DB strings — must match backend DNO_STATUSES_ALLOW_SO_CANCEL */
const DNO_STATUSES_ALLOW_SO_CANCEL = new Set(["reversed"]);

const DNO_STATUS_DELETE_FIRST = new Set(["draft"]);

const DNO_STATUS_REVERSE_FIRST = new Set(["pending_invoicing", "completed", "invoiced"]);

function grnBlockMessage(statusNorm: string): string {
    if (GRN_STATUS_DELETE_FIRST.has(statusNorm)) {
        return "Υπάρχει πρόχειρο Δελτίο Παραλαβής συνδεδεμένο με την παραγγελία. Διαγράψτε πρώτα το δελτίο και μετά ακυρώστε την παραγγελία.";
    }
    if (GRN_STATUS_REVERSE_FIRST.has(statusNorm)) {
        return "Υπάρχει οριστικοποιημένο Δελτίο Παραλαβής. Αντιλογίστε πρώτα το δελτίο (αναίρεση κίνησης αποθέματος) και μετά ακυρώστε την παραγγελία.";
    }
    return `Η ακύρωση δεν επιτρέπεται λόγω συνδεδεμένου Δελτίου Παραλαβής (κατάσταση: ${statusNorm || "—"}).`;
}

function dnoBlockMessage(statusNorm: string): string {
    if (DNO_STATUS_DELETE_FIRST.has(statusNorm)) {
        return "Υπάρχει πρόχειρο Δελτίο Αποστολής συνδεδεμένο με την παραγγελία. Διαγράψτε πρώτα το δελτίο και μετά ακυρώστε την παραγγελία.";
    }
    if (DNO_STATUS_REVERSE_FIRST.has(statusNorm)) {
        return "Υπάρχει οριστικοποιημένο Δελτίο Αποστολής. Αντιλογίστε πρώτα το δελτίο και μετά ακυρώστε την παραγγελία.";
    }
    return `Η ακύρωση δεν επιτρέπεται λόγω συνδεδεμένου Δελτίου Αποστολής (κατάσταση: ${statusNorm || "—"}).`;
}

export type LinkedGrnRow = { document_type?: string | null; status?: string | null };

/**
 * @returns Tooltip message when PO cancel must be disabled, or null if allowed (all GRNs in allow-list).
 */
export function getPoCancelBlockMessageFromLinked(linked: LinkedGrnRow[] | undefined): string | null {
    const grns = (linked ?? []).filter((d) => (d.document_type || "").toUpperCase() === "GRN");
    for (const row of grns) {
        const st = normalizeStatus(row.status);
        if (GRN_STATUSES_ALLOW_PO_CANCEL.has(st)) continue;
        return grnBlockMessage(st);
    }
    return null;
}

export type LinkedDnoRow = { invoice_type?: string | null; status?: string | null };

/**
 * @returns Tooltip message when SO cancel must be disabled, or null if allowed.
 */
export function getSoCancelBlockMessageFromLinked(linked: LinkedDnoRow[] | undefined): string | null {
    const dnos = (linked ?? []).filter((d) => (d.invoice_type || "").toUpperCase() === "DNO");
    for (const row of dnos) {
        const st = normalizeStatus(row.status);
        if (DNO_STATUSES_ALLOW_SO_CANCEL.has(st)) continue;
        return dnoBlockMessage(st);
    }
    return null;
}
