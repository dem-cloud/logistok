/**
 * Stock reservation for Sales Orders.
 * Reserve on SO finalize, release on DNO or SO cancel.
 */
const supabase = require("../supabaseConfig");

/**
 * Reserve stock for a Sales Order. Called when SO is finalized (status -> open).
 * @param {string} storeId - Store UUID
 * @param {Array<{ product_id: number; product_variant_id: number; quantity: number }>} items - Line items
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
async function reserveStockForSO(storeId, items) {
    if (!items || items.length === 0) return { ok: true };

    for (const it of items) {
        const qty = Number(it.quantity) || 0;
        if (qty <= 0) continue;

        const { data: sp } = await supabase
            .from("store_products")
            .select("id, stock_quantity, reserved_quantity")
            .eq("store_id", storeId)
            .eq("product_variant_id", it.product_variant_id)
            .maybeSingle();

        if (sp) {
            const reserved = (sp.reserved_quantity || 0) + qty;
            const { error } = await supabase
                .from("store_products")
                .update({ reserved_quantity: reserved })
                .eq("id", sp.id);
            if (error) return { ok: false, error: error.message };
        } else {
            const { error } = await supabase.from("store_products").insert({
                store_id: storeId,
                product_id: it.product_id,
                product_variant_id: it.product_variant_id,
                stock_quantity: 0,
                reserved_quantity: qty,
            });
            if (error) return { ok: false, error: error.message };
        }
    }
    return { ok: true };
}

/**
 * Release reserved stock. Called when SO is cancelled or when DNO is finalized (partial release).
 * @param {string} storeId - Store UUID
 * @param {Array<{ product_variant_id: number; quantity: number }>} items - Quantities to release
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
async function releaseReservedStock(storeId, items) {
    if (!items || items.length === 0) return { ok: true };

    for (const it of items) {
        const qty = Number(it.quantity) || 0;
        if (qty <= 0) continue;

        const { data: sp } = await supabase
            .from("store_products")
            .select("id, reserved_quantity")
            .eq("store_id", storeId)
            .eq("product_variant_id", it.product_variant_id)
            .maybeSingle();

        if (sp) {
            const current = sp.reserved_quantity || 0;
            const newReserved = Math.max(0, current - qty);
            const { error } = await supabase
                .from("store_products")
                .update({ reserved_quantity: newReserved })
                .eq("id", sp.id);
            if (error) return { ok: false, error: error.message };
        }
    }
    return { ok: true };
}

module.exports = {
    reserveStockForSO,
    releaseReservedStock,
};
