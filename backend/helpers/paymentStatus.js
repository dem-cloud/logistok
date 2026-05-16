/**
 * Recomputes payment_status and amount_due for a sale based on receipts
 */
async function recomputeSalePaymentStatus(supabase, companyId, saleId) {
    const { data: sale } = await supabase
        .from("sales")
        .select("total_amount")
        .eq("id", saleId)
        .eq("company_id", companyId)
        .single();
    const { data: receipts } = await supabase
        .from("receipts")
        .select("amount")
        .eq("sale_id", saleId)
        .eq("status", "posted");
    const sum = receipts?.reduce((s, r) => s + Number(r.amount), 0) ?? 0;
    const total = Number(sale?.total_amount ?? 0);
    const payment_status = total <= 0 ? "paid" : sum >= total ? "paid" : sum > 0 ? "partial" : "unpaid";
    const amount_due = payment_status === "paid" ? 0 : total - sum;
    await supabase
        .from("sales")
        .update({ payment_status, amount_due })
        .eq("id", saleId)
        .eq("company_id", companyId);
}

/**
 * Recomputes payment_status, credit_status and amount_due for a purchase.
 *
 * Three orthogonal dimensions, always recomputed dynamically from the DB:
 *
 *   * amount_due = max(0, total − paid − credits)
 *     The remaining balance is **always** derived live from the union of:
 *       - posted real payments, and
 *       - the sum of non-reversed CN totals.
 *     Reversed CNs drop out automatically, so reversing a CN immediately
 *     restores the balance to its pre-credit value.
 *
 *   * payment_status ← cash only
 *       total <= 0 | paid >= total → "paid"
 *       paid > 0                   → "partial"
 *       otherwise                  → "unpaid"
 *     This dimension intentionally ignores credits: a CN is not a cash
 *     payment, it is a claim on the vendor.
 *
 *   * credit_status ← credits vs. the **cash** still owed on the invoice
 *       cash_remaining = max(0, total − paid)   (what was left before credits)
 *       credits > 0 AND cash_remaining > 0 AND credits >= cash_remaining
 *           → "credited"   (credits wiped the unpaid cash remainder)
 *       credits > 0 AND cash_remaining > 0 AND credits < cash_remaining
 *           → "partially_credited"
 *       credits > 0 AND cash_remaining <= 0   (invoice already fully paid in cash)
 *           → "partially_credited"
 *           Never "credited" here: a CN on a paid invoice is a refund/return
 *           claim, not “full monetary credit” of an open balance — otherwise
 *           any partial return would wrongly show as fully credited because
 *           paid + credits >= total is always true once paid >= total.
 *       credits <= 0 AND no line-level full return → null
 *       PUR: if every posted CN line returns the full purchased quantity, treat
 *       as fully credited even when Σ CN totals round slightly below PUR total.
 *
 * CN closure (purchases / document_type CN):
 *   CNs move to "closed" only when posted receipts fully cover that CN’s face
 *   amount (see shared.js PATCH /company/receipts). This helper must not bulk-
 *   close CNs when the source PUR becomes credit_status "credited" while still
 *   unpaid: multiple CNs against one PUR would all flip to closed and block
 *   POST /company/receipts (which only accepts completed/posted).
 *
 *   After each recompute, any "closed" CN on this PUR that is not yet fully
 *   covered by posted receipts is reset to "completed" (self-heal for legacy
 *   cascade-closed rows; legitimately receipt-closed CNs stay closed).
 *
 * Multiple partial CNs can sum to slightly less than PUR total_amount because
 * of per-line VAT rounding even when every purchased quantity was credited.
 * purchaseFullyCreditedByPostedCnLines + cent comparison fixes that.
 */
async function purchaseFullyCreditedByPostedCnLines(supabase, companyId, purchaseId) {
    const { data: srcItems } = await supabase
        .from("purchase_items")
        .select("product_id, product_variant_id, quantity")
        .eq("purchase_id", purchaseId);
    const keyOf = (pid, vid) => `${pid}:${vid}`;
    const srcByKey = new Map();
    for (const s of srcItems || []) {
        const k = keyOf(s.product_id, s.product_variant_id);
        srcByKey.set(k, (srcByKey.get(k) || 0) + Number(s.quantity || 0));
    }
    if (srcByKey.size === 0) return false;

    const { data: cnRows } = await supabase
        .from("purchases")
        .select("id, status")
        .eq("company_id", companyId)
        .eq("converted_from_id", purchaseId)
        .eq("document_type", "CN");
    const activeCnIds = (cnRows || [])
        .filter((d) => {
            const s = String(d.status || "").toLowerCase();
            return s === "completed" || s === "posted" || s === "closed";
        })
        .map((d) => d.id);
    if (activeCnIds.length === 0) return false;

    const { data: cnLines } = await supabase
        .from("purchase_items")
        .select("product_id, product_variant_id, quantity")
        .in("purchase_id", activeCnIds);

    const returnedByKey = new Map();
    for (const l of cnLines || []) {
        const k = keyOf(l.product_id, l.product_variant_id);
        returnedByKey.set(k, (returnedByKey.get(k) || 0) + Math.abs(Number(l.quantity || 0)));
    }
    for (const [k, purchased] of srcByKey.entries()) {
        if ((returnedByKey.get(k) || 0) + 1e-9 < purchased) return false;
    }
    return true;
}

async function recomputePurchasePaymentStatus(supabase, companyId, purchaseId) {
    const { data: purchase } = await supabase
        .from("purchases")
        .select("id, total_amount, document_type")
        .eq("id", purchaseId)
        .eq("company_id", companyId)
        .single();
    if (!purchase) return;

    const { data: payments } = await supabase
        .from("payments")
        .select("amount")
        .eq("purchase_id", purchaseId)
        .eq("status", "posted");

    const paid = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    // "Active" CNs = anything not Reversed and not still Draft. Reversed drops
    // out so reversing a CN immediately restores the balance; drafts are
    // ignored because they represent unfinalized intent.
    const { data: cnRows } = await supabase
        .from("purchases")
        .select("id, total_amount, status")
        .eq("company_id", companyId)
        .eq("converted_from_id", purchaseId)
        .eq("document_type", "CN");
    const credits = (cnRows || [])
        .filter((d) => {
            const s = String(d.status || "").toLowerCase();
            return s === "completed" || s === "posted" || s === "closed";
        })
        .reduce((s, d) => s + Math.abs(Number(d.total_amount || 0)), 0);

    const total = Number(purchase.total_amount ?? 0);
    const EPS = 1e-6;

    let payment_status;
    if (total <= 0 || paid + EPS >= total) {
        payment_status = "paid";
    } else if (paid > EPS) {
        payment_status = "partial";
    } else {
        payment_status = "unpaid";
    }

    const cashRemaining = Math.max(0, total - paid);
    const creditsCents = Math.round(credits * 100);
    const cashRemainingCents = Math.round(cashRemaining * 100);
    const lineFullyCredited =
        (String(purchase.document_type || "").toUpperCase() === "PUR") &&
        (await purchaseFullyCreditedByPostedCnLines(supabase, companyId, purchaseId));

    // "credited" only when credits cover the **unpaid cash remainder** — not
    // when the invoice was already paid and the CN is a partial/full return.
    // Compare in cents to avoid float noise; OR trust line-level full return on PUR.
    let credit_status = null;
    if (credits > EPS || lineFullyCredited) {
        if (cashRemaining <= EPS) {
            credit_status = "partially_credited";
        } else if (lineFullyCredited || creditsCents >= cashRemainingCents) {
            credit_status = "credited";
        } else {
            credit_status = "partially_credited";
        }
    }

    // Remaining balance: the user-facing formula, always live.
    //   amount_due = max(0, total - paid - credits)
    // Floored at 0: an over-credited invoice (credits > total - paid) settles
    // the balance; the excess is collected separately via Είσπραξη, so we
    // don't surface it as a negative "amount_due".
    // When every line is returned but CN totals round short of the PUR, snap to 0.
    let amount_due = total <= 0
        ? 0
        : Math.max(0, Math.round((total - paid - credits) * 100) / 100);
    if (lineFullyCredited && payment_status !== "paid" && credit_status === "credited") {
        amount_due = 0;
    }

    await supabase
        .from("purchases")
        .update({ payment_status, credit_status, amount_due })
        .eq("id", purchaseId)
        .eq("company_id", companyId);

    const { data: closedCns } = await supabase
        .from("purchases")
        .select("id, total_amount")
        .eq("company_id", companyId)
        .eq("converted_from_id", purchaseId)
        .eq("document_type", "CN")
        .eq("status", "closed");

    const reopenEps = 1e-6;
    for (const cn of closedCns || []) {
        const cnAbs = Math.abs(Number(cn.total_amount || 0));
        const { data: postedRecs } = await supabase
            .from("receipts")
            .select("amount")
            .eq("purchase_id", cn.id)
            .eq("company_id", companyId)
            .eq("status", "posted");
        const postedSum = (postedRecs || []).reduce(
            (s, r) => s + Math.abs(Number(r.amount || 0)),
            0
        );
        // Mirror PATCH /company/receipts: closed only when posted sum covers CN.
        if (cnAbs <= 0 || postedSum + reopenEps < cnAbs) {
            await supabase
                .from("purchases")
                .update({ status: "completed" })
                .eq("id", cn.id)
                .eq("company_id", companyId)
                .eq("status", "closed");
        }
    }
}

module.exports = {
    recomputeSalePaymentStatus,
    recomputePurchasePaymentStatus
};
