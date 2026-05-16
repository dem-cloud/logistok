/**
 * Remaining quantity that can still be put on new credit notes against a PUR/GRN,
 * per source `purchase_items.id`. CN lines are matched by (product_id, variant_id);
 * returns from multiple CNs are pooled and allocated to PUR lines in ascending line id
 * (FIFO) when several lines share the same SKU.
 */

function keyOf(productId, variantId) {
    return `${Number(productId)}:${Number(variantId)}`;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} companyId
 * @param {number} sourcePurchaseId  PUR or GRN id
 * @returns {Promise<Map<number, number>>} purchase_item id → remaining qty
 */
async function getRemainingCreditQtyByPurchaseItemIdMap(supabase, companyId, sourcePurchaseId) {
    const out = new Map();

    const { data: purItems } = await supabase
        .from("purchase_items")
        .select("id, product_id, product_variant_id, quantity")
        .eq("purchase_id", sourcePurchaseId)
        .order("id", { ascending: true });

    const { data: cnPurchases } = await supabase
        .from("purchases")
        .select("id, status")
        .eq("company_id", companyId)
        .eq("converted_from_id", sourcePurchaseId)
        .eq("document_type", "CN");

    const cnIds = (cnPurchases || [])
        .filter((r) => String(r.status || "").toLowerCase() !== "reversed")
        .map((r) => r.id);

    const pool = new Map();
    if (cnIds.length > 0) {
        const { data: cnLines } = await supabase
            .from("purchase_items")
            .select("product_id, product_variant_id, quantity")
            .in("purchase_id", cnIds);
        for (const l of cnLines || []) {
            const k = keyOf(l.product_id, l.product_variant_id);
            pool.set(k, (pool.get(k) || 0) + Math.abs(Number(l.quantity || 0)));
        }
    }

    for (const line of purItems || []) {
        const k = keyOf(line.product_id, line.product_variant_id);
        const q = Number(line.quantity || 0);
        const pooled = pool.get(k) || 0;
        const consumed = Math.min(q, pooled);
        pool.set(k, pooled - consumed);
        out.set(line.id, Math.max(0, q - consumed));
    }
    return out;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} companyId
 * @param {number[]} sourcePurchaseIds
 * @returns {Promise<Map<number, Map<number, number>>>} purchaseId → (lineId → remaining)
 */
async function getRemainingCreditQtyByPurchaseItemIdMapsForMany(supabase, companyId, sourcePurchaseIds) {
    const byPur = new Map(sourcePurchaseIds.map((id) => [id, new Map()]));
    if (sourcePurchaseIds.length === 0) return byPur;

    const { data: allPurItems } = await supabase
        .from("purchase_items")
        .select("id, purchase_id, product_id, product_variant_id, quantity")
        .in("purchase_id", sourcePurchaseIds)
        .order("id", { ascending: true });

    const { data: cnPurchases } = await supabase
        .from("purchases")
        .select("id, converted_from_id, status")
        .eq("company_id", companyId)
        .eq("document_type", "CN")
        .in("converted_from_id", sourcePurchaseIds);

    const cnByPur = new Map();
    for (const r of cnPurchases || []) {
        if (String(r.status || "").toLowerCase() === "reversed") continue;
        const pid = r.converted_from_id;
        if (!cnByPur.has(pid)) cnByPur.set(pid, []);
        cnByPur.get(pid).push(r.id);
    }

    const cnIds = (cnPurchases || [])
        .filter((r) => String(r.status || "").toLowerCase() !== "reversed")
        .map((r) => r.id);

    const linesByCnId = new Map();
    if (cnIds.length > 0) {
        const { data: allCnLines } = await supabase
            .from("purchase_items")
            .select("purchase_id, product_id, product_variant_id, quantity")
            .in("purchase_id", cnIds);
        for (const l of allCnLines || []) {
            if (!linesByCnId.has(l.purchase_id)) linesByCnId.set(l.purchase_id, []);
            linesByCnId.get(l.purchase_id).push(l);
        }
    }

    for (const purId of sourcePurchaseIds) {
        const pool = new Map();
        for (const cnid of cnByPur.get(purId) || []) {
            for (const l of linesByCnId.get(cnid) || []) {
                const k = keyOf(l.product_id, l.product_variant_id);
                pool.set(k, (pool.get(k) || 0) + Math.abs(Number(l.quantity || 0)));
            }
        }
        const purLines = (allPurItems || []).filter((it) => it.purchase_id === purId).sort((a, b) => a.id - b.id);
        const inner = byPur.get(purId);
        for (const line of purLines) {
            const k = keyOf(line.product_id, line.product_variant_id);
            const q = Number(line.quantity || 0);
            const pooled = pool.get(k) || 0;
            const consumed = Math.min(q, pooled);
            pool.set(k, pooled - consumed);
            inner.set(line.id, Math.max(0, q - consumed));
        }
    }
    return byPur;
}

module.exports = {
    getRemainingCreditQtyByPurchaseItemIdMap,
    getRemainingCreditQtyByPurchaseItemIdMapsForMany,
};
