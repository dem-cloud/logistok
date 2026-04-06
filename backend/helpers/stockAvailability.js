/**
 * Stock availability helper for sales and purchase edits.
 * Checks if reducing stock would go negative and either blocks, warns, or allows based on
 * company allow_negative_stock setting and user permission inventory.sell_below_stock.
 */
const supabase = require("../supabaseConfig");

/**
 * Check stock availability for a list of items that would reduce stock.
 * @param {string} companyId - Company ID
 * @param {Array<{ store_id: string; product_variant_id: number; product_id: number; quantity: number }>} items - Items to check (quantity = amount to reduce)
 * @param {{ userPermissions?: string[] }} options - userPermissions from req.user.permissions
 * @returns {Promise<{ ok: boolean; block?: boolean; warning?: boolean; insufficientItems: Array<{ product_variant_id: number; product_name: string; variant_name: string; required: number; available: number }>; message?: string }>}
 */
async function checkStockAvailability(companyId, items, options = {}) {
    const userPermissions = options.userPermissions || [];
    const canBypassNegative = userPermissions.includes("inventory.sell_below_stock");

    const insufficientItems = [];

    // Fetch company allow_negative_stock
    const { data: company, error: companyErr } = await supabase
        .from("companies")
        .select("allow_negative_stock")
        .eq("id", companyId)
        .single();

    if (companyErr || !company) {
        return {
            ok: false,
            block: true,
            insufficientItems: [],
            message: "Δεν βρέθηκε εταιρεία",
        };
    }

    const allowNegativeStock = company.allow_negative_stock === true;

    // Filter items that would reduce stock (quantity > 0)
    const reduceItems = items.filter((it) => it.quantity > 0);
    if (reduceItems.length === 0) {
        return { ok: true, insufficientItems: [] };
    }

    // Fetch product/variant names for error messages
    const variantIds = [...new Set(reduceItems.map((it) => it.product_variant_id))];
    const { data: variants } = await supabase
        .from("product_variants")
        .select("id, name, product_id")
        .in("id", variantIds);

    const productIds = [...new Set((variants || []).map((v) => v.product_id))];
    const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);

    const productMap = Object.fromEntries((products || []).map((p) => [p.id, p.name]));
    const variantMap = {};
    if (variants) {
        for (const v of variants) {
            variantMap[v.id] = {
                name: v.name,
                productName: productMap[v.product_id] || "—",
            };
        }
    }

    // Check each item (available = stock_quantity - reserved_quantity)
    for (const it of reduceItems) {
        const { data: sp } = await supabase
            .from("store_products")
            .select("id, stock_quantity, reserved_quantity")
            .eq("store_id", it.store_id)
            .eq("product_variant_id", it.product_variant_id)
            .maybeSingle();

        const stockQty = sp ? Number(sp.stock_quantity) : 0;
        const reservedQty = sp && sp.reserved_quantity != null ? Number(sp.reserved_quantity) : 0;
        const currentStock = Math.max(0, stockQty - reservedQty);
        const qtyToReduce = Number(it.quantity);
        const afterStock = currentStock - qtyToReduce;

        if (afterStock < 0) {
            const info = variantMap[it.product_variant_id] || {};
            insufficientItems.push({
                product_variant_id: it.product_variant_id,
                product_name: info.productName || "—",
                variant_name: info.name || "—",
                required: qtyToReduce,
                available: Math.max(0, currentStock),
            });
        }
    }

    if (insufficientItems.length === 0) {
        return { ok: true, insufficientItems: [] };
    }

    // Some items would go negative
    if (!allowNegativeStock) {
        return {
            ok: false,
            block: true,
            insufficientItems,
            message: "Ανεπαρκές απόθεμα για τα παρακάτω προϊόντα",
        };
    }

    // allow_negative_stock = true
    if (canBypassNegative) {
        return {
            ok: true,
            warning: true,
            insufficientItems,
            message: "Τα ακόλουθα προϊόντα θα έχουν αρνητικό απόθεμα. Θέλετε να συνεχίσετε;",
        };
    }

    return {
        ok: false,
        block: true,
        insufficientItems,
        message: "Δεν έχετε δικαίωμα πώλησης κάτω από διαθέσιμο απόθεμα",
    };
}

module.exports = { checkStockAvailability };
