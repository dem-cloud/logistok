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
 * Recomputes payment_status and amount_due for a purchase based on payments
 */
async function recomputePurchasePaymentStatus(supabase, companyId, purchaseId) {
    const { data: purchase } = await supabase
        .from("purchases")
        .select("total_amount")
        .eq("id", purchaseId)
        .eq("company_id", companyId)
        .single();
    const { data: payments } = await supabase
        .from("payments")
        .select("amount")
        .eq("purchase_id", purchaseId)
        .eq("status", "posted");
    const sum = payments?.reduce((s, p) => s + Number(p.amount), 0) ?? 0;
    const total = Number(purchase?.total_amount ?? 0);
    const payment_status = total <= 0 ? "paid" : sum >= total ? "paid" : sum > 0 ? "partial" : "unpaid";
    const amount_due = payment_status === "paid" ? 0 : total - sum;
    await supabase
        .from("purchases")
        .update({ payment_status, amount_due })
        .eq("id", purchaseId)
        .eq("company_id", companyId);
}

module.exports = {
    recomputeSalePaymentStatus,
    recomputePurchasePaymentStatus
};
