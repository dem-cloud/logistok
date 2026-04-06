/**
 * PO ↔ GRN receipt totals and PO status sync.
 * Only lines with po_line_id (non-extra) count toward PO fulfillment.
 */

const FINAL_GRN_STATUSES = ["pending_invoice", "completed", "invoiced"];

/**
 * Sum received quantity per PO line from finalized GRNs for a PO.
 * @param {object} supabase
 * @param {string} companyId
 * @param {number} poId
 * @param {number|null} excludeGrnId - exclude this GRN (e.g. current draft being edited)
 */
async function getReceivedTotalsByPoLine(supabase, companyId, poId, excludeGrnId = null) {
    const { data: grns, error: grnErr } = await supabase
        .from("purchases")
        .select("id, status")
        .eq("company_id", companyId)
        .eq("converted_from_id", poId)
        .eq("document_type", "GRN");

    if (grnErr || !grns?.length) return {};

    const finalizedIds = grns
        .filter((g) => FINAL_GRN_STATUSES.includes((g.status || "").toLowerCase()))
        .map((g) => g.id)
        .filter((id) => excludeGrnId == null || id !== excludeGrnId);

    if (finalizedIds.length === 0) return {};

    const { data: lines, error: lineErr } = await supabase
        .from("purchase_items")
        .select("po_line_id, quantity, is_extra")
        .in("purchase_id", finalizedIds);

    if (lineErr || !lines?.length) return {};

    const totals = {};
    for (const row of lines) {
        if (row.is_extra || !row.po_line_id) continue;
        const pid = row.po_line_id;
        const q = Number(row.quantity) || 0;
        totals[pid] = (totals[pid] || 0) + q;
    }
    return totals;
}

/**
 * After a GRN is finalized or reversed, update PO status from receipt totals.
 */
async function syncPurchaseOrderStatusFromGrns(supabase, companyId, poId) {
    const { data: po, error: poErr } = await supabase
        .from("purchases")
        .select("id, status, document_type")
        .eq("id", poId)
        .eq("company_id", companyId)
        .single();

    if (poErr || !po || (po.document_type || "").toUpperCase() !== "PO") return;

    const poStatus = (po.status || "").toLowerCase();
    if (["cancelled", "closed", "completed"].includes(poStatus)) return;

    const { data: poLines } = await supabase
        .from("purchase_items")
        .select("id, quantity")
        .eq("purchase_id", poId);

    if (!poLines?.length) return;

    const receivedByLine = await getReceivedTotalsByPoLine(supabase, companyId, poId, null);

    let allFullyReceived = true;
    let anyReceived = false;

    for (const pl of poLines) {
        const ordered = Number(pl.quantity) || 0;
        const rec = receivedByLine[pl.id] || 0;
        if (rec > 0) anyReceived = true;
        if (rec < ordered) allFullyReceived = false;
    }

    let nextStatus = poStatus;
    if (allFullyReceived && poLines.length > 0) {
        nextStatus = "completed";
    } else if (anyReceived) {
        nextStatus = "partially_received";
    }

    if (nextStatus !== poStatus) {
        await supabase.from("purchases").update({ status: nextStatus }).eq("id", poId).eq("company_id", companyId);
    }
}

/**
 * When a finalized GRN is reversed, recompute PO status (may drop from completed to partially_received).
 */
async function syncPurchaseOrderStatusAfterGrnRemoved(supabase, companyId, poId) {
    const { data: po } = await supabase
        .from("purchases")
        .select("id, status, document_type")
        .eq("id", poId)
        .eq("company_id", companyId)
        .single();

    if (!po || (po.document_type || "").toUpperCase() !== "PO") return;

    const poStatus = (po.status || "").toLowerCase();
    if (["cancelled", "closed"].includes(poStatus)) return;

    const { data: poLines } = await supabase
        .from("purchase_items")
        .select("id, quantity")
        .eq("purchase_id", poId);

    if (!poLines?.length) return;

    const receivedByLine = await getReceivedTotalsByPoLine(supabase, companyId, poId, null);

    let allFullyReceived = true;
    let anyReceived = false;

    for (const pl of poLines) {
        const ordered = Number(pl.quantity) || 0;
        const rec = receivedByLine[pl.id] || 0;
        if (rec > 0) anyReceived = true;
        if (rec < ordered) allFullyReceived = false;
    }

    let nextStatus = "sent";
    if (allFullyReceived && poLines.length > 0) {
        nextStatus = "completed";
    } else if (anyReceived) {
        nextStatus = "partially_received";
    }

    if (nextStatus !== poStatus) {
        await supabase.from("purchases").update({ status: nextStatus }).eq("id", poId).eq("company_id", companyId);
    }
}

module.exports = {
    getReceivedTotalsByPoLine,
    syncPurchaseOrderStatusFromGrns,
    syncPurchaseOrderStatusAfterGrnRemoved,
    FINAL_GRN_STATUSES,
};
