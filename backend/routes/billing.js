const express = require('express');
const { requireAuth, requireOwner } = require('../middlewares/authRequired');
const Stripe = require('stripe');
const supabase = require('../supabaseConfig');
const { TOTAL_STEPS } = require('../helpers/onboarding/onboardingSteps');
const { generateSubscriptionCode } = require('../helpers/generateSubscriptionCode');
const { validateCompleteOnboardingData } = require('../helpers/onboarding/onboardingValidation');
const { hasDataChanged, cleanupIncompleteSubscription } = require('../helpers/onboarding/subscriptionCleanup');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();


router.post("/price-preview", requireAuth, requireOwner, async (req, res) => {
    const {
        planId,
        billingPeriod,
        totalBranches = 0,
        plugins = []
    } = req.body;

    if (!planId || !billingPeriod) {
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        })
    }

    try {
        // 🔹 Fetch plan
        const { data: plan, error: planErr } = await supabase
            .from("plans")
            .select(`
                id,
                name,
                included_branches,
                cached_price_monthly,
                cached_price_yearly,
                cached_extra_store_price_monthly,
                cached_extra_store_price_yearly,
                cached_currency
            `)
            .eq("id", planId)
            .single();

        if (planErr || !plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found",
                code: "PLAN_NOT_FOUND"
            });
        }

        // 🔹 Fetch plugins
        const { data: pluginsData } = plugins.length
            ? await supabase
                .from("plugins")
                .select("key, name, cached_price_monthly, cached_price_yearly")
                .in("key", plugins)
            : { data: [] };

        const currency = {
            code: plan.cached_currency,
            symbol: plan.cached_currency === "EUR" ? "€" : plan.cached_currency
        };

        // 🔹 Normalize plan pricing
        const planMonthly = plan.cached_price_monthly ?? 0;
        const planYearly = plan.cached_price_yearly ?? 0;

        const planYearlyPerMonth = planYearly ? Number((planYearly / 12).toFixed(2)) : 0;

        const planDiscount = planMonthly && planYearly
            ? Math.round((1 - planYearly / (planMonthly * 12)) * 100)
            : null;

        // 🔹 Stores
        const chargeableStores = Math.max( 0, totalBranches - plan.included_branches );

        const storeUnitPrice = billingPeriod === "monthly"
            ? plan.cached_extra_store_price_monthly
            : plan.cached_extra_store_price_yearly;

        const storesTotal = chargeableStores * (storeUnitPrice || 0);

        // 🔹 Plugins total
        const pluginsWithPrices = (pluginsData || []).map(p => {
            const yearlyPerMonth = p.cached_price_yearly
                ? Number((p.cached_price_yearly / 12).toFixed(2))
                : null;

            const price = billingPeriod === "monthly"
                ? p.cached_price_monthly
                : p.cached_price_yearly;

            return {
                key: p.key,
                name: p.name,
                prices: {
                    monthly: p.cached_price_monthly,
                    yearly: p.cached_price_yearly,
                    yearly_per_month: yearlyPerMonth
                },
                total_price: price || 0
            }
        })

        const pluginsTotal = pluginsWithPrices.reduce( (sum, p) => sum + (p.total_price || 0), 0 );

        // 🔹 Subtotal
        const planBase = billingPeriod === "monthly"
            ? planMonthly
            : planYearly;

        const subtotal = planBase + storesTotal + pluginsTotal;

        const vatPercent = 24;
        const vatAmount = Number(((subtotal * vatPercent) / 100).toFixed(2));
        const total = Number((subtotal + vatAmount).toFixed(2));

        const originalYearlySubtotal = (planMonthly * 12) + storesTotal + pluginsTotal;
        const originalYearlyVatAmount = Number(((originalYearlySubtotal * vatPercent) / 100).toFixed(2));
        const originalYearlyTotal = Number((originalYearlySubtotal + originalYearlyVatAmount).toFixed(2));

        return res.json({
            success: true,
            message: "Επιτυχής υπολογισμός τιμών",
            data: {
                currency,

                plan: {
                    id: plan.id,
                    name: plan.name,
                    billingPeriod,
                    prices: {
                        monthly: planMonthly,
                        yearly: planYearly,
                        yearly_per_month: planYearlyPerMonth,
                        yearly_discount_percent: planDiscount
                    }
                },

                branches: {
                    included: plan.included_branches,
                    total: totalBranches,
                    chargeable: chargeableStores,
                    unit_price_monthly: plan.cached_extra_store_price_monthly,
                    unit_price_yearly: plan.cached_extra_store_price_yearly,
                    total_price: storesTotal
                },

                plugins: pluginsWithPrices,

                summary: {
                    subtotal: Number(subtotal.toFixed(2)),
                    original_yearly_subtotal: originalYearlySubtotal,
                    vat_percent: vatPercent,
                    vat_amount: vatAmount,
                    total,
                    original_yearly_total: originalYearlyTotal
                }
            }
        })
    } catch (err) {
        console.error("PRICE PREVIEW ERROR:", err);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
})


router.post('/onboarding-complete', requireAuth, requireOwner, async (req, res) => {

    const { companyId } = req.user;
    const userId = req.user.id;

    try {

        // 1. Load onboarding data with full validation
        const { data: onboarding, error: onboardingErr } = await supabase
            .from('onboarding')
            .select('current_step, max_step_reached, is_completed, data')
            .eq('company_id', companyId)
            .single();

        if (onboardingErr) {
            console.error("DB SELECT ERROR (onboarding):", onboardingErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση onboarding",
                code: "DB_ERROR",
            });
        }

        if (onboarding.is_completed) {
            return res.status(400).json({
                success: false,
                message: "Το onboarding έχει ήδη ολοκληρωθεί",
                code: "ALREADY_COMPLETED"
            });
        }

        if (onboarding.current_step !== TOTAL_STEPS) {
            return res.status(400).json({
                success: false,
                message: "Πρέπει να ολοκληρώσετε όλα τα steps",
                code: "NOT_ON_FINAL_STEP",
            });
        }

        const onboardingData = onboarding.data;

        const validation = validateCompleteOnboardingData(onboardingData);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: "Τα δεδομένα δεν είναι έγκυρα",
                code: "VALIDATION_ERROR",
            });
        }


        // =============================================
        // UPDATE COMPANY INFO & STRIPE CUSTOMER
        // =============================================
        const { data: updatedCompany, error: updatedCompanyErr } = await supabase
            .from('companies')
            .update({
                name: onboardingData.company.name,
                phone: onboardingData.company.phone,
            })
            .eq('id', companyId)
            .select('name, stripe_customer_id')
            .single();

        if (updatedCompanyErr) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά την ενημέρωση της εταιρείας"
            };
        }

        if (!updatedCompany?.stripe_customer_id) {
            return res.status(400).json({
                success: false,
                message: 'Stripe customer not found'
            });
        }

        const stripeCustomerId = updatedCompany.stripe_customer_id;

        await stripe.customers.update(stripeCustomerId, {
            name: updatedCompany.name,
        });

        // =============================================
        // UPDATE INDUSTRIES
        // =============================================
        // Διαγραφή παλιών και εισαγωγή νέων
        await supabase
            .from('company_industries')
            .delete()
            .eq('company_id', companyId);

        if (onboardingData.industries.length > 0) {
            const { data: validIndustries, error: validIndustriesError } = await supabase
                .from('industries')
                .select('key')
                .in('key', onboardingData.industries);

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
        // CHECK FOR EXISTING INCOMPLETE SUBSCRIPTION
        // =============================================
        const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('id, stripe_subscription_id, plan_id, billing_period')
            .eq('company_id', companyId)
            .eq('billing_status', 'incomplete')
            .maybeSingle();

        // =============================================
        // HANDLE EXISTING SUBSCRIPTION
        // =============================================
        if (existingSub) {
            // Έλεγχος αν άλλαξαν τα δεδομένα
            const dataChanged = await hasDataChanged(existingSub, companyId, onboardingData);

            if (!dataChanged) {
                // Τίποτα δεν άλλαξε, επιστρέφουμε το ίδιο clientSecret
                const stripeSub = await stripe.subscriptions.retrieve(existingSub.stripe_subscription_id, {
                    expand: ['latest_invoice.confirmation_secret']
                });

                return res.json({
                    success: true,
                    message: "Existing valid subscription found",
                    data: {
                        subscriptionId: stripeSub.id,
                        clientSecret: stripeSub.latest_invoice.confirmation_secret.client_secret,
                    }
                });
            }

            // ΤΑ ΔΕΔΟΜΕΝΑ ΑΛΛΑΞΑΝ - Ακύρωση παλιάς συνδρομής και cleanup
            const cleanup = await cleanupIncompleteSubscription(existingSub, companyId);

            if (!cleanup.success) {
                return res.status(500).json({
                    success: false,
                    message: "Αποτυχία κατά την ακύρωση παλιάς συνδρομής",
                    code: "CLEANUP_FAILED",
                });
            }
        }

        // =============================================
        // FETCH PLAN DETAILS
        // =============================================
        const planId = onboardingData.plan.id;
        const billingPeriod = onboardingData.plan.billing;

        const { data: plan, error: planErr } = await supabase
            .from('plans')
            .select(`
                id,
                name,
                is_free,
                allows_paid_plugins,
                stripe_price_id_monthly,
                stripe_price_id_yearly,
                stripe_extra_store_price_id_monthly,
                stripe_extra_store_price_id_yearly,
                included_branches
            `)
            .eq('id', planId)
            .single();

        if (planErr || !plan) {
            return res.status(400).json({
                success: false,
                message: "Invalid plan",
                code: "INVALID_PLAN"
            });
        }

        // =============================================
        // BUILD STRIPE SUBSCRIPTION ITEMS
        // =============================================
        const items = [];

        items.push({
            price: billingPeriod === 'monthly'
                ? plan.stripe_price_id_monthly
                : plan.stripe_price_id_yearly
        });

        const extraBranches = Math.max(0, (onboardingData.branches || 0) - plan.included_branches);
        if (extraBranches > 0) {
            items.push({
                price: billingPeriod === 'monthly'
                    ? plan.stripe_extra_store_price_id_monthly
                    : plan.stripe_extra_store_price_id_yearly,
                quantity: extraBranches
            });
        }

        if (onboardingData.plugins?.length) {
            const { data: plugins } = await supabase
                .from('plugins')
                .select('key, stripe_price_id_monthly, stripe_price_id_yearly')
                .in('key', onboardingData.plugins)
                .eq('is_active', true);

            if (plugins) {
                plugins.forEach(p => {
                    const priceId = billingPeriod === 'monthly' 
                        ? p.stripe_price_id_monthly 
                        : p.stripe_price_id_yearly;
                    
                    if (priceId && priceId.trim() !== '') {
                        items.push({ price: priceId });
                    }
                });
            }
        }

        // =============================================
        // CREATE STRIPE SUBSCRIPTION
        // =============================================
        const subCode = generateSubscriptionCode();

        const stripeSubscription = await stripe.subscriptions.create({
            customer: stripeCustomerId,
            items,
            payment_behavior: 'default_incomplete',
            payment_settings: {
                save_default_payment_method: 'on_subscription'
            },
            expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payment_intent'],
            metadata: { 
                companyId,
                planId,
                billingPeriod,
                subscriptionCode: subCode
            }
        });

        console.log('Subscription created:', stripeSubscription.id);

        // =============================================
        // INSERT PLUGINS
        // =============================================
        if (onboardingData.plugins.length > 0) {
            const { data: availablePlugins } = await supabase
                .from('plugins')
                .select('key, is_active')
                .in('key', onboardingData.plugins)
                .eq('is_active', true);

            if (availablePlugins && availablePlugins.length > 0) {
                const pluginRows = availablePlugins.map(plugin => ({
                    company_id: companyId,
                    plugin_key: plugin.key,
                    status: 'active',
                    activated_at: new Date().toISOString(),
                    subscription_item_id: null,
                    settings: null
                }));

                await supabase
                    .from('company_plugins')
                    .insert(pluginRows);
            }
        }

        // =============================================
        // CREATE STORES
        // =============================================
        const storesToCreate = [];

        storesToCreate.push({
            company_id: companyId,
            name: 'Κεντρική Αποθήκη',
            is_main: true,
            created_at: new Date().toISOString()
        });

        const totalBranches = (onboardingData.branches || 0);
        for (let i = 1; i <= totalBranches; i++) {
            storesToCreate.push({
                company_id: companyId,
                name: `Υποκατάστημα ${i}`,
                is_main: false,
                created_at: new Date().toISOString()
            });
        }

        const { data: createdStores, error: storesErr } = await supabase
            .from('stores')
            .insert(storesToCreate)
            .select('id, name, address, city, is_main');

        if (storesErr) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά τη δημιουργία καταστημάτων"
            };
        }

        console.log(`Created ${createdStores.length} stores`);

        // =============================================
        // LINK PLUGINS TO STORES
        // =============================================
        if (onboardingData.plugins.length > 0 && createdStores.length > 0) {
            const { data: companyPlugins } = await supabase
                .from('company_plugins')
                .select('id, plugin_key')
                .eq('company_id', companyId)
                .in('plugin_key', onboardingData.plugins);

            if (companyPlugins && companyPlugins.length > 0) {
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
                    await supabase
                        .from('store_plugins')
                        .insert(storePluginsToInsert);

                    console.log(`Created ${storePluginsToInsert.length} store_plugin records`);
                }
            }
        }

        // =============================================
        // CREATE SUBSCRIPTION IN DB
        // =============================================
        const latestInvoice = stripeSubscription.latest_invoice;
        const invoiceLine = latestInvoice.lines.data[0];
        
        const subscriptionPayload = {
            company_id: companyId,
            plan_id: plan.id,
            stripe_subscription_id: stripeSubscription.id,
            subscription_code: subCode,
            billing_period: billingPeriod,
            // Θα είναι 'incomplete' μέχρι να ολοκληρωθεί η πληρωμή στο frontend
            billing_status: stripeSubscription.status,
            currency: stripeSubscription.currency,
            current_period_start: new Date(invoiceLine.period.start * 1000).toISOString(),
            current_period_end: new Date(invoiceLine.period.end * 1000).toISOString(),
            cancel_at_period_end: false,
            cancel_at: null,
            canceled_at: null,
            updated_at: new Date().toISOString()
        };

        const { data: createdSubscription, error: subscriptionErr } = await supabase
            .from('subscriptions')
            .insert(subscriptionPayload)
            .select('id')
            .single();

        if (subscriptionErr) {
            console.error('FULL DB ERROR:', subscriptionErr);
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά τη δημιουργία συνδρομής"
            };
        }

        // =============================================
        // CREATE SUBSCRIPTION ITEMS
        // =============================================
        const subscriptionItemsToInsert = [];

        for (const stripeItem of stripeSubscription.items.data) {
            const priceId = stripeItem.price.id;
            const quantity = stripeItem.quantity;
            const unitAmount = stripeItem.price.unit_amount / 100;

            let itemType = null;
            let pluginKey = null;

            if (priceId === plan.stripe_price_id_monthly || priceId === plan.stripe_price_id_yearly) {
                itemType = 'plan';
            } else if (priceId === plan.stripe_extra_store_price_id_monthly || priceId === plan.stripe_extra_store_price_id_yearly) {
                itemType = 'extra_store';
            } else {
                const { data: matchedPlugin } = await supabase
                    .from('plugins')
                    .select('key')
                    .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
                    .maybeSingle();

                if (matchedPlugin) {
                    itemType = 'plugin';
                    pluginKey = matchedPlugin.key;
                }
            }

            if (itemType) {
                subscriptionItemsToInsert.push({
                    subscription_id: createdSubscription.id,
                    item_type: itemType,
                    stripe_subscription_item_id: stripeItem.id,
                    stripe_price_id: priceId,
                    plugin_key: pluginKey,
                    quantity: quantity,
                    unit_amount: unitAmount,
                    currency: stripeItem.price.currency,
                    status: 'active'
                });
            }
        }

        if (subscriptionItemsToInsert.length > 0) {
            const { data: createdSubscriptionItems, error: itemsError } = await supabase
                .from('subscription_items')
                .insert(subscriptionItemsToInsert)
                .select('id, plugin_key');

            if (itemsError) {
                console.error('Failed to create subscription items:', itemsError);
                throw {
                    status: 500,
                    code: "DB_ERROR",
                    message: "Σφάλμα κατά τη δημιουργία subscription items"
                };
            }

            console.log(`Created ${createdSubscriptionItems.length} subscription items`);

            // =============================================
            // UPDATE COMPANY_PLUGINS WITH SUBSCRIPTION_ITEM_ID
            // =============================================
            const pluginItems = createdSubscriptionItems.filter(item => item.plugin_key !== null);

            if (pluginItems.length > 0) {
                const updatePromises = pluginItems.map(pluginItem =>
                    supabase
                        .from('company_plugins')
                        .update({ subscription_item_id: pluginItem.id })
                        .eq('company_id', companyId)
                        .eq('plugin_key', pluginItem.plugin_key)
                );

                const results = await Promise.allSettled(updatePromises);

                const successCount = results.filter(r => r.status === 'fulfilled').length;
                console.log(`Updated ${successCount}/${pluginItems.length} company_plugins with subscription_item_id`);
            }
        }

        // =============================================
        // CREATE PAYMENT HISTORY
        // =============================================
        await supabase
            .from('payment_history')
            .insert({
                subscription_id: createdSubscription.id,
                stripe_invoice_id: latestInvoice.id,
                stripe_payment_intent_id: latestInvoice.payment_intent?.id || null,
                stripe_charge_id: null,
                amount: latestInvoice.amount_due / 100,
                currency: latestInvoice.currency,
                status: 'pending',
                payment_method: 'card',
                failure_reason: null,
                metadata: {
                    billing_reason: latestInvoice.billing_reason,
                    invoice_number: latestInvoice.number,
                    subscription_period: {
                        start: new Date(invoiceLine.period.start * 1000).toISOString(),
                        end: new Date(invoiceLine.period.end * 1000).toISOString()
                    }
                },
                updated_at: new Date().toISOString()
            });

        return res.json({
            success: true,
            message: "Επιτυχής ολοκλήρωση συνδρομής",
            data: {
                subscriptionId: stripeSubscription.id,
                clientSecret: stripeSubscription.latest_invoice.confirmation_secret.client_secret,

                // Χρήσιμα για το Frontend tracking ή αν θες να εμφανίσεις π.χ. τον αριθμό τιμολογίου
                //paymentIntentId: stripeSubscription.latest_invoice.payment_intent?.id, // Για το ιστορικό σου
                //invoiceId: stripeSubscription.latest_invoice.id
            }
        });

    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({
                success: false,
                message: err.message,
                code: err.code
            });
        }

        console.error('ONBOARDING COMPLETE ERROR:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', 
            code: "SERVER_ERROR" 
        });
    }
});

router.post('/onboarding-verify', requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;
    const userId = req.user.id;
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
        return res.status(400).json({
            success: false,
            message: 'Missing subscriptionId',
            code: 'MISSING_PARAMETER'
        });
    }

    try {
        // =============================================
        // 1. VALIDATE: Subscription belongs to company
        // =============================================
        const { data: existingSub, error: subFetchErr } = await supabase
            .from('subscriptions')
            .select('id, billing_status, stripe_subscription_id')
            .eq('company_id', companyId)
            .eq('stripe_subscription_id', subscriptionId)
            .single();

        if (subFetchErr || !existingSub) {
            return res.status(404).json({
                success: false,
                message: 'Subscription not found for this company',
                code: 'SUBSCRIPTION_NOT_FOUND'
            });
        }

        // =============================================
        // 2. CHECK: Onboarding already completed?
        // =============================================
        const { data: onboarding, error: onboardingFetchErr } = await supabase
            .from('onboarding')
            .select('is_completed')
            .eq('company_id', companyId)
            .single();

        if (onboardingFetchErr) {
            console.error("Error fetching onboarding:", onboardingFetchErr);
            return res.status(500).json({
                success: false,
                message: 'Σφάλμα κατά την ανάγνωση onboarding',
                code: 'DB_ERROR'
            });
        }

        // If already completed, return success with existing data
        if (onboarding?.is_completed) {
            console.log("Onboarding already completed - returning existing data");

            // Fetch stores
            const { data: stores, error: fetchStoresErr } = await supabase
                .from('stores')
                .select('id, name, address, city, is_main')
                .eq('company_id', companyId);

            if (fetchStoresErr) {
                console.error('Failed to fetch stores:', fetchStoresErr);
                return res.status(500).json({
                    success: false,
                    message: 'Σφάλμα κατά την ανάγνωση καταστημάτων',
                    code: 'DB_ERROR'
                });
            }

            // Fetch owner role & permissions
            const { data: ownerRole, error: ownerRoleErr } = await supabase
                .from('company_users')
                .select(`
                    role_id,
                    roles (id, key, name)
                `)
                .eq('company_id', companyId)
                .eq('user_id', userId)
                .eq('is_owner', true)
                .single();

            if (ownerRoleErr || !ownerRole) {
                console.error('Failed to fetch owner role:', ownerRoleErr);
                return res.status(500).json({
                    success: false,
                    message: 'Σφάλμα κατά την ανάγνωση ρόλου',
                    code: 'DB_ERROR'
                });
            }

            const { data: rolePerms } = await supabase
                .from('role_permissions')
                .select('permission_key')
                .eq('role_id', ownerRole.role_id);

            const permissions = rolePerms?.map(rp => rp.permission_key) || [];

            const storesWithRoles = stores.map(store => ({
                id: store.id,
                name: store.name,
                address: store.address,
                city: store.city,
                is_main: store.is_main,
                role: {
                    id: ownerRole.roles.id,
                    key: ownerRole.roles.key,
                    name: ownerRole.roles.name
                },
                permissions
            }));

            return res.json({
                success: true,
                message: "Το onboarding έχει ήδη ολοκληρωθεί",
                data: {
                    is_completed: true,
                    stores: storesWithRoles
                }
            });
        }

        // =============================================
        // 3. VERIFY: Stripe subscription status
        // =============================================
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        if (subscription.status !== 'active' && subscription.status !== 'trialing') {
            return res.status(400).json({ 
                success: false, 
                message: "Η πληρωμή δεν ολοκληρώθηκε. Παρακαλώ ελέγξτε την κάρτα σας.",
                code: "PAYMENT_FAILED",
                data: {
                    status: subscription.status 
                }
            });
        }

        // =============================================
        // 4. UPDATE: Subscription status to active
        // =============================================
        const { error: subUpdateErr } = await supabase
            .from('subscriptions')
            .update({ 
                billing_status: 'active',
                updated_at: new Date().toISOString() 
            })
            .eq('id', existingSub.id);

        if (subUpdateErr) {
            console.error('Failed to update subscription:', subUpdateErr);
            return res.status(500).json({
                success: false,
                message: 'Σφάλμα κατά την ενημέρωση συνδρομής',
                code: 'DB_ERROR'
            });
        }

        console.log(`Subscription ${subscriptionId} marked as active`);

        // =============================================
        // 5. UPDATE: Payment history status
        // =============================================
        const invoiceId = subscription.latest_invoice;
        if (invoiceId) {
            const { error: payError } = await supabase
                .from('payment_history')
                .update({ 
                    status: 'paid',
                    paid_at: new Date().toISOString(),
                    updated_at: new Date().toISOString() 
                })
                .eq('stripe_invoice_id', invoiceId)
                .eq('status', 'pending');
            
            if (payError) {
                console.error('Failed to update payment history:', payError);
                // Don't fail the request, just log it
            } else {
                console.log(`Payment history updated for invoice ${invoiceId}`);
            }
        }

        // =============================================
        // 6. MARK: Onboarding as completed
        // =============================================
        const { data: onboardingUpdate, error: onboardingUpdateErr } = await supabase
            .from('onboarding')
            .update({
                is_completed: true,
                updated_at: new Date().toISOString()
            })
            .eq('company_id', companyId)
            .select('is_completed')
            .single();

        if (onboardingUpdateErr) {
            console.error('Failed to complete onboarding:', onboardingUpdateErr);
            return res.status(500).json({
                success: false,
                message: 'Σφάλμα κατά την ολοκλήρωση onboarding',
                code: 'DB_ERROR'
            });
        }

        console.log(`Onboarding completed for company ${companyId}`);

        // =============================================
        // 7. FETCH: Stores for response
        // =============================================
        const { data: stores, error: fetchStoresErr } = await supabase
            .from('stores')
            .select('id, name, address, city, is_main')
            .eq('company_id', companyId);

        if (fetchStoresErr) {
            console.error('Failed to fetch stores:', fetchStoresErr);
            return res.status(500).json({
                success: false,
                message: 'Σφάλμα κατά την ανάγνωση καταστημάτων',
                code: 'DB_ERROR'
            });
        }

        // =============================================
        // 8. FETCH: Owner role & permissions
        // =============================================
        const { data: ownerRole, error: ownerRoleErr } = await supabase
            .from('company_users')
            .select(`
                role_id,
                roles (id, key, name)
            `)
            .eq('company_id', companyId)
            .eq('user_id', userId)
            .eq('is_owner', true)
            .single();

        if (ownerRoleErr || !ownerRole) {
            console.error('Failed to fetch owner role:', ownerRoleErr);
            return res.status(500).json({
                success: false,
                message: 'Σφάλμα κατά την ανάγνωση ρόλου',
                code: 'DB_ERROR'
            });
        }

        const { data: rolePerms, error: rolePermsErr } = await supabase
            .from('role_permissions')
            .select('permission_key')
            .eq('role_id', ownerRole.role_id);

        if (rolePermsErr) {
            console.error('Failed to fetch permissions:', rolePermsErr);
            return res.status(500).json({
                success: false,
                message: 'Σφάλμα κατά την ανάγνωση δικαιωμάτων',
                code: 'DB_ERROR'
            });
        }

        const permissions = rolePerms?.map(rp => rp.permission_key) || [];

        // =============================================
        // 9. BUILD: Response with stores + roles
        // =============================================
        const storesWithRoles = stores.map(store => ({
            id: store.id,
            name: store.name,
            address: store.address,
            city: store.city,
            is_main: store.is_main,
            role: {
                id: ownerRole.roles.id,
                key: ownerRole.roles.key,
                name: ownerRole.roles.name
            },
            permissions
        }));

        // =============================================
        // 10. SUCCESS RESPONSE
        // =============================================
        return res.json({ 
            success: true, 
            message: "Η συνδρομή είναι πλέον ενεργή!",
            data: {
                is_completed: onboardingUpdate.is_completed,
                stores: storesWithRoles
            }
        });

    } catch (error) {
        console.error("Error in onboarding-verify:", error);
        return res.status(500).json({ 
            success: false, 
            message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', 
            code: 'SERVER_ERROR' 
        });
    }
});






router.post("/check-plan-change", requireAuth, async (req, res) => {

    const userId = req.user.id;
    const { newPlanId} = req.body;

    if(!newPlanId){
        console.log("NO DATA RECEIVED");
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    try {
        // 1) Load user
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("subscription_id")
            .eq("id", userId)
            .single();

        if (userError || !user) {
            return res.status(400).json({ 
                success: false, 
                message: "User not found",
                code: "DB ERROR"
            });
        }

        // 2) Load subscription
        const { data: subscription, error: subError } = await supabase
            .from("subscriptions")
            .select("id, plan_id")
            .eq("id", user.subscription_id)
            .single();

        if (subError || !subscription) {
            return res.status(400).json({ 
                success: false, 
                message: "Subscription not found", 
                code: "DB ERROR"
            });
        }

        // 3) Load onboarding
        const { data: onboarding, error: onboardingError } = await supabase
            .from("onboarding")
            .select("is_completed")
            .eq("subscription_id", subscription.id)
            .single();

        if (onboardingError || !onboarding) {
            return res.status(400).json({ 
                success: false, 
                message: "Onboarding not found", 
                code: "DB ERROR"
            });
        }

        // 4) Load new plan
        const { data: newPlan, error: newPlanError } = await supabase
            .from("plans")
            .select("*")
            .eq("id", newPlanId)
            .single();

        if (newPlanError || !newPlan) {
            return res.status(400).json({ 
                success: false, 
                message: "New plan not found", 
                code: "DB ERROR"
            });
        }

        // -------------------------
        // ONBOARDING MODE
        // -------------------------
        if (!onboarding.is_completed === true) {

            // Basic (free)
            if (newPlan.name === "Basic") {
                return res.json({
                    success: true,
                    message: "Free Onboarding",
                    data: {
                            type: "free-onboarding",
                            requiresPayment: false
                    }
                });
            }

            // Any paid plan
            return res.json({
                success: true,
                message: "First Payment",
                data: {
                    type: "first-payment",
                    requiresPayment: true
                }
            });
        }

        // -------------------------
        // -------------------------

        // 5) Load current plan
        const { data: currentPlan, error: currentPlanError } = await supabase
            .from("plans")
            .select("*")
            .eq("id", subscription.plan_id)
            .single();

        if (currentPlanError || !currentPlan) {
            return res.status(400).json({ 
                success: false, 
                message: "Current plan not found", 
                code: "DB ERROR"
            });
        }

        // -------------------------
        // SETTINGS MODE
        // -------------------------

        // SAME PLAN
        if (subscription.plan_id === newPlanId) {
            return res.json({
                success: true,
                message: "Same Plan",
                data: {
                    type: "same-plan",
                    requiresPayment: false
                }
            });
        }

        // CANCEL (going to Basic)
        if (newPlan.name === "Basic") {
            return res.json({
                success: true,
                message: "Cancel",
                data: {
                    type: "cancel",
                    requiresPayment: false
                }
            });
        }

        // Determine upgrade / downgrade by comparing monthly base price
        const oldPrice = currentPlan.base_price_per_month;
        const newPrice = newPlan.base_price_per_month;

        if (newPrice > oldPrice) {
            return res.json({
                success: true,
                message: "Upgrade",
                data: {
                    type: "upgrade",
                    requiresPayment: true
                }
            });
        }

        if (newPrice < oldPrice) {
            return res.json({
                success: true,
                message: "Downgrade",
                data: {
                    type: "downgrade",
                    requiresPayment: false
                }
            });
        }

        // Fallback
        return res.json({
            success: true,
            message: "Fallback",
            data: {
                type: "unknown",
                requiresPayment: false
            }
        });

    } catch (err) {
        console.error("Check change plan error:", err);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
});





// router.post("/subscription/apply", requireAuth, async (req, res) => {

//     const userId = req.user.id;
//     const subId = req.user.subId;
//     const isOnboarding = req.user.needsOnboarding === true;

//     const { planId, priceType } = req.body;

//     // -------------------------------------------------------
//     // 1) LOAD SUBSCRIPTION
//     // -------------------------------------------------------
//     const { data: subscription, error: subErr } = await supabase
//         .from("subscriptions")
//         .select("*")
//         .eq("id", subId)
//         .single();

//     if (subErr || !subscription) {
//         return res.status(404).json({ error: "Subscription not found" });
//     }

//     // -------------------------------------------------------
//     // ONBOARDING FLOW
//     // -------------------------------------------------------
//     if (isOnboarding) {
//         // CREATE STRIPE SUBSCRIPTION
//         const stripeSub = await stripe.subscriptions.create({
//             customer: subscription.stripe_customer_id,
//             items: [{ price: getStripePrice(planId, priceType) }],
//             expand: ["latest_invoice.payment_intent"]
//         });

//         // UPDATE SUBSCRIPTION IN SUPABASE
//         await supabase
//             .from("subscriptions")
//             .update({
//                 plan_id: planId,
//                 billing_status: "active",
//                 stripe_subscription_id: stripeSub.id
//             })
//             .eq("id", subId);

//         // COMPLETE ONBOARDING
//         await supabase
//             .from("users")
//             .update({ needsOnboarding: false })
//             .eq("id", userId);

//         return res.json({
//             success: true,
//             message: "Onboarding completed"
//         });
//     }

//     // -------------------------------------------------------
//     // SETTINGS MODE (upgrade / downgrade)
//     // -------------------------------------------------------

//     // LOAD CURRENT PLAN
//     const { data: currentPlan } = await supabase
//         .from("plans")
//         .select("*")
//         .eq("id", subscription.plan_id)
//         .single();

//     // LOAD NEW PLAN
//     const { data: newPlan } = await supabase
//         .from("plans")
//         .select("*")
//         .eq("id", planId)
//         .single();

//     if (!currentPlan || !newPlan) {
//         return res.status(400).json({ error: "Invalid plan" });
//     }

//     // ------------------- UPGRADE -------------------
//     if (newPlan.base_price_per_month > currentPlan.base_price_per_month) {
//         await stripe.subscriptions.update(subscription.stripe_subscription_id, {
//             items: [{
//                 id: subscription.stripe_subscription_item_id,
//                 price: getStripePrice(planId, priceType)
//             }],
//             proration_behavior: "always_invoice"
//         });

//         await supabase
//             .from("subscriptions")
//             .update({ plan_id: planId })
//             .eq("id", subscription.id);

//         return res.json({ success: true, type: "upgrade" });
//     }

//     // ------------------- DOWNGRADE -------------------
//     if (newPlan.price < currentPlan.price) {
//         await stripe.subscriptions.update(subscription.stripe_subscription_id, {
//             items: [{
//                 id: subscription.stripe_subscription_item_id,
//                 price: getStripePrice(planId, priceType)
//             }],
//             proration_behavior: "none"
//         });

//         await supabase
//             .from("subscriptions")
//             .update({ plan_id: planId })
//             .eq("id", subscription.id);

//         return res.json({ success: true, type: "downgrade" });
//     }

//     return res.json({ success: true });
// });




module.exports = router;