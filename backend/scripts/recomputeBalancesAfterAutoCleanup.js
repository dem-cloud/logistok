/**
 * Re-run balance helpers after deleting legacy is_auto payments/receipts.
 *
 * Usage (from repo root or backend folder):
 *   cd backend && node scripts/recomputeBalancesAfterAutoCleanup.js
 *
 * Requires backend/.env with SUPA_PROJECT_URL and SUPA_SERVICE_ROLE_KEY (same as app).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const supabase = require("../supabaseConfig");
const {
    recomputePurchasePaymentStatus,
    recomputeSalePaymentStatus,
} = require("../helpers/paymentStatus");

async function main() {
    const { data: purs, error: purErr } = await supabase
        .from("purchases")
        .select("id, company_id")
        .eq("document_type", "PUR");
    if (purErr) throw purErr;
    let purOk = 0;
    for (const row of purs || []) {
        await recomputePurchasePaymentStatus(supabase, row.company_id, row.id);
        purOk += 1;
        if (purOk % 100 === 0) console.log("PUR recompute:", purOk);
    }
    console.log("Done PUR:", purOk);

    const { data: sales, error: saleErr } = await supabase
        .from("sales")
        .select("id, company_id")
        .in("invoice_type", ["REC", "INV"])
        .neq("status", "cancelled");
    if (saleErr) throw saleErr;
    let saleOk = 0;
    for (const row of sales || []) {
        await recomputeSalePaymentStatus(supabase, row.company_id, row.id);
        saleOk += 1;
        if (saleOk % 100 === 0) console.log("Sale recompute:", saleOk);
    }
    console.log("Done sales (REC/INV, non-cancelled):", saleOk);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
