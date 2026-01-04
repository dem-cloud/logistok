export function calculateTotal({
    plan,
    billingPeriod,
    extraStores = 0,
    plugins = [],
    vatPercent = 24,
}) {

    let subtotal = 0;

    // base plan
    subtotal += billingPeriod === "monthly"
                    ? plan.price_monthly
                    : plan.price_yearly;

    // extra stores
    if (extraStores > 0) {
        const extraStorePrice = billingPeriod === "monthly"
                                    ? plan.extra_store_price_monthly
                                    : plan.extra_store_price_yearly;

        subtotal += extraStorePrice * extraStores;
    }

    // plugins
    for (const plugin of plugins) {
        subtotal += billingPeriod === "monthly"
                        ? plugin.price_monthly
                        : plugin.price_yearly;
    }

    const vatAmount = Number(((subtotal * vatPercent) / 100).toFixed(2));
    const total = Number((subtotal + vatAmount).toFixed(2));

    return {
        subtotal: Number(subtotal.toFixed(2)),
        vatPercent,
        vatAmount,
        total,
    }
}
