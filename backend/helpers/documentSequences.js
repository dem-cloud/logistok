/**
 * Auto-numbering for sales and purchase documents.
 * Format: [PREFIX]-[YEAR]-[SEQUENCE] (e.g. INV-2024-0001, QUO-2024-0001)
 * Sequence is per company, per document type, per year. Resets to 0001 each new year.
 */
const supabase = require("../supabaseConfig");

const DOC_TYPE_PREFIXES = {
    QUO: "QUO",
    SO: "SO",
    REC: "REC",
    INV: "INV",
    CRN: "CRN",
    DNO: "DNO",
    PUR: "PUR",
    PO: "PO",
    GRN: "GRN",
    DBN: "DBN",
};

/**
 * Get the next sequence number for a document type, atomically.
 * @param {string} companyId - Company UUID
 * @param {string} documentType - One of QUO, REC, INV, CRN, DNO, PUR, GRN
 * @returns {Promise<string>} - Formatted number e.g. "INV-2024-0001"
 */
async function getNextSequence(companyId, documentType) {
    const prefix = DOC_TYPE_PREFIXES[documentType];
    if (!prefix) {
        throw new Error(`Invalid document type: ${documentType}`);
    }

    const year = new Date().getFullYear();

    const { data, error } = await supabase.rpc("increment_document_sequence", {
        p_company_id: companyId,
        p_document_type: documentType,
        p_year: year,
    });

    if (error) {
        if (error.code === "42883" || error.message?.includes("function") || error.message?.includes("does not exist")) {
            return await getNextSequenceFallback(companyId, documentType, year, prefix);
        }
        throw error;
    }

    const seq = data ?? 1;
    return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/**
 * Fallback when RPC doesn't exist: use raw upsert via REST.
 * Supabase doesn't support INSERT ON CONFLICT DO UPDATE through the client easily,
 * so we use a select-then-update with a short retry for race conditions.
 */
async function getNextSequenceFallback(companyId, documentType, year, prefix) {
    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const { data: existing } = await supabase
            .from("document_sequences")
            .select("last_sequence")
            .eq("company_id", companyId)
            .eq("document_type", documentType)
            .eq("year", year)
            .single();

        const nextSeq = existing ? (existing.last_sequence || 0) + 1 : 1;

        if (existing) {
            const { data: updated, error: updErr } = await supabase
                .from("document_sequences")
                .update({ last_sequence: nextSeq })
                .eq("company_id", companyId)
                .eq("document_type", documentType)
                .eq("year", year)
                .select("last_sequence")
                .single();

            if (!updErr && updated) {
                return `${prefix}-${year}-${String(nextSeq).padStart(4, "0")}`;
            }
            if (updErr?.code === "PGRST116") {
                continue;
            }
        } else {
            const { error: insErr } = await supabase.from("document_sequences").insert({
                company_id: companyId,
                document_type: documentType,
                year,
                last_sequence: 1,
            });

            if (!insErr) {
                return `${prefix}-${year}-0001`;
            }
            if (insErr?.code === "23505") {
                continue;
            }
        }
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
    throw new Error("Failed to get document sequence after retries");
}

/**
 * Validate that a user-provided invoice_number is unique for the company.
 * @param {string} companyId - Company UUID
 * @param {string} invoiceNumber - User-provided number
 * @param {string} excludeSaleId - Optional sale ID to exclude (for updates)
 * @param {string} excludePurchaseId - Optional purchase ID to exclude
 */
async function isInvoiceNumberUnique(companyId, invoiceNumber, excludeSaleId = null, excludePurchaseId = null) {
    if (!invoiceNumber || !String(invoiceNumber).trim()) return true;

    const num = String(invoiceNumber).trim();
    if (excludeSaleId != null) {
        const { data: sale } = await supabase
            .from("sales")
            .select("id")
            .eq("company_id", companyId)
            .eq("invoice_number", num)
            .neq("id", excludeSaleId)
            .limit(1)
            .maybeSingle();
        if (sale) return false;
    } else {
        const { data: sale } = await supabase
            .from("sales")
            .select("id")
            .eq("company_id", companyId)
            .eq("invoice_number", num)
            .limit(1)
            .maybeSingle();
        if (sale) return false;
    }

    if (excludePurchaseId != null) {
        const { data: purchase } = await supabase
            .from("purchases")
            .select("id")
            .eq("company_id", companyId)
            .eq("invoice_number", num)
            .neq("id", excludePurchaseId)
            .limit(1)
            .maybeSingle();
        if (purchase) return false;
    } else {
        const { data: purchase } = await supabase
            .from("purchases")
            .select("id")
            .eq("company_id", companyId)
            .eq("invoice_number", num)
            .limit(1)
            .maybeSingle();
        if (purchase) return false;
    }

    return true;
}

module.exports = {
    getNextSequence,
    isInvoiceNumberUnique,
    DOC_TYPE_PREFIXES,
};
