/**
 * Parent cancel guards: direct children only, fail-closed on unknown statuses.
 * Exact DB status strings (lowercase) — no implicit "not draft = posted" heuristics.
 */

/** GRN child statuses that permit cancelling the parent PO (exact DB values, lowercase). */
const GRN_STATUSES_ALLOW_PO_CANCEL = new Set(["reversed"]);

/** GRN statuses that block PO cancel until the draft GRN is deleted (exact DB values). */
const GRN_STATUS_DELETE_FIRST = new Set(["draft"]);

/**
 * GRN statuses that block PO cancel until the GRN is reversed (stock/posting undone).
 * Enumerated explicitly; any other non-allow status fails closed with LINKED_CHILD_STATUS_NOT_ALLOWED.
 */
const GRN_STATUS_REVERSE_FIRST = new Set([
    "pending_invoice",
    "received",
    "completed",
    "invoiced",
]);

/** DNO child statuses that permit cancelling the parent SO (exact DB values, lowercase). */
const DNO_STATUSES_ALLOW_SO_CANCEL = new Set(["reversed"]);

const DNO_STATUS_DELETE_FIRST = new Set(["draft"]);

const DNO_STATUS_REVERSE_FIRST = new Set(["pending_invoicing", "completed", "invoiced"]);

function normalizeStatus(status) {
    return (status == null ? "" : String(status)).trim().toLowerCase();
}

function grnBlockMessage(statusNorm) {
    if (GRN_STATUS_DELETE_FIRST.has(statusNorm)) {
        return {
            code: "LINKED_DRAFT_EXISTS",
            message:
                "Υπάρχει πρόχειρο Δελτίο Παραλαβής συνδεδεμένο με την παραγγελία. Διαγράψτε πρώτα το δελτίο και μετά ακυρώστε την παραγγελία.",
        };
    }
    if (GRN_STATUS_REVERSE_FIRST.has(statusNorm)) {
        return {
            code: "LINKED_POSTED_REQUIRES_REVERSAL",
            message:
                "Υπάρχει οριστικοποιημένο Δελτίο Παραλαβής. Αντιλογίστε πρώτα το δελτίο (αναίρεση κίνησης αποθέματος) και μετά ακυρώστε την παραγγελία.",
        };
    }
    return {
        code: "LINKED_CHILD_STATUS_NOT_ALLOWED",
        message: `Η ακύρωση δεν επιτρέπεται λόγω συνδεδεμένου Δελτίου Παραλαβής (κατάσταση: ${statusNorm || "—"}).`,
    };
}

function dnoBlockMessage(statusNorm) {
    if (DNO_STATUS_DELETE_FIRST.has(statusNorm)) {
        return {
            code: "LINKED_DRAFT_EXISTS",
            message:
                "Υπάρχει πρόχειρο Δελτίο Αποστολής συνδεδεμένο με την παραγγελία. Διαγράψτε πρώτα το δελτίο και μετά ακυρώστε την παραγγελία.",
        };
    }
    if (DNO_STATUS_REVERSE_FIRST.has(statusNorm)) {
        return {
            code: "LINKED_POSTED_REQUIRES_REVERSAL",
            message:
                "Υπάρχει οριστικοποιημένο Δελτίο Αποστολής. Αντιλογίστε πρώτα το δελτίο και μετά ακυρώστε την παραγγελία.",
        };
    }
    return {
        code: "LINKED_CHILD_STATUS_NOT_ALLOWED",
        message: `Η ακύρωση δεν επιτρέπεται λόγω συνδεδεμένου Δελτίου Αποστολής (κατάσταση: ${statusNorm || "—"}).`,
    };
}

/**
 * @returns {Promise<null | { code: string, message: string, blockingChildren: Array<{id:number,document_type:string,status:string}> }>}
 */
async function getPoCancelBlockReason(supabase, companyId, poId) {
    const { data: grns, error } = await supabase
        .from("purchases")
        .select("id, document_type, status, invoice_number")
        .eq("company_id", companyId)
        .eq("converted_from_id", poId)
        .eq("document_type", "GRN");

    if (error) {
        return {
            code: "GUARD_QUERY_FAILED",
            message: "Σφάλμα ελέγχου συνδεδεμένων παραλαβών",
            blockingChildren: [],
        };
    }

    for (const row of grns || []) {
        const st = normalizeStatus(row.status);
        if (GRN_STATUSES_ALLOW_PO_CANCEL.has(st)) continue;
        const { code, message } = grnBlockMessage(st);
        return {
            code,
            message,
            blockingChildren: [
                {
                    id: row.id,
                    document_type: "GRN",
                    status: st,
                    invoice_number: row.invoice_number ?? null,
                },
            ],
        };
    }
    return null;
}

/**
 * Close guard: only draft GRNs block closing a partially-received PO.
 * Finalized GRNs are expected and must NOT block.
 * @returns {Promise<null | { code: string, message: string, blockingChildren: Array<{id:number,document_type:string,status:string}> }>}
 */
async function getPoCloseBlockReason(supabase, companyId, poId) {
    const { data: grns, error } = await supabase
        .from("purchases")
        .select("id, document_type, status, invoice_number")
        .eq("company_id", companyId)
        .eq("converted_from_id", poId)
        .eq("document_type", "GRN");

    if (error) {
        return {
            code: "GUARD_QUERY_FAILED",
            message: "Σφάλμα ελέγχου συνδεδεμένων παραλαβών",
            blockingChildren: [],
        };
    }

    for (const row of grns || []) {
        const st = normalizeStatus(row.status);
        if (GRN_STATUS_DELETE_FIRST.has(st)) {
            return {
                code: "LINKED_DRAFT_EXISTS",
                message:
                    "Υπάρχει πρόχειρο Δελτίο Παραλαβής συνδεδεμένο με την παραγγελία. Διαγράψτε πρώτα το δελτίο και μετά κλείστε την παραγγελία.",
                blockingChildren: [
                    {
                        id: row.id,
                        document_type: "GRN",
                        status: st,
                        invoice_number: row.invoice_number ?? null,
                    },
                ],
            };
        }
    }
    return null;
}

/**
 * @returns {Promise<null | { code: string, message: string, blockingChildren: Array<{id:number,invoice_type:string,status:string}> }>}
 */
async function getSoCancelBlockReason(supabase, companyId, soId) {
    const { data: dnos, error } = await supabase
        .from("sales")
        .select("id, invoice_type, status, invoice_number")
        .eq("company_id", companyId)
        .eq("converted_from_id", soId)
        .eq("invoice_type", "DNO");

    if (error) {
        return {
            code: "GUARD_QUERY_FAILED",
            message: "Σφάλμα ελέγχου συνδεδεμένων δελτίων αποστολής",
            blockingChildren: [],
        };
    }

    for (const row of dnos || []) {
        const st = normalizeStatus(row.status);
        if (DNO_STATUSES_ALLOW_SO_CANCEL.has(st)) continue;
        const { code, message } = dnoBlockMessage(st);
        return {
            code,
            message,
            blockingChildren: [
                {
                    id: row.id,
                    invoice_type: "DNO",
                    status: st,
                    invoice_number: row.invoice_number ?? null,
                },
            ],
        };
    }
    return null;
}

module.exports = {
    getPoCancelBlockReason,
    getPoCloseBlockReason,
    getSoCancelBlockReason,
    GRN_STATUSES_ALLOW_PO_CANCEL,
    GRN_STATUS_DELETE_FIRST,
    GRN_STATUS_REVERSE_FIRST,
    DNO_STATUSES_ALLOW_SO_CANCEL,
    DNO_STATUS_DELETE_FIRST,
    DNO_STATUS_REVERSE_FIRST,
    normalizeStatus,
};
