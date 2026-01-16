// subscriptionCleanup.js
// Helper functions for handling incomplete subscription cleanup and data change detection

const Stripe = require("stripe");
const supabase = require("../../supabaseConfig");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Checks if onboarding data has changed compared to existing subscription
 * @param {Object} existingSub - Existing subscription from DB
 * @param {string} companyId - Company UUID
 * @param {Object} onboardingData - New onboarding data
 * @returns {Promise<boolean>} - True if data changed, false otherwise
 */
const hasDataChanged = async (existingSub, companyId, onboardingData) => {
    if (!existingSub) {
        return false;
    }

    try {
        // 1. Check if plan changed
        if (existingSub.plan_id !== onboardingData.plan.id) {
            console.log("✗ Plan changed");
            return true;
        }

        // 2. Check if billing period changed
        if (existingSub.billing_period !== onboardingData.plan.billing) {
            console.log("✗ Billing period changed");
            return true;
        }

        // 3. Check if plugins changed
        const { data: existingPlugins, error: pluginsErr } = await supabase
            .from('company_plugins')
            .select('plugin_key')
            .eq('company_id', companyId);

        if (pluginsErr) {
            console.error("Error fetching existing plugins:", pluginsErr);
            // In case of error, assume data changed (safer approach)
            return true;
        }

        const existingPluginKeys = (existingPlugins || [])
            .map(p => p.plugin_key)
            .sort();
        
        const newPluginKeys = (onboardingData.plugins || [])
            .slice()
            .sort();

        if (JSON.stringify(existingPluginKeys) !== JSON.stringify(newPluginKeys)) {
            console.log("✗ Plugins changed");
            console.log("  Existing:", existingPluginKeys);
            console.log("  New:", newPluginKeys);
            return true;
        }

        // 4. Check if branches changed (count non-main stores)
        const { data: existingStores, error: storesErr } = await supabase
            .from('stores')
            .select('id')
            .eq('company_id', companyId)
            .eq('is_main', false);

        if (storesErr) {
            console.error("Error fetching existing stores:", storesErr);
            // In case of error, assume data changed (safer approach)
            return true;
        }

        const existingBranchCount = (existingStores || []).length;
        const newBranchCount = onboardingData.branches || 0;

        if (existingBranchCount !== newBranchCount) {
            console.log(`✗ Branches changed: ${existingBranchCount} → ${newBranchCount}`);
            return true;
        }

        console.log("✓ No data changes detected");
        return false;

    } catch (err) {
        console.error("Error checking data changes:", err);
        // In case of error, assume data changed (safer approach)
        return true;
    }
};

/**
 * Cleans up all data related to an incomplete subscription
 * @param {Object} existingSub - Existing subscription object with id and stripe_subscription_id
 * @param {string} companyId - Company UUID
 * @returns {Promise<Object>} - { success: boolean, error?: Error }
 */
const cleanupIncompleteSubscription = async (existingSub, companyId) => {
    try {
        console.log("🧹 Starting cleanup for incomplete subscription...");

        // 1. Cancel Stripe subscription
        try {
            await stripe.subscriptions.cancel(existingSub.stripe_subscription_id);
            console.log("✓ Stripe subscription canceled");
        } catch (stripeErr) {
            console.error("❌ Failed to cancel Stripe subscription:", stripeErr);
            // Continue with cleanup even if Stripe cancel fails
        }

        // 2. Delete store_plugins (must be first, has FK to company_plugins)
        const { data: companyPlugins, error: fetchPluginsErr } = await supabase
            .from('company_plugins')
            .select('id')
            .eq('company_id', companyId);

        if (fetchPluginsErr) {
            console.error("❌ Error fetching company_plugins:", fetchPluginsErr);
            throw fetchPluginsErr;
        }

        if (companyPlugins?.length > 0) {
            const pluginIds = companyPlugins.map(p => p.id);
            
            const { error: storePluginsErr } = await supabase
                .from('store_plugins')
                .delete()
                .in('company_plugin_id', pluginIds);

            if (storePluginsErr) {
                console.error("❌ Error deleting store_plugins:", storePluginsErr);
                throw storePluginsErr;
            }
            console.log(`✓ Deleted store_plugins (${pluginIds.length} plugins)`);
        }

        // 3. Delete company_plugins
        const { error: companyPluginsErr } = await supabase
            .from('company_plugins')
            .delete()
            .eq('company_id', companyId);

        if (companyPluginsErr) {
            console.error("❌ Error deleting company_plugins:", companyPluginsErr);
            throw companyPluginsErr;
        }
        console.log("✓ Deleted company_plugins");

        // 4. Delete stores
        const { error: storesErr } = await supabase
            .from('stores')
            .delete()
            .eq('company_id', companyId);

        if (storesErr) {
            console.error("❌ Error deleting stores:", storesErr);
            throw storesErr;
        }
        console.log("✓ Deleted stores");

        // 5. Delete subscription_items (before payment_history, just to be safe)
        const { error: itemsErr } = await supabase
            .from('subscription_items')
            .delete()
            .eq('subscription_id', existingSub.id);

        if (itemsErr) {
            console.error("❌ Error deleting subscription_items:", itemsErr);
            throw itemsErr;
        }
        console.log("✓ Deleted subscription_items");

        // 6. Delete payment_history
        const { error: historyErr } = await supabase
            .from('payment_history')
            .delete()
            .eq('subscription_id', existingSub.id);

        if (historyErr) {
            console.error("❌ Error deleting payment_history:", historyErr);
            throw historyErr;
        }
        console.log("✓ Deleted payment_history");

        // 7. Delete subscription (last)
        const { error: subErr } = await supabase
            .from('subscriptions')
            .delete()
            .eq('id', existingSub.id);

        if (subErr) {
            console.error("❌ Error deleting subscription:", subErr);
            throw subErr;
        }
        console.log("✓ Deleted subscription");

        console.log("✅ Cleanup completed successfully");
        return { success: true };

    } catch (err) {
        console.error("❌ Cleanup error:", err);
        return { 
            success: false, 
            error: err 
        };
    }
};

module.exports = {
    hasDataChanged,
    cleanupIncompleteSubscription
};