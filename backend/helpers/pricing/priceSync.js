const supabase = require("../../supabaseConfig");

async function handlePriceSync(price) {
    
    if (!price.active) return;
    if (!price.unit_amount) return;

    const amount = price.unit_amount / 100; // cents → €
    const currency = price.currency.toUpperCase();
    const interval = price.recurring?.interval; // month | year | undefined

    if (!interval) return; // one-time prices → ignore

    // Monthly plan
    if (interval === "month") {
        // Regular monthly price
        const { error: error1 } = await supabase
            .from("plans")
            .update({
                cached_price_monthly: amount,
                cached_currency: currency,
                cached_updated_at: new Date().toISOString()
            })
            .eq("stripe_price_id_monthly", price.id);

        if (error1) console.error("Plan monthly sync failed:", error1);

        // Extra store monthly price
        const { error: error2 } = await supabase
            .from("plans")
            .update({
                cached_extra_store_price_monthly: amount,
                cached_currency: currency,
                cached_updated_at: new Date().toISOString()
            })
            .eq("stripe_extra_store_price_id_monthly", price.id);

        if (error2) console.error("Plan extra store monthly sync failed:", error2);
    }

    // Yearly plan
    if (interval === "year") {
        // Regular yearly price
        const { error: error1 } = await supabase
            .from("plans")
            .update({
                cached_price_yearly: amount,
                cached_currency: currency,
                cached_updated_at: new Date().toISOString()
            })
            .eq("stripe_price_id_yearly", price.id);

        if (error1) console.error("Plan yearly sync failed:", error1);

        // Extra store yearly price
        const { error: error2 } = await supabase
            .from("plans")
            .update({
                cached_extra_store_price_yearly: amount,
                cached_currency: currency,
                cached_updated_at: new Date().toISOString()
            })
            .eq("stripe_extra_store_price_id_yearly", price.id);

        if (error2) console.error("Plan extra store yearly sync failed:", error2);
    }

    // Plugins monthly
    if (interval === "month") {
        const { error } = await supabase
            .from("plugins")
            .update({
                cached_price_monthly: amount,
                cached_currency: currency,
                cached_updated_at: new Date().toISOString()
            })
            .eq("stripe_price_id_monthly", price.id);

        if (error) console.error("Plugin monthly sync failed:", error);
    }

    // Plugins yearly
    if (interval === "year") {
        const { error } = await supabase
            .from("plugins")
            .update({
                cached_price_yearly: amount,
                cached_currency: currency,
                cached_updated_at: new Date().toISOString()
            })
            .eq("stripe_price_id_yearly", price.id);

        if (error) console.error("Plugin yearly sync failed:", error);
    }
}

module.exports = { handlePriceSync }