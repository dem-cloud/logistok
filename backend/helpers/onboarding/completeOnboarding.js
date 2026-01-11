const supabase = require("../../supabaseConfig");

async function completeOnboardingProcess(companyId, onboardingData, planDetails, customSubscriptionPayload) {

    const sanitizedData = onboardingData.data;
    const canUsePaidPlugins = planDetails.allows_paid_plugins;

    // =============================================
    // CLEAN UP EXISTING DATA
    // =============================================

    const { error: deleteError } = await supabase
        .from('company_industries')
        .delete()
        .eq('company_id', companyId);

    if (deleteError) {
        throw {
            status: 500,
            code: "DB_ERROR",
            message: "Σφάλμα κατά την εκκαθάριση company industries"
        };
    }

    const { error: deletePluginsErr } = await supabase
        .from('company_plugins')
        .delete()
        .eq('company_id', companyId);

    if (deletePluginsErr) {
        throw {
            status: 500,
            code: "DB_ERROR",
            message: "Σφάλμα κατά την εκκαθάριση plugins"
        };
    }

    // =============================================
    // UPDATE COMPANY INFO
    // =============================================

    const { error: companyUpdateErr } = await supabase
        .from('companies')
        .update({
            name: sanitizedData.company.name,
            phone: sanitizedData.company.phone,
        })
        .eq('id', companyId);

    if (companyUpdateErr) {
        throw {
            status: 500,
            code: "DB_ERROR",
            message: "Σφάλμα κατά την ενημέρωση της εταιρείας"
        };
    }

    // =============================================
    // INSERT INDUSTRIES
    // =============================================

    if (sanitizedData.industries.length > 0) {
        const { data: validIndustries, error: validIndustriesError } = await supabase
            .from('industries')
            .select('key')
            .in('key', sanitizedData.industries);

        if (validIndustriesError) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά την ανάγνωση κλάδων"
            };
        }

        if (validIndustries.length > 0) {
            const rows = validIndustries.map(i => ({
                company_id: companyId,
                industry_key: i.key
            }));

            const { error: insertError } = await supabase
                .from('company_industries')
                .insert(rows);

            if (insertError) {
                throw {
                    status: 500,
                    code: "DB_ERROR",
                    message: "Σφάλμα κατά την ενημέρωση company industries"
                };
            }
        }
    }

    // =============================================
    // INSERT PLUGINS
    // =============================================

    if (sanitizedData.plugins.length > 0) {
        const { data: availablePlugins, error: pluginsSelectErr } = await supabase
            .from('plugins')
            .select('key, is_active, cached_price_monthly, cached_price_yearly')
            .in('key', sanitizedData.plugins)
            .eq('is_active', true);

        if (pluginsSelectErr) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά την ανάγνωση plugins"
            };
        }

        // Filter based on plan
        const allowedPlugins = availablePlugins.filter(plugin => {
            if (!canUsePaidPlugins) {
                return plugin.cached_price_monthly === null && plugin.cached_price_yearly === null;
            }
            return true;
        });

        if (allowedPlugins.length > 0) {
            const pluginRows = allowedPlugins.map(plugin => ({
                company_id: companyId,
                plugin_key: plugin.key,
                status: 'active',
                activated_at: new Date().toISOString(),
                subscription_item_id: null,
                settings: null
            }));

            const { error: insertPluginsErr } = await supabase
                .from('company_plugins')
                .insert(pluginRows);

            if (insertPluginsErr) {
                throw {
                    status: 500,
                    code: "DB_ERROR",
                    message: "Σφάλμα κατά την αποθήκευση plugins"
                };
            }
        }
    }

    // =============================================
    // CREATE STORES
    // =============================================

    const storesToCreate = [];

    // Always create main store
    storesToCreate.push({
        company_id: companyId,
        name: 'Κεντρική Αποθήκη',
        is_main: true,
        created_at: new Date().toISOString()
    });

    // Create additional branches for paid plans
    if (!planDetails.is_free) {
        const totalBranches = (sanitizedData.branches || 0) + planDetails.included_branches;
        
        for (let i = 1; i <= totalBranches; i++) {
            storesToCreate.push({
                company_id: companyId,
                name: `Υποκατάστημα ${i}`,
                is_main: false,
                created_at: new Date().toISOString()
            });
        }
    }

    const { data: createdStores, error: storesErr } = await supabase
        .from('stores')
        .insert(storesToCreate)
        .select('id');

    if (storesErr) {
        throw {
            status: 500,
            code: "DB_ERROR",
            message: "Σφάλμα κατά τη δημιουργία καταστημάτων"
        };
    }

    // =============================================
    // LINK PLUGINS TO STORES
    // =============================================

    if (sanitizedData.plugins.length > 0 && createdStores.length > 0) {
        // Fetch company_plugins που μόλις δημιουργήθηκαν
        const { data: companyPlugins, error: fetchPluginsErr } = await supabase
            .from('company_plugins')
            .select('id, plugin_key')
            .eq('company_id', companyId)
            .in('plugin_key', sanitizedData.plugins);

        if (fetchPluginsErr) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά την ανάγνωση company plugins"
            };
        }

        // Δημιουργία store_plugins: κάθε plugin σε όλα τα stores
        const storePluginsToInsert = [];
        
        for (const store of createdStores) {
            for (const companyPlugin of companyPlugins) {
                storePluginsToInsert.push({
                    company_plugin_id: companyPlugin.id,
                    store_id: store.id,
                    settings: null,
                    is_active: false,
                    created_at: new Date().toISOString()
                });
            }
        }

        if (storePluginsToInsert.length > 0) {
            const { error: storePluginsErr } = await supabase
                .from('store_plugins')
                .insert(storePluginsToInsert);

            if (storePluginsErr) {
                throw {
                    status: 500,
                    code: "DB_ERROR",
                    message: "Σφάλμα κατά τη σύνδεση plugins με stores"
                };
            }

            console.log(`Created ${storePluginsToInsert.length} store_plugin records`);
        }
    }

    // =============================================
    // CREATE SUBSCRIPTION (with custom payload)
    // =============================================

    const { error: subscriptionErr } = await supabase
        .from('subscriptions')
        .insert(customSubscriptionPayload);

    if (subscriptionErr) {
        throw {
            status: 500,
            code: "DB_ERROR",
            message: "Σφάλμα κατά τη δημιουργία συνδρομής"
        };
    }

    // =============================================
    // MARK ONBOARDING AS COMPLETED
    // =============================================

    const { data: onboardingUpdate, error: onboardingUpdateErr } = await supabase
        .from('onboarding')
        .update({
            data: sanitizedData,
            is_completed: true,
            updated_at: new Date().toISOString()
        })
        .eq('company_id', companyId)
        .select("is_completed")
        .single();

    if (onboardingUpdateErr) {
        throw {
            status: 500,
            code: "DB_ERROR",
            message: "Σφάλμα κατά την ολοκλήρωση onboarding"
        };
    }

    return {
        is_completed: onboardingUpdate.is_completed
    };
}

module.exports = { completeOnboardingProcess }