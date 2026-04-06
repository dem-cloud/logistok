const express = require('express');
const { requireAuth, requireOwner } = require('../middlewares/authRequired');
const Stripe = require('stripe');
const supabase = require('../supabaseConfig');
const { TOTAL_STEPS } = require('../helpers/onboarding/onboardingSteps');
const { generateSubscriptionCode } = require('../helpers/generateSubscriptionCode');
const { validateCompleteOnboardingData } = require('../helpers/onboarding/onboardingValidation');
const { hasDataChanged, cleanupIncompleteSubscription } = require('../helpers/onboarding/subscriptionCleanup');
const { getTaxType, validateTaxPrefix, validateEuVatFormat, splitEuVat } = require('../helpers/billing/tax/taxUtils');
const { validateViaVies } = require('../helpers/billing/tax/validateViaVies');
const { euCountries } = require('../helpers/billing/tax/taxConfig');
const { handleImmediatePlanChange, handleScheduledDowngrade, handlePlanChangeSuccess } = require('../helpers/billing/planChange');
const { canAddStore } = require('../helpers/planLimits');


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

router.post("/price-preview", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;
    const {
        planId,
        billingPeriod,
        totalBranches = 0,
        plugins = [],
        billingInfo = null
    } = req.body;

    if (!planId || !billingPeriod) {
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    try {
        // 1. Fetch company
        const { data: company, error: companyErr } = await supabase
            .from("companies")
            .select("stripe_customer_id")
            .eq("id", companyId)
            .single();

        if (companyErr || !company?.stripe_customer_id) {
            return res.status(400).json({
                success: false,
                message: "Δεν βρέθηκε λογαριασμός πληρωμών",
                code: "NO_STRIPE_CUSTOMER"
            });
        }

        // 2. Detect country
        let detectedCountry = 'GR';
        if (billingInfo?.country) {
            detectedCountry = billingInfo.country;
        }

        // 3. Fetch plan
        const { data: plan, error: planErr } = await supabase
            .from("plans")
            .select(`
                id,
                name,
                included_branches,
                stripe_price_id_monthly,
                stripe_price_id_yearly,
                stripe_extra_store_price_id_monthly,
                stripe_extra_store_price_id_yearly,
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

        // 4. Fetch plugins
        let pluginsData = [];
        if (plugins.length > 0) {
            const { data } = await supabase
                .from("plugins")
                .select("key, name, stripe_price_id_monthly, stripe_price_id_yearly, cached_price_monthly, cached_price_yearly")
                .in("key", plugins);
            pluginsData = data || [];
        }

        // 5. Build subscription items for Stripe preview
        const subscriptionItems = [];

        // Plan price
        const planPriceId = billingPeriod === "monthly"
            ? plan.stripe_price_id_monthly
            : plan.stripe_price_id_yearly;

        if (planPriceId) {
            subscriptionItems.push({ price: planPriceId, quantity: 1 });
        }

        // Extra stores
        const chargeableStores = Math.max(0, totalBranches - plan.included_branches);
        if (chargeableStores > 0) {
            const storePriceId = billingPeriod === "monthly"
                ? plan.stripe_extra_store_price_id_monthly
                : plan.stripe_extra_store_price_id_yearly;

            if (storePriceId) {
                subscriptionItems.push({ price: storePriceId, quantity: chargeableStores });
            }
        }

        // Plugins
        for (const plugin of pluginsData) {
            const pluginPriceId = billingPeriod === "monthly"
                ? plugin.stripe_price_id_monthly
                : plugin.stripe_price_id_yearly;

            if (pluginPriceId) {
                subscriptionItems.push({ price: pluginPriceId, quantity: 1 });
            }
        }

        // 6. Build preview details with customer_details for tax calculation
        const previewDetails = {
            customer: company.stripe_customer_id,
            subscription_details: {
                items: subscriptionItems
            },
            automatic_tax: { enabled: true }
        };

        // Add customer_details if billingInfo provided
        if (billingInfo) {
            // Validate tax ID if provided
            let validatedTaxId = null;
            if (billingInfo.taxId && billingInfo.taxId.trim()) {
                const { valid: validPrefix } = validateTaxPrefix(detectedCountry, billingInfo.taxId);
                const { valid: validFormat } = validateEuVatFormat(detectedCountry, billingInfo.taxId);
                
                if (validPrefix && validFormat) {
                    validatedTaxId = billingInfo.taxId.trim().toUpperCase();
                }
            }

            const taxType = getTaxType(detectedCountry, validatedTaxId);

            previewDetails.customer_details = {
                address: {
                    country: detectedCountry,
                    city: billingInfo.city || undefined,
                    postal_code: billingInfo.postalCode || undefined,
                    line1: billingInfo.address || undefined
                },
                tax_ids: (taxType?.value && taxType.value.length > 2) ? [taxType] : []
            };
        }

        // 7. Get Stripe preview with retry
        let invoicePreview;
        try {
            invoicePreview = await stripe.invoices.createPreview(previewDetails);
        } catch (stripeError) {
            console.error("Stripe preview error:", stripeError.message);
            
            if (stripeError.param?.includes('tax_id') && previewDetails.customer_details) {
                previewDetails.customer_details.tax_ids = [];
                invoicePreview = await stripe.invoices.createPreview(previewDetails);
            } else {
                throw stripeError;
            }
        }

        // 8. Parse Stripe response
        const subtotal = invoicePreview.subtotal / 100;
        const taxAmount = invoicePreview.total_taxes?.reduce((sum, t) => sum + t.amount, 0) / 100 || 0;
        const total = invoicePreview.total / 100;
        const taxPercent = subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) : 0;

        // 9. Build response
        const currency = {
            code: plan.cached_currency || "EUR",
            symbol: (plan.cached_currency || "EUR") === "EUR" ? "€" : plan.cached_currency
        };

        // Plan pricing
        const planMonthly = plan.cached_price_monthly ?? 0;
        const planYearly = plan.cached_price_yearly ?? 0;
        const planYearlyPerMonth = planYearly ? Number((planYearly / 12).toFixed(2)) : 0;
        const planDiscount = planMonthly && planYearly
            ? Math.round((1 - planYearly / (planMonthly * 12)) * 100)
            : null;

        // Stores pricing
        const storeUnitPriceMonthly = plan.cached_extra_store_price_monthly || 0;
        const storeUnitPriceYearly = plan.cached_extra_store_price_yearly || 0;
        const storesTotal = chargeableStores * (billingPeriod === "monthly" ? storeUnitPriceMonthly : storeUnitPriceYearly);

        // Plugins with prices
        const pluginsWithPrices = pluginsData.map(p => {
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
            };
        });

        // Calculate original yearly total for strikethrough display
        const originalYearlySubtotal = (planMonthly * 12) + 
            (chargeableStores * storeUnitPriceMonthly * 12) + 
            pluginsData.reduce((sum, p) => sum + ((p.cached_price_monthly || 0) * 12), 0);
        const originalYearlyVat = Number(((originalYearlySubtotal * taxPercent) / 100).toFixed(2));
        const originalYearlyTotal = Number((originalYearlySubtotal + originalYearlyVat).toFixed(2));

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
                    unit_price_monthly: storeUnitPriceMonthly,
                    unit_price_yearly: storeUnitPriceYearly,
                    total_price: storesTotal
                },
                plugins: pluginsWithPrices,
                summary: {
                    subtotal: Number(subtotal.toFixed(2)),
                    vat_percent: taxPercent,
                    vat_amount: Number(taxAmount.toFixed(2)),
                    total: Number(total.toFixed(2)),
                    original_yearly_subtotal: originalYearlySubtotal,
                    original_yearly_total: originalYearlyTotal
                }
            }
        });

    } catch (err) {
        console.error("PRICE PREVIEW ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή. Προσπαθήστε ξανά.",
            code: "SERVER_ERROR"
        });
    }
});

router.post('/onboarding-complete', requireAuth, requireOwner, async (req, res) => {

    const { companyId } = req.user;
    const { billingInfo } = req.body;

    if (!billingInfo || typeof billingInfo !== "object") {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία τιμολόγησης",
            code: "MISSING_BILLING_INFO"
        });
    }

    const isEmpty = v => !v || !v.toString().trim();

    if (
        isEmpty(billingInfo.name) ||
        isEmpty(billingInfo.address) ||
        isEmpty(billingInfo.city) ||
        isEmpty(billingInfo.postalCode) ||
        isEmpty(billingInfo.country)
    ) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν υποχρεωτικά στοιχεία τιμολόγησης",
            code: "MISSING_BILLING_FIELDS"
        });
    }

    try {
        const { name, taxId, address, city, postalCode, country } = billingInfo;

        // =============================================
        // VALIDATE TAX ID (if provided)
        // =============================================
        let validatedTaxId = null;

        if (taxId && taxId.trim()) {
            // 1. Prefix validation
            const { valid: validPrefix, error: prefixError } = validateTaxPrefix(country, taxId);
            if (!validPrefix) {
                return res.status(200).json({
                    success: false,
                    message: prefixError,
                    code: "PREFIX_COUNTRY_MISMATCH"
                });
            }

            // 2. Format validation
            const { valid: validFormat, error: formatError } = validateEuVatFormat(country, taxId);
            if (!validFormat) {
                return res.status(200).json({
                    success: false,
                    message: formatError,
                    code: "INVALID_EU_VAT_FORMAT"
                });
            }

            validatedTaxId = taxId.trim().toUpperCase();
        }

        // =============================================
        // LOAD ONBOARDING DATA
        // =============================================
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
        // FETCH COMPANY & STRIPE CUSTOMER
        // =============================================
        const { data: currentCompany, error: currentCompanyErr } = await supabase
            .from('companies')
            .select('stripe_customer_id')
            .eq('id', companyId)
            .single();

        if (currentCompanyErr) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά την ανάγνωση της εταιρείας"
            };
        }

        if (!currentCompany?.stripe_customer_id) {
            return res.status(400).json({
                success: false,
                message: 'Stripe customer not found'
            });
        }

        const stripeCustomerId = currentCompany.stripe_customer_id;

        // =============================================
        // UPDATE STRIPE CUSTOMER
        // =============================================
        await stripe.customers.update(stripeCustomerId, {
            name: name,
            address: {
                line1: address,
                city: city,
                postal_code: postalCode,
                country: country
            }
        });

        // Add Tax ID to Stripe if provided
        if (validatedTaxId) {
            // Διαγραφή παλιών tax IDs
            const existingTaxIds = await stripe.customers.listTaxIds(stripeCustomerId);
            for (const existingTaxId of existingTaxIds.data) {
                await stripe.customers.deleteTaxId(stripeCustomerId, existingTaxId.id);
            }

            const taxType = getTaxType(country, validatedTaxId);

            if (taxType?.type && taxType?.value) {
                try {
                    await stripe.customers.createTaxId(stripeCustomerId, {
                        type: taxType.type,
                        value: taxType.value
                    });
                } catch (taxError) {
                    console.error("Tax ID error:", taxError);
                    // Συνέχισε χωρίς tax ID αν αποτύχει
                }
            }
        }

        // =============================================
        // SAVE TO BILLING_DETAILS TABLE
        // =============================================
        // Deactivate existing billing details
        await supabase
            .from("billing_details")
            .update({ is_active: false })
            .eq("company_id", companyId)
            .eq("is_active", true);

        // Insert new billing details
        const { data: billingDetailsRecord, error: billingInsertError } = await supabase
            .from("billing_details")
            .insert({
                company_id: companyId,
                is_corporate: !!validatedTaxId,
                billing_name: name.trim(),
                tax_id: validatedTaxId,
                tax_office: billingInfo.taxOffice?.trim() || null,
                address: address.trim(),
                city: city.trim(),
                postal_code: postalCode.trim(),
                country: country.trim(),
                is_active: true
            })
            .select('id')
            .single();

        if (billingInsertError) {
            console.error('Failed to insert billing_details:', billingInsertError);
            return res.status(500).json({
                success: false,
                message: 'Σφάλμα κατά την αποθήκευση στοιχείων τιμολόγησης',
                code: 'DB_ERROR'
            });
        }

        const billingDetailsId = billingDetailsRecord.id;

        // =============================================
        // UPDATE COMPANY BASIC INFO (not billing)
        // =============================================
        await supabase
            .from("companies")
            .update({
                display_name: onboardingData.company.name,
                phone: onboardingData.company.phone,
                country: onboardingData.company.country || null,
                updated_at: new Date().toISOString()
            })
            .eq("id", companyId);

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
            automatic_tax: { enabled: true },
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
        // CREATE MAIN STORE ONLY
        // =============================================
        const { data: createdStores, error: storesErr } = await supabase
            .from('stores')
            .insert({
                company_id: companyId,
                name: 'Κεντρική Αποθήκη',
                is_main: true,
                created_at: new Date().toISOString()
            })
            .select('id, name, address, city, is_main');

        if (storesErr) {
            throw {
                status: 500,
                message: "Σφάλμα κατά τη δημιουργία καταστήματος",
                code: "DB_ERROR"
            };
        }

        console.log('Created main store');

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
                billing_details_id: billingDetailsId,
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
        // 4. SYNC: Payment method to customer level
        // =============================================
        if (subscription.default_payment_method) {
            try {
                await stripe.customers.update(subscription.customer, {
                    invoice_settings: { default_payment_method: subscription.default_payment_method }
                });
                console.log('Synced payment method to customer');
            } catch (pmError) {
                console.error('Failed to sync payment method:', pmError);
                // Non-critical - continue
            }
        }

        // =============================================
        // 5. UPDATE: Subscription status to active
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
        // 6. UPDATE: Payment history status
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
        // 7. MARK: Onboarding as completed
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
        // 8. FETCH: Stores for response
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
        // 9. FETCH: Owner role & permissions
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
        // 10. BUILD: Response with stores + roles
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
        // 11. FETCH SUBSCRIPTION FOR RESPONSE
        // =============================================
        const { data: dbSubscription, error: subscriptionErr } = await supabase
            .from('subscriptions')
            .select(`
                billing_status,
                plans (
                    name
                )
            `)
            .eq('company_id', companyId)
            .maybeSingle();

        if (subscriptionErr) {
            console.error('Failed to fetch subscription:', subscriptionErr);
            // Non-critical - continue without subscription
        }

        // =============================================
        // 12. SUCCESS RESPONSE
        // =============================================
        const result = {
            is_completed: onboardingUpdate.is_completed,
            stores: storesWithRoles
        };

        // Add subscription to response
        if (dbSubscription) {
            result.subscription = {
                plan: {
                    name: dbSubscription.plans?.name || "Unknown"
                },
                status: dbSubscription.billing_status
            };
        }

        return res.json({ 
            success: true, 
            message: "Η συνδρομή είναι πλέον ενεργή!",
            data: result
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





// ============================================
// POST /api/billing/plan-change-preview
// ============================================
router.post("/plan-change-preview", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;
    const { newPlanId, billingPeriod, billingInfo } = req.body;

    if (!newPlanId || !billingPeriod) {
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    console.log(billingInfo)
    try {
        let detectedCountry = 'GR';
        // Εαν εχει billing info σημαινει οτι δινει νεα στοιχεια χρεωσης
        if(billingInfo){
            // Initialize Country
            if(!billingInfo.country){ // Εδω κανονικα δεν πρεπει να μπει εφοσον αρχικοποιειται απο το /detect-country endpoint, μονο στην περιπτωση εξωτερικου call
                const forwarded = req.headers['x-forwarded-for'];
                const ip = forwarded
                    ? forwarded.split(',')[0].trim()
                    : req.ip;

                const ipRes = await fetch(`https://api.country.is/${ip}`);
                const data = await ipRes.json();

                if (data?.country) {
                    detectedCountry = data.country;
                }
            }
            else {
                detectedCountry = billingInfo.country
            }
        }

        // =============================================
        // 1. FETCH COMPANY
        // =============================================
        const { data: company, error: companyErr } = await supabase
            .from("companies")
            .select("stripe_customer_id")
            .eq("id", companyId)
            .single();

        if (companyErr || !company?.stripe_customer_id) {
            return res.status(400).json({
                success: false,
                message: "Δεν βρέθηκε λογαριασμός πληρωμών",
                code: "NO_STRIPE_CUSTOMER"
            });
        }

        // =============================================
        // 2. FETCH CURRENT SUBSCRIPTION
        // =============================================
        const { data: subscription, error: subErr } = await supabase
            .from("subscriptions")
            .select(`
                id,
                plan_id,
                billing_period,
                stripe_subscription_id,
                current_period_start,
                current_period_end,
                cancel_at_period_end,
                plans!inner (
                    id,
                    key,
                    name,
                    rank,
                    cached_price_monthly,
                    cached_price_yearly,
                    cached_currency,
                    stripe_price_id_monthly,
                    stripe_price_id_yearly
                )
            `)
            .eq("company_id", companyId)
            .in("billing_status", ["active", "trialing", "past_due"])
            .single();

        if (subErr || !subscription) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε ενεργή συνδρομή",
                code: "NO_ACTIVE_SUBSCRIPTION"
            });
        }

        // =============================================
        // 3. FETCH NEW PLAN
        // =============================================
        const { data: newPlan, error: planErr } = await supabase
            .from("plans")
            .select(`
                id,
                key,
                name,
                rank,
                cached_price_monthly,
                cached_price_yearly,
                cached_currency,
                stripe_price_id_monthly,
                stripe_price_id_yearly
            `)
            .eq("id", newPlanId)
            .single();

        if (planErr || !newPlan) {
            return res.status(404).json({
                success: false,
                message: "Το πλάνο δεν βρέθηκε",
                code: "PLAN_NOT_FOUND"
            });
        }

        // =============================================
        // 4. FETCH CURRENT SUBSCRIPTION ITEMS (stores & plugins)
        // =============================================
        const { data: subscriptionItems } = await supabase
            .from("subscription_items")
            .select(`
                item_type,
                quantity,
                unit_amount,
                plugin_key,
                stripe_subscription_item_id,
                plugins (key, name)
            `)
            .eq("subscription_id", subscription.id)
            .eq("status", "active");

        // =============================================
        // 5. CHECK IF DOWNGRADE
        // =============================================
        let warning = null;

        const isDowngrade = newPlan?.rank < subscription.plans?.rank;

        if (isDowngrade) {
            
            warning = {
                type: "downgrade",
                message: "Ορισμένες δυνατότητες ή πρόσθετα ενδέχεται να μην είναι διαθέσιμα στο νέο πλάνο.",
            };
            
        }

        // =============================================
        // 6. GET PLAN ITEM FOR STRIPE PREVIEW
        // =============================================
        const planItem = subscriptionItems?.find(i => i.item_type === 'plan');

        if (!planItem?.stripe_subscription_item_id) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε το plan item",
                code: "PLAN_ITEM_NOT_FOUND"
            });
        }

        // =============================================
        // 7. GET STRIPE INVOICE PREVIEW
        // =============================================
        const newPriceId = billingPeriod === "monthly"
            ? newPlan.stripe_price_id_monthly
            : newPlan.stripe_price_id_yearly;

        let previewDetails = {
            customer: company.stripe_customer_id,
            subscription: subscription.stripe_subscription_id,
            subscription_details: {
                items: [{
                    id: planItem.stripe_subscription_item_id,
                    price: newPriceId
                }],
                proration_behavior: "always_invoice"
            },
            // Εδώ ενεργοποιείς τον υπολογισμό για το preview
            automatic_tax: { enabled: true } 
        }

        // Before calling Stripe, validate the tax info
        if (billingInfo?.taxId) {
            const { valid: validPrefix } = validateTaxPrefix(detectedCountry, billingInfo.taxId);
            const { valid: validFormat } = validateEuVatFormat(detectedCountry, billingInfo.taxId);
            
            // If invalid, don't include tax_ids in the request
            if (!validPrefix || !validFormat) {
                billingInfo.taxId = null; // Skip tax_ids
            }
        }

        if(billingInfo) {
            
            const taxType = getTaxType(detectedCountry, billingInfo.taxId); 

            // Εδώ "προσομοιώνεις" τον πελάτη
            previewDetails.customer_details = {
                address: {
                    country: detectedCountry,
                },
                tax_ids: taxType?.value ? [taxType] : [],
            }
        }

        // const invoicePreview = await stripe.invoices.createPreview(previewDetails);
        let invoicePreview;
        try {
            invoicePreview = await stripe.invoices.createPreview(previewDetails);
        } catch (stripeError) {
            console.error("Stripe preview error:", stripeError.message);
            
            // If tax_id error, retry without tax_ids
            if (stripeError.param?.includes('tax_id')) {
                previewDetails.customer_details.tax_ids = [];
                invoicePreview = await stripe.invoices.createPreview(previewDetails);
            } else {
                throw stripeError; // Re-throw other errors
            }
        }
        
        // console.log(invoicePreview)
        // =============================================
        // 8. PARSE STRIPE RESPONSE
        // =============================================
        const subtotal = invoicePreview.subtotal / 100;
        const taxAmount = invoicePreview.total_taxes?.reduce((sum, t) => sum + t.amount, 0) / 100 || 0;
        const total = invoicePreview.total / 100;
        const taxPercent = subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) : 0;

        // =============================================
        // 9. CALCULATE CURRENT TOTALS (for display)
        // =============================================
        const currentPlanPrice = subscription.billing_period === "monthly"
            ? subscription.plans.cached_price_monthly
            : subscription.plans.cached_price_yearly;

        let currentStoresPrice = 0;
        let currentPluginsPrice = 0;

        subscriptionItems?.forEach(item => {
            if (item.item_type === "extra_store") {
                currentStoresPrice += (item.unit_amount || 0) * item.quantity;
            } else if (item.item_type === "plugin") {
                currentPluginsPrice += (item.unit_amount || 0);
            }
        });

        const currentSubtotal = (currentPlanPrice || 0) + currentStoresPrice + currentPluginsPrice;

        // =============================================
        // 10. CALCULATE NEW TOTALS (for display)
        // =============================================
        const newPlanPrice = billingPeriod === "monthly"
            ? newPlan.cached_price_monthly
            : newPlan.cached_price_yearly;

        // Stores & plugins παραμένουν ίδια - δεν αφαιρούνται αυτόματα
        const newStoresPrice = currentStoresPrice;
        const newPluginsPrice = currentPluginsPrice;

        const newSubtotal = (newPlanPrice || 0) + newStoresPrice + newPluginsPrice;

        // =============================================
        // 11. CALCULATE REMAINING DAYS
        // =============================================
        const now = new Date();
        const periodStart = new Date(subscription.current_period_start);
        const periodEnd = new Date(subscription.current_period_end);

        const totalDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
        const remainingDays = Math.max(0, Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)));

        // =============================================
        // 12. BUILD RESPONSE
        // =============================================
        const currency = {
            code: newPlan.cached_currency || "EUR",
            symbol: (newPlan.cached_currency || "EUR") === "EUR" ? "€" : newPlan.cached_currency
        };

        // Calculate VAT for current
        const currentVat = Number(((currentSubtotal * taxPercent) / 100).toFixed(2));
        const currentTotal = Number((currentSubtotal + currentVat).toFixed(2));

        // Calculate VAT for new
        const newVat = Number(((newSubtotal * taxPercent) / 100).toFixed(2));
        const newTotal = Number((newSubtotal + newVat).toFixed(2));

        // Proration from Stripe
        const prorationVat = Number(taxAmount.toFixed(2));
        const prorationTotal = Number(total.toFixed(2));

        const response = {
            currency,

            summary: {
                tax_percent: taxPercent
            },
            
            current: {
                plan: subscription.plans.name,
                billing_period: subscription.billing_period,
                breakdown: {
                    plan: currentPlanPrice || 0,
                    extra_stores: currentStoresPrice,
                    plugins: currentPluginsPrice
                },
                subtotal: currentSubtotal,
                vat: currentVat,
                total: currentTotal
            },

            new: {
                plan: newPlan.name,
                billing_period: billingPeriod,
                breakdown: {
                    plan: newPlanPrice || 0,
                    extra_stores: newStoresPrice,
                    plugins: newPluginsPrice
                },
                subtotal: newSubtotal,
                vat: newVat,
                total: newTotal
            },

            proration: {
                remaining_days: remainingDays,
                total_days: totalDays,
                amount: Number(subtotal.toFixed(2)),
                vat: prorationVat,
                total: prorationTotal,
                description: `Αναλογική χρέωση για ${remainingDays} ημέρες`
            }
        };

        if (warning) {
            response.warning = warning;
        }

        return res.json({
            success: true,
            message: "Επιτυχής υπολογισμός τιμών",
            data: response
        });

    } catch (err) {
        console.error("PLAN CHANGE PREVIEW ERROR:", err);
        return res.status(500).json({ 
            success: false, 
            message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', 
            code: "SERVER_ERROR" 
        });
    }
});

// ============================================
// POST /api/billing/change-plan
// ============================================
router.post("/change-plan", requireAuth, requireOwner, async (req, res) => {

    const { companyId } = req.user;
    const { planId, billingPeriod, paymentMethodId, billingInfo } = req.body;

    if (!planId || !billingPeriod) {
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    try {

        // FETCH CURRENT STRIPE CUSTOMER
        const { data: company, error: companyErr } = await supabase
            .from("companies")
            .select(`stripe_customer_id`)
            .eq("id", companyId)
            .single();

        if (companyErr || !company) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε εταιρεία",
                code: "COMPANY_NOT_FOUND"
            });
        }

        const stripeCustomerId = company.stripe_customer_id;

        // =============================================
        // HANDLE BILLING INFO
        // =============================================
        if (billingInfo) {
            const { name, taxId, address, city, postalCode, country } = billingInfo;

            const isEmpty = v => !v || !v.toString().trim();

            if (
                isEmpty(name) ||
                isEmpty(address) ||
                isEmpty(city) ||
                isEmpty(postalCode) ||
                isEmpty(country)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Λείπουν υποχρεωτικά στοιχεία τιμολόγησης",
                    code: "MISSING_BILLING_FIELDS"
                });
            }
            
            // =============================================
            // VALIDATE TAX ID (if provided)
            // =============================================
            let validatedTaxId = null;

            if (taxId && taxId.trim()) {
                const { valid: validPrefix, error: prefixError } = validateTaxPrefix(country, taxId);
                if (!validPrefix) {
                    return res.status(200).json({
                        success: false,
                        message: prefixError,
                        code: "PREFIX_COUNTRY_MISMATCH"
                    });
                }

                const { valid: validFormat, error: formatError } = validateEuVatFormat(country, taxId);
                if (!validFormat) {
                    return res.status(200).json({
                        success: false,
                        message: formatError,
                        code: "INVALID_EU_VAT_FORMAT"
                    });
                }

                validatedTaxId = taxId.trim().toUpperCase();
            }

            // =============================================
            // UPDATE STRIPE CUSTOMER
            // =============================================
            await stripe.customers.update(stripeCustomerId, {
                name,
                address: {
                    line1: address,
                    city,
                    postal_code: postalCode,
                    country
                }
            });

            // =============================================
            // HANDLE TAX ID
            // =============================================
            // First, delete all existing tax IDs
            const existingTaxIds = await stripe.customers.listTaxIds(stripeCustomerId);
            for (const existingTaxId of existingTaxIds.data) {
                await stripe.customers.deleteTaxId(stripeCustomerId, existingTaxId.id);
            }

            // Then add new one only if provided
            if (validatedTaxId) {
                const taxType = getTaxType(country, validatedTaxId);
                
                if (taxType?.type && taxType?.value) {
                    try {
                        await stripe.customers.createTaxId(stripeCustomerId, {
                            type: taxType.type,
                            value: taxType.value
                        });
                    } catch (taxError) {
                        console.error("Tax ID error:", taxError);
                    }
                }
            }

            // =============================================
            // SAVE TO BILLING_DETAILS TABLE
            // =============================================
            await supabase
                .from("billing_details")
                .update({ is_active: false })
                .eq("company_id", companyId)
                .eq("is_active", true);

            const { error: billingInsertError } = await supabase
                .from("billing_details")
                .insert({
                    company_id: companyId,
                    is_corporate: !!validatedTaxId,
                    billing_name: name.trim(),
                    tax_id: validatedTaxId,
                    tax_office: billingInfo.taxOffice?.trim() || null,
                    address: address.trim(),
                    city: city.trim(),
                    postal_code: postalCode.trim(),
                    country: country.trim(),
                    is_active: true
                });

            if (billingInsertError) {
                console.error('Failed to insert billing_details:', billingInsertError);
                return res.status(500).json({
                    success: false,
                    message: 'Σφάλμα κατά την αποθήκευση στοιχείων τιμολόγησης',
                    code: 'DB_ERROR'
                });
            }
        }

        // =============================================
        // 1. FETCH CURRENT SUBSCRIPTION
        // =============================================
        const { data: subscription, error: subErr } = await supabase
            .from("subscriptions")
            .select(`
                id,
                plan_id,
                billing_period,
                stripe_subscription_id,
                stripe_subscription_schedule_id
            `)
            .eq("company_id", companyId)
            .in("billing_status", ["active", "trialing", "past_due"])
            .single();

        if (subErr || !subscription) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε ενεργή συνδρομή",
                code: "NO_ACTIVE_SUBSCRIPTION"
            });
        }

        // Έλεγχος αν είναι ίδιο πλάνο
        if (subscription.plan_id === planId && subscription.billing_period === billingPeriod) {
            return res.status(400).json({
                success: false,
                message: "Έχετε ήδη αυτό το πλάνο",
                code: "SAME_PLAN"
            });
        }

        // Έλεγχος αν υπάρχει ήδη εκκρεμές downgrade - ακύρωσέ το
        if (subscription.stripe_subscription_schedule_id) {
            try {
                await stripe.subscriptionSchedules.release(
                    subscription.stripe_subscription_schedule_id
                );
            } catch (scheduleErr) {
                console.error("Failed to cancel schedule:", scheduleErr.message);
            }

            await supabase
                .from("subscriptions")
                .update({ 
                    stripe_subscription_schedule_id: null,
                    updated_at: new Date().toISOString()
                })
                .eq("id", subscription.id);

            // Update in-memory object so it doesn't try to release again later
            subscription.stripe_subscription_schedule_id = null;
        }

        // =============================================
        // 2. FETCH CURRENT PLAN DETAILS
        // =============================================
        const { data: currentPlan, error: currentPlanErr } = await supabase
            .from("plans")
            .select("key, rank, stripe_price_id_monthly, stripe_price_id_yearly")
            .eq("id", subscription.plan_id)
            .single();

        if (currentPlanErr || !currentPlan) {
            return res.status(404).json({
                success: false,
                message: "Το τρέχον πλάνο δεν βρέθηκε",
                code: "CURRENT_PLAN_NOT_FOUND"
            });
        }

        // =============================================
        // 3. FETCH NEW PLAN DETAILS
        // =============================================
        const { data: newPlan, error: planErr } = await supabase
            .from("plans")
            .select(`
                key,
                rank,
                stripe_price_id_monthly,
                stripe_price_id_yearly,
                is_free,
                included_branches
            `)
            .eq("id", planId)
            .single();

        if (planErr || !newPlan) {
            return res.status(404).json({
                success: false,
                message: "Το πλάνο δεν βρέθηκε",
                code: "PLAN_NOT_FOUND"
            });
        }

        // =============================================
        // HELPERS
        // =============================================
        const isSamePlan = newPlan.key === currentPlan.key;
        const isPlanChange = !isSamePlan;

        const isRankUpgrade = newPlan.rank > currentPlan.rank;
        const isRankDowngrade = newPlan.rank < currentPlan.rank;

        const isPeriodUpgrade =
            isSamePlan &&
            subscription.billing_period === "monthly" &&
            billingPeriod === "yearly";

        const isPeriodDowngrade =
            isSamePlan &&
            subscription.billing_period === "yearly" &&
            billingPeriod === "monthly";

        // =============================================
        // DECISION TREE
        // =============================================
        let action;

        if (isPlanChange) {
            if (isRankUpgrade) {
                action = "upgrade";
            } else if (isRankDowngrade) {
                action = "downgrade";
            } else {
                action = "lateral";
            }
        } else {
            if (isPeriodUpgrade) {
                action = "upgrade";
            } else if (isPeriodDowngrade) {
                action = "downgrade";
            } else {
                action = "noop";
            }
        }
        
        const newStripePriceId = billingPeriod === "monthly" 
            ? newPlan.stripe_price_id_monthly 
            : newPlan.stripe_price_id_yearly;

        const currentPriceId = subscription.billing_period === "monthly" 
            ? currentPlan.stripe_price_id_monthly 
            : currentPlan.stripe_price_id_yearly;

        // =============================================
        // GET PLAN ITEM (needed for both upgrade and downgrade)
        // =============================================
        const { data: planItem, error: itemErr } = await supabase
            .from("subscription_items")
            .select("id, stripe_subscription_item_id")
            .eq("subscription_id", subscription.id)
            .eq("item_type", "plan")
            .eq("status", "active")
            .single();

        if (itemErr || !planItem) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε το plan item",
                code: "PLAN_ITEM_NOT_FOUND"
            });
        }

        // =============================================
        // ACTION: UPGRADE (always immediate with payment)
        // =============================================
        if (action === "upgrade") {
            return await handleImmediatePlanChange(
                res, 
                subscription, 
                planItem,
                stripeCustomerId, 
                companyId, 
                planId, 
                billingPeriod, 
                newStripePriceId,
                paymentMethodId,
                newPlan.is_free
            );
        }

        // =============================================
        // ACTION: DOWNGRADE
        // =============================================
        if (action === "downgrade") {
            // Pre-check: warn if company has more stores than new plan allows
            const includedBranches = Math.max(1, newPlan.included_branches ?? 0);
            const { count: activeStoreCount } = await supabase
                .from("stores")
                .select("id", { count: "exact", head: true })
                .eq("company_id", companyId)
                .eq("is_active", true);
            const storesWarning = activeStoreCount > includedBranches
                ? "Τα επιπλέον καταστήματα θα απενεργοποιηθούν με τη μεταφορά στο νέο πλάνο."
                : null;

            // Get preview to check if payment is needed
            const previewInvoice = await stripe.invoices.createPreview({
                customer: stripeCustomerId,
                subscription: subscription.stripe_subscription_id,
                subscription_details: {
                    items: [{
                        id: planItem.stripe_subscription_item_id,
                        price: newStripePriceId
                    }],
                    proration_behavior: 'always_invoice'
                }
            });

            const amountDue = previewInvoice.amount_due;

            // If payment needed → immediate change
            if (amountDue > 0) {
                return await handleImmediatePlanChange(
                    res,
                    subscription,
                    planItem,
                    stripeCustomerId,
                    companyId,
                    planId,
                    billingPeriod,
                    newStripePriceId,
                    paymentMethodId,
                    false,
                    storesWarning
                );
            }

            // No payment needed → schedule for end of period
            return await handleScheduledDowngrade(
                res,
                subscription,
                stripeCustomerId,
                companyId,
                planId,
                billingPeriod,
                currentPriceId,
                newStripePriceId,
                storesWarning
            );
        }

        // =============================================
        // ACTION: LATERAL
        // =============================================
        if (action === "lateral") {
            return res.json({ 
                success: true, 
                message: "Lateral plan change" 
            });
        }

        // =============================================
        // ACTION: NOOP
        // =============================================
        return res.json({
            success: true,
            message: "No changes detected"
        });

    } catch (error) {
        console.error("CHANGE PLAN ERROR:", error);
        return res.status(500).json({ 
            success: false, 
            message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', 
            code: "SERVER_ERROR" 
        });
    }
});

router.post("/verify-upgrade", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;
    const { subscriptionId, invoiceId } = req.body;

    if (!subscriptionId) {
        return res.status(400).json({
            success: false,
            message: "Missing subscriptionId",
            code: "MISSING_PARAMETER"
        });
    }

    try {
        // =============================================
        // 1. RETRY LOGIC - Wait for Stripe to update status
        // =============================================
        let stripeSubscription;
        let attempts = 0;
        const maxAttempts = 5;
        const delayMs = 1000;

        while (attempts < maxAttempts) {
            stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            if (stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing') {
                break;
            }

            attempts++;
            console.log(`verify-upgrade: status=${stripeSubscription.status}, attempt ${attempts}/${maxAttempts}`);
            
            if (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        // =============================================
        // 2. CHECK FINAL STATUS
        // =============================================
        if (stripeSubscription.status !== 'active' && stripeSubscription.status !== 'trialing') {
            return res.json({
                success: false,
                message: "Η πληρωμή δεν ολοκληρώθηκε ακόμα",
                code: "NOT_ACTIVE",
                data: { status: stripeSubscription.status }
            });
        }

        // =============================================
        // 3. GET METADATA
        // =============================================
        const { planId, billingPeriod } = stripeSubscription.metadata;

        if (!planId || !billingPeriod) {
            return res.status(400).json({
                success: false,
                message: "Missing metadata in subscription",
                code: "MISSING_METADATA"
            });
        }

        // =============================================
        // 4. GET SUBSCRIPTION FROM DB
        // =============================================
        const { data: subscription, error: subErr } = await supabase
            .from('subscriptions')
            .select('id, plan_id')
            .eq('company_id', companyId)
            .eq('stripe_subscription_id', subscriptionId)
            .single();

        if (subErr || !subscription) {
            return res.status(404).json({
                success: false,
                message: "Subscription not found",
                code: "NOT_FOUND"
            });
        }

        // =============================================
        // 5. CHECK IF ALREADY UPDATED
        // =============================================
        if (subscription.plan_id === planId) {
            return res.json({
                success: true,
                message: "Η αναβάθμιση έχει ήδη ολοκληρωθεί"
            });
        }

        // =============================================
        // 6. FETCH NEW PLAN'S PRICE ID
        // =============================================
        const { data: newPlan } = await supabase
            .from('plans')
            .select('stripe_price_id_monthly, stripe_price_id_yearly')
            .eq('id', planId)
            .single();

        if (!newPlan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found",
                code: "PLAN_NOT_FOUND"
            });
        }

        const newStripePriceId = billingPeriod === 'monthly'
            ? newPlan.stripe_price_id_monthly
            : newPlan.stripe_price_id_yearly;

        // =============================================
        // 7. GET PLAN ITEM
        // =============================================
        const { data: planItem } = await supabase
            .from('subscription_items')
            .select('id')
            .eq('subscription_id', subscription.id)
            .eq('item_type', 'plan')
            .eq('status', 'active')
            .single();

        // =============================================
        // 8. SYNC PAYMENT METHOD TO CUSTOMER
        // =============================================
        if (stripeSubscription.default_payment_method) {
            try {
                await stripe.customers.update(stripeSubscription.customer, {
                    invoice_settings: { default_payment_method: stripeSubscription.default_payment_method }
                });
            } catch (pmErr) {
                console.error("Failed to sync payment method:", pmErr);
            }
        }

        // =============================================
        // 9. UPDATE DB USING HELPER
        // =============================================
        await handlePlanChangeSuccess(
            subscription.id,
            planId,
            billingPeriod,
            newStripePriceId,
            planItem?.id,
            companyId,
            invoiceId
        );

        console.log(`Upgrade verified for company ${companyId} to plan ${planId}`);

        return res.json({
            success: true,
            message: "Η αναβάθμιση επιβεβαιώθηκε"
        });

    } catch (error) {
        console.error("VERIFY UPGRADE ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Σφάλμα κατά την επιβεβαίωση",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// POST /api/billing/add-extra-store-preview
// ============================================
router.post("/add-extra-store-preview", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;
    const { billingInfo } = req.body;

    try {
        let detectedCountry = 'GR';
        if (billingInfo?.country) {
            detectedCountry = billingInfo.country;
        }

        const { data: company, error: companyErr } = await supabase
            .from('companies')
            .select('stripe_customer_id')
            .eq('id', companyId)
            .single();

        if (companyErr || !company?.stripe_customer_id) {
            return res.status(400).json({
                success: false,
                message: "Δεν βρέθηκε λογαριασμός πληρωμών",
                code: "NO_STRIPE_CUSTOMER"
            });
        }

        const { data: subscription, error: subErr } = await supabase
            .from('subscriptions')
            .select(`
                id,
                billing_period,
                stripe_subscription_id,
                current_period_start,
                current_period_end,
                plans (
                    id,
                    key,
                    stripe_extra_store_price_id_monthly,
                    stripe_extra_store_price_id_yearly,
                    cached_currency
                )
            `)
            .eq('company_id', companyId)
            .in('billing_status', ['active', 'trialing', 'past_due'])
            .maybeSingle();

        if (subErr || !subscription?.plans) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε ενεργή συνδρομή",
                code: "NO_ACTIVE_SUBSCRIPTION"
            });
        }

        const plan = subscription.plans;
        const planKey = (plan.key || '').toLowerCase();
        if (planKey === 'basic') {
            return res.status(403).json({
                success: false,
                message: "Δεν μπορείτε να προσθέσετε περισσότερα καταστήματα με το Basic πλάνο.",
                code: "PLAN_UPGRADE_REQUIRED"
            });
        }

        const extraPriceId = subscription.billing_period === 'yearly'
            ? plan.stripe_extra_store_price_id_yearly
            : plan.stripe_extra_store_price_id_monthly;

        if (!extraPriceId) {
            return res.status(400).json({
                success: false,
                message: "Το πλάνο δεν υποστηρίζει πρόσθετα καταστήματα",
                code: "NO_EXTRA_STORE_PRICE"
            });
        }

        const { data: extraStoreItem } = await supabase
            .from('subscription_items')
            .select('id, stripe_subscription_item_id, quantity')
            .eq('subscription_id', subscription.id)
            .eq('item_type', 'extra_store')
            .maybeSingle();

        const subscriptionItems = [];
        if (extraStoreItem) {
            subscriptionItems.push({
                id: extraStoreItem.stripe_subscription_item_id,
                quantity: (extraStoreItem.quantity || 0) + 1
            });
        } else {
            subscriptionItems.push({
                price: extraPriceId,
                quantity: 1
            });
        }

        let previewDetails = {
            customer: company.stripe_customer_id,
            subscription: subscription.stripe_subscription_id,
            subscription_details: {
                items: subscriptionItems,
                proration_behavior: 'always_invoice'
            },
            automatic_tax: { enabled: true }
        };

        if (billingInfo?.taxId) {
            const { valid: validPrefix } = validateTaxPrefix(detectedCountry, billingInfo.taxId);
            const { valid: validFormat } = validateEuVatFormat(detectedCountry, billingInfo.taxId);
            if (!validPrefix || !validFormat) {
                billingInfo.taxId = null;
            }
        }

        if (billingInfo) {
            const taxType = getTaxType(detectedCountry, billingInfo.taxId);
            previewDetails.customer_details = {
                address: { country: detectedCountry },
                tax_ids: taxType?.value ? [taxType] : []
            };
        }

        let invoicePreview;
        try {
            invoicePreview = await stripe.invoices.createPreview(previewDetails);
        } catch (stripeError) {
            console.error("Add extra store preview Stripe error:", stripeError.message);
            if (stripeError.param?.includes('tax_id') && previewDetails.customer_details) {
                previewDetails.customer_details.tax_ids = [];
                invoicePreview = await stripe.invoices.createPreview(previewDetails);
            } else {
                throw stripeError;
            }
        }

        const subtotal = invoicePreview.subtotal / 100;
        const taxAmount = invoicePreview.total_taxes?.reduce((sum, t) => sum + t.amount, 0) / 100 || 0;
        const total = invoicePreview.total / 100;
        const taxPercent = subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) : 0;

        const now = new Date();
        const periodStart = new Date(subscription.current_period_start);
        const periodEnd = new Date(subscription.current_period_end);
        const totalDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
        const remainingDays = Math.max(0, Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)));

        const currency = {
            code: plan.cached_currency || "EUR",
            symbol: (plan.cached_currency || "EUR") === "EUR" ? "€" : plan.cached_currency
        };

        return res.json({
            success: true,
            message: "Επιτυχής υπολογισμός τιμών",
            data: {
                currency,
                summary: { tax_percent: taxPercent },
                proration: {
                    remaining_days: remainingDays,
                    total_days: totalDays,
                    amount: Number(subtotal.toFixed(2)),
                    vat: Number(taxAmount.toFixed(2)),
                    total: Number(total.toFixed(2)),
                    description: `Αναλογική χρέωση για ${remainingDays} ημέρες`
                }
            }
        });
    } catch (err) {
        console.error("ADD EXTRA STORE PREVIEW ERROR:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Σφάλμα κατά τον υπολογισμό τιμών",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// POST /api/billing/add-extra-store
// ============================================
router.post("/add-extra-store", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;
    const store = req.body.store || req.body;
    const { paymentMethodId, billingInfo } = req.body;

    const name = store?.name || req.body.name;
    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το όνομα καταστήματος είναι υποχρεωτικό",
            code: "MISSING_NAME"
        });
    }

    const storePayload = {
        name: (name || '').trim(),
        address: store?.address ? String(store.address).trim() : null,
        city: store?.city ? String(store.city).trim() : null,
        postal_code: store?.postal_code ? String(store.postal_code).trim() : null,
        country: store?.country ? String(store.country).trim() : null,
        phone: store?.phone ? String(store.phone).trim() : null,
        email: store?.email ? String(store.email).trim() : null
    };

    try {
        const { data: company } = await supabase
            .from('companies')
            .select('stripe_customer_id')
            .eq('id', companyId)
            .single();

        const stripeCustomerId = company?.stripe_customer_id;

        if (stripeCustomerId) {
            if (paymentMethodId) {
                await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
                await stripe.customers.update(stripeCustomerId, {
                    invoice_settings: { default_payment_method: paymentMethodId }
                });
            }
            if (billingInfo) {
                const { name: bName, taxId, address, city, postalCode, country } = billingInfo;
                const isEmpty = v => !v || !v.toString().trim();
                if (!isEmpty(bName) && !isEmpty(address) && !isEmpty(city) && !isEmpty(postalCode) && !isEmpty(country)) {
                    await stripe.customers.update(stripeCustomerId, {
                        name: bName?.trim(),
                        address: { line1: address?.trim(), city: city?.trim(), postal_code: postalCode?.trim(), country: country?.trim() }
                    });
                    let validatedTaxId = null;
                    if (taxId && taxId.trim()) {
                        const { valid: vp } = validateTaxPrefix(country, taxId);
                        const { valid: vf } = validateEuVatFormat(country, taxId);
                        if (vp && vf) validatedTaxId = taxId.trim().toUpperCase();
                    }
                    if (validatedTaxId) {
                        const taxType = getTaxType(country, validatedTaxId);
                        if (taxType?.type && taxType?.value) {
                            const existing = await stripe.customers.listTaxIds(stripeCustomerId);
                            for (const t of existing.data) await stripe.customers.deleteTaxId(stripeCustomerId, t.id);
                            await stripe.customers.createTaxId(stripeCustomerId, { type: taxType.type, value: taxType.value });
                        }
                    }
                    await supabase.from('billing_details').update({ is_active: false }).eq('company_id', companyId).eq('is_active', true);
                    await supabase.from('billing_details').insert({
                        company_id: companyId,
                        is_corporate: !!validatedTaxId,
                        billing_name: (bName || '').trim(),
                        tax_id: validatedTaxId,
                        address: (address || '').trim(),
                        city: (city || '').trim(),
                        postal_code: (postalCode || '').trim(),
                        country: (country || '').trim(),
                        is_active: true
                    });
                }
            }
        }

        // Fetch subscription first – use it as source of truth for plan (Basic vs Pro/Business)
        const { data: subscription, error: subErr } = await supabase
            .from('subscriptions')
            .select(`
                id,
                billing_period,
                stripe_subscription_id,
                plans (
                    id,
                    key,
                    stripe_extra_store_price_id_monthly,
                    stripe_extra_store_price_id_yearly
                )
            `)
            .eq('company_id', companyId)
            .in('billing_status', ['active', 'trialing', 'past_due'])
            .maybeSingle();

        if (subErr || !subscription?.plans) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε ενεργή συνδρομή",
                code: "NO_ACTIVE_SUBSCRIPTION"
            });
        }

        const plan = subscription.plans;
        const planKey = (plan.key || '').toLowerCase();
        if (planKey === 'basic') {
            return res.status(403).json({
                success: false,
                message: "Δεν μπορείτε να προσθέσετε περισσότερα καταστήματα με το Basic πλάνο.",
                code: "PLAN_UPGRADE_REQUIRED"
            });
        }

        const capacity = await canAddStore(companyId);
        // Pro/Business: we already verified plan above. At limit = exactly when we buy extra via Stripe.
        // Only block if they have free slots (should use POST /company/stores instead).
        if (capacity.freeSlots > 0) {
            return res.status(400).json({
                success: false,
                message: "Υπάρχουν δωρεάν θέσεις. Χρησιμοποιήστε POST /company/stores.",
                code: "USE_FREE_STORES"
            });
        }

        const extraPriceId = subscription.billing_period === 'yearly'
            ? plan.stripe_extra_store_price_id_yearly
            : plan.stripe_extra_store_price_id_monthly;

        if (!extraPriceId) {
            return res.status(400).json({
                success: false,
                message: "Το πλάνο δεν υποστηρίζει πρόσθετα καταστήματα",
                code: "NO_EXTRA_STORE_PRICE"
            });
        }

        const { data: extraStoreItem } = await supabase
            .from('subscription_items')
            .select('id, stripe_subscription_item_id, quantity')
            .eq('subscription_id', subscription.id)
            .eq('item_type', 'extra_store')
            .maybeSingle();

        const stripeSubId = subscription.stripe_subscription_id;
        let stripeSubscription;

        if (extraStoreItem) {
            const newQuantity = (extraStoreItem.quantity || 0) + 1;
            await stripe.subscriptionItems.update(extraStoreItem.stripe_subscription_item_id, {
                quantity: newQuantity,
                proration_behavior: 'always_invoice'
            });
            stripeSubscription = await stripe.subscriptions.retrieve(stripeSubId, {
                expand: ['latest_invoice.confirmation_secret']
            });
        } else {
            stripeSubscription = await stripe.subscriptions.update(stripeSubId, {
                items: [{
                    price: extraPriceId,
                    quantity: 1
                }],
                proration_behavior: 'always_invoice',
                payment_behavior: 'default_incomplete',
                expand: ['latest_invoice.confirmation_secret']
            });
        }

        const latestInvoice = stripeSubscription.latest_invoice;
        if (!latestInvoice) {
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία τιμολογίου",
                code: "NO_INVOICE"
            });
        }

        if (latestInvoice.status === 'paid') {
            const createdStore = await createStoreWithPlugins(companyId, storePayload);
            await syncExtraStoreSubscriptionItem(subscription.id, stripeSubscription);
            return res.json({
                success: true,
                message: "Το κατάστημα δημιουργήθηκε επιτυχώς",
                data: { store: createdStore }
            });
        }

        if (latestInvoice.status === 'open') {
            const clientSecret = latestInvoice.confirmation_secret?.client_secret;
            if (!clientSecret) {
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά τη δημιουργία πληρωμής",
                    code: "NO_CLIENT_SECRET"
                });
            }

            const customer = await stripe.customers.retrieve(stripeSubscription.customer);
            const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method || null;

            return res.json({
                success: false,
                message: "Απαιτείται επιβεβαίωση πληρωμής",
                code: "REQUIRES_PAYMENT",
                data: {
                    clientSecret,
                    subscriptionId: stripeSubId,
                    invoiceId: latestInvoice.id,
                    paymentMethodId: defaultPaymentMethodId,
                    store: storePayload
                }
            });
        }

        return res.status(400).json({
            success: false,
            message: `Μη αναμενόμενη κατάσταση τιμολογίου: ${latestInvoice.status}`,
            code: "UNEXPECTED_INVOICE_STATUS"
        });
    } catch (err) {
        console.error("ADD EXTRA STORE ERROR:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Σφάλμα κατά την προσθήκη καταστήματος",
            code: "SERVER_ERROR"
        });
    }
});

async function createStoreWithPlugins(companyId, storePayload) {
    const { data: createdStore, error: storeErr } = await supabase
        .from('stores')
        .insert({
            company_id: companyId,
            name: storePayload.name,
            address: storePayload.address,
            city: storePayload.city,
            postal_code: storePayload.postal_code,
            country: storePayload.country,
            phone: storePayload.phone,
            email: storePayload.email,
            is_main: false,
            is_active: true
        })
        .select('id, name, address, city, postal_code, country, phone, email, is_main')
        .single();

    if (storeErr) throw { status: 500, code: "DB_ERROR", message: "Σφάλμα κατά τη δημιουργία καταστήματος" };

    const { data: companyPlugins } = await supabase
        .from('company_plugins')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'active');

    if (companyPlugins?.length > 0) {
        const storePluginsToInsert = companyPlugins.map(cp => ({
            company_plugin_id: cp.id,
            store_id: createdStore.id,
            settings: null,
            is_active: false
        }));
        await supabase.from('store_plugins').insert(storePluginsToInsert);
    }

    return createdStore;
}

async function syncExtraStoreSubscriptionItem(dbSubscriptionId, stripeSubscription) {
    const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan_id, billing_period')
        .eq('id', dbSubscriptionId)
        .single();
    if (!sub) return;

    const { data: plan } = await supabase
        .from('plans')
        .select('stripe_extra_store_price_id_monthly, stripe_extra_store_price_id_yearly')
        .eq('id', sub.plan_id)
        .single();
    if (!plan) return;

    const priceId = sub.billing_period === 'yearly'
        ? plan.stripe_extra_store_price_id_yearly
        : plan.stripe_extra_store_price_id_monthly;

    const extraStoreStripeItem = stripeSubscription.items?.data?.find(
        item => item.price?.id === priceId
    );
    if (!extraStoreStripeItem) return;

    const { data: existing } = await supabase
        .from('subscription_items')
        .select('id')
        .eq('subscription_id', dbSubscriptionId)
        .eq('item_type', 'extra_store')
        .maybeSingle();

    if (existing) {
        await supabase
            .from('subscription_items')
            .update({
                quantity: extraStoreStripeItem.quantity,
                stripe_subscription_item_id: extraStoreStripeItem.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
    } else {
        await supabase
            .from('subscription_items')
            .insert({
                subscription_id: dbSubscriptionId,
                item_type: 'extra_store',
                stripe_subscription_item_id: extraStoreStripeItem.id,
                stripe_price_id: priceId,
                quantity: extraStoreStripeItem.quantity,
                status: 'active'
            });
    }
}

// ============================================
// POST /api/billing/verify-add-extra-store
// ============================================
router.post("/verify-add-extra-store", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;
    const { subscriptionId, invoiceId, store } = req.body;

    if (!subscriptionId) {
        return res.status(400).json({
            success: false,
            message: "Λείπει το subscriptionId",
            code: "MISSING_PARAMETER"
        });
    }

    if (!store?.name) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν τα στοιχεία καταστήματος",
            code: "MISSING_STORE"
        });
    }

    const storePayload = {
        name: String(store.name).trim(),
        address: store.address ? String(store.address).trim() : null,
        city: store.city ? String(store.city).trim() : null,
        postal_code: store.postal_code ? String(store.postal_code).trim() : null,
        country: store.country ? String(store.country).trim() : null,
        phone: store.phone ? String(store.phone).trim() : null,
        email: store.email ? String(store.email).trim() : null
    };

    try {
        let stripeSubscription;
        let attempts = 0;
        const maxAttempts = 5;
        const delayMs = 1000;

        while (attempts < maxAttempts) {
            stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
            if (stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing') break;
            attempts++;
            if (attempts < maxAttempts) await new Promise(r => setTimeout(r, delayMs));
        }

        if (stripeSubscription.status !== 'active' && stripeSubscription.status !== 'trialing') {
            return res.json({
                success: false,
                message: "Η πληρωμή δεν ολοκληρώθηκε ακόμα",
                code: "NOT_ACTIVE"
            });
        }

        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('company_id', companyId)
            .eq('stripe_subscription_id', subscriptionId)
            .single();

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε συνδρομή",
                code: "NOT_FOUND"
            });
        }

        const createdStore = await createStoreWithPlugins(companyId, storePayload);
        await syncExtraStoreSubscriptionItem(subscription.id, stripeSubscription);

        return res.json({
            success: true,
            message: "Το κατάστημα δημιουργήθηκε επιτυχώς",
            data: { store: createdStore }
        });
    } catch (err) {
        console.error("VERIFY ADD EXTRA STORE ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Σφάλμα κατά την επιβεβαίωση",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// POST /api/billing/reactivate-store
// ============================================
router.post("/reactivate-store", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;
    const { storeId } = req.body;

    if (!storeId) {
        return res.status(400).json({
            success: false,
            message: "Λείπει το storeId",
            code: "MISSING_STORE_ID"
        });
    }

    try {
        const { data: store, error: storeErr } = await supabase
            .from('stores')
            .select('id, is_main, is_active')
            .eq('id', storeId)
            .eq('company_id', companyId)
            .single();

        if (storeErr || !store) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε το κατάστημα",
                code: "STORE_NOT_FOUND"
            });
        }

        if (store.is_main) {
            return res.status(400).json({
                success: false,
                message: "Δεν μπορείτε να επαναφέρετε το κεντρικό κατάστημα",
                code: "CANNOT_REACTIVATE_MAIN"
            });
        }

        if (store.is_active === true) {
            return res.status(400).json({
                success: false,
                message: "Το κατάστημα είναι ήδη ενεργό",
                code: "STORE_ALREADY_ACTIVE"
            });
        }

        const capacity = await canAddStore(companyId);
        if (!capacity.allowed) {
            const msg = capacity.reason === 'PLAN_UPGRADE_REQUIRED'
                ? "Δεν μπορείτε να επαναφέρετε περισσότερα καταστήματα με το τρέχον πλάνο. Αναβαθμίστε για πρόσβαση."
                : "Έχετε φτάσει το όριο καταστημάτων.";
            return res.status(403).json({
                success: false,
                message: msg,
                code: capacity.reason || "PLAN_STORE_LIMIT"
            });
        }

        if (capacity.freeSlots > 0) {
            const { error: updateErr } = await supabase
                .from('stores')
                .update({ is_active: true })
                .eq('id', storeId)
                .eq('company_id', companyId);
            if (updateErr) {
                console.error("Reactivate store (free) error:", updateErr);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την επαναφορά",
                    code: "DB_ERROR"
                });
            }
            return res.json({
                success: true,
                message: "Το κατάστημα επαναφέρθηκε επιτυχώς",
                data: { storeId }
            });
        }

        if (!capacity.needsPayment) {
            return res.status(403).json({
                success: false,
                message: "Δεν μπορείτε να επαναφέρετε περισσότερα καταστήματα",
                code: "PLAN_STORE_LIMIT"
            });
        }

        const { data: subscription, error: subErr } = await supabase
            .from('subscriptions')
            .select(`
                id,
                billing_period,
                stripe_subscription_id,
                plans (
                    id,
                    key,
                    stripe_extra_store_price_id_monthly,
                    stripe_extra_store_price_id_yearly
                )
            `)
            .eq('company_id', companyId)
            .in('billing_status', ['active', 'trialing', 'past_due'])
            .maybeSingle();

        if (subErr || !subscription?.plans) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε ενεργή συνδρομή",
                code: "NO_ACTIVE_SUBSCRIPTION"
            });
        }

        const plan = subscription.plans;
        const planKey = (plan.key || '').toLowerCase();
        if (planKey === 'basic') {
            return res.status(403).json({
                success: false,
                message: "Δεν μπορείτε να επαναφέρετε περισσότερα καταστήματα με το Basic πλάνο.",
                code: "PLAN_UPGRADE_REQUIRED"
            });
        }

        const extraPriceId = subscription.billing_period === 'yearly'
            ? plan.stripe_extra_store_price_id_yearly
            : plan.stripe_extra_store_price_id_monthly;

        if (!extraPriceId) {
            return res.status(400).json({
                success: false,
                message: "Το πλάνο δεν υποστηρίζει πρόσθετα καταστήματα",
                code: "NO_EXTRA_STORE_PRICE"
            });
        }

        const { data: extraStoreItem } = await supabase
            .from('subscription_items')
            .select('id, stripe_subscription_item_id, quantity')
            .eq('subscription_id', subscription.id)
            .eq('item_type', 'extra_store')
            .maybeSingle();

        const stripeSubId = subscription.stripe_subscription_id;
        let stripeSubscription;

        if (extraStoreItem) {
            const newQuantity = (extraStoreItem.quantity || 0) + 1;
            await stripe.subscriptionItems.update(extraStoreItem.stripe_subscription_item_id, {
                quantity: newQuantity,
                proration_behavior: 'always_invoice'
            });
            stripeSubscription = await stripe.subscriptions.retrieve(stripeSubId, {
                expand: ['latest_invoice.confirmation_secret']
            });
        } else {
            stripeSubscription = await stripe.subscriptions.update(stripeSubId, {
                items: [{
                    price: extraPriceId,
                    quantity: 1
                }],
                proration_behavior: 'always_invoice',
                payment_behavior: 'default_incomplete',
                expand: ['latest_invoice.confirmation_secret']
            });
        }

        const latestInvoice = stripeSubscription.latest_invoice;
        if (!latestInvoice) {
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία τιμολογίου",
                code: "NO_INVOICE"
            });
        }

        if (latestInvoice.status === 'paid') {
            await supabase
                .from('stores')
                .update({ is_active: true })
                .eq('id', storeId)
                .eq('company_id', companyId);
            await syncExtraStoreSubscriptionItem(subscription.id, stripeSubscription);
            return res.json({
                success: true,
                message: "Το κατάστημα επαναφέρθηκε επιτυχώς",
                data: { storeId }
            });
        }

        if (latestInvoice.status === 'open') {
            const clientSecret = latestInvoice.confirmation_secret?.client_secret;
            if (!clientSecret) {
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά τη δημιουργία πληρωμής",
                    code: "NO_CLIENT_SECRET"
                });
            }

            const customer = await stripe.customers.retrieve(stripeSubscription.customer);
            const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method || null;

            return res.json({
                success: false,
                message: "Απαιτείται επιβεβαίωση πληρωμής",
                code: "REQUIRES_PAYMENT",
                data: {
                    clientSecret,
                    subscriptionId: stripeSubId,
                    invoiceId: latestInvoice.id,
                    paymentMethodId: defaultPaymentMethodId,
                    storeId
                }
            });
        }

        return res.status(400).json({
            success: false,
            message: `Μη αναμενόμενη κατάσταση τιμολογίου: ${latestInvoice.status}`,
            code: "UNEXPECTED_INVOICE_STATUS"
        });
    } catch (err) {
        console.error("REACTIVATE STORE ERROR:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Σφάλμα κατά την επαναφορά καταστήματος",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// POST /api/billing/verify-reactivate-store
// ============================================
router.post("/verify-reactivate-store", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;
    const { subscriptionId, invoiceId, storeId } = req.body;

    if (!subscriptionId || !storeId) {
        return res.status(400).json({
            success: false,
            message: "Λείπει subscriptionId ή storeId",
            code: "MISSING_PARAMETER"
        });
    }

    try {
        let stripeSubscription;
        let attempts = 0;
        const maxAttempts = 5;
        const delayMs = 1000;

        while (attempts < maxAttempts) {
            stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
            if (stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing') break;
            attempts++;
            if (attempts < maxAttempts) await new Promise(r => setTimeout(r, delayMs));
        }

        if (stripeSubscription.status !== 'active' && stripeSubscription.status !== 'trialing') {
            return res.json({
                success: false,
                message: "Η πληρωμή δεν ολοκληρώθηκε ακόμα",
                code: "NOT_ACTIVE"
            });
        }

        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('company_id', companyId)
            .eq('stripe_subscription_id', subscriptionId)
            .single();

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε συνδρομή",
                code: "NOT_FOUND"
            });
        }

        const { data: store, error: storeErr } = await supabase
            .from('stores')
            .select('id')
            .eq('id', storeId)
            .eq('company_id', companyId)
            .single();

        if (storeErr || !store) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε το κατάστημα",
                code: "STORE_NOT_FOUND"
            });
        }

        await supabase
            .from('stores')
            .update({ is_active: true })
            .eq('id', storeId)
            .eq('company_id', companyId);
        await syncExtraStoreSubscriptionItem(subscription.id, stripeSubscription);

        return res.json({
            success: true,
            message: "Το κατάστημα επαναφέρθηκε επιτυχώς",
            data: { storeId }
        });
    } catch (err) {
        console.error("VERIFY REACTIVATE STORE ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Σφάλμα κατά την επιβεβαίωση",
            code: "SERVER_ERROR"
        });
    }
});

router.post("/setup-intent", requireAuth, requireOwner, async (req, res) => {

    const { companyId } = req.user;

    const { data: company } = await supabase
        .from("companies")
        .select("stripe_customer_id")
        .eq("id", companyId)
        .single();

    const setupIntent = await stripe.setupIntents.create({
        customer: company.stripe_customer_id,
        payment_method_types: ["card"],
        usage: "off_session",
    });

    res.json({
        success: true,
        message: "",
        data: {
            clientSecret: setupIntent.client_secret,
        }
    });
});

router.get('/detect-country', requireAuth, async (req, res) => {
    
    let detectedCountry = 'GR';

    try {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded
            ? forwarded.split(',')[0].trim()
            : req.ip;

        const ipRes = await fetch(`https://api.country.is/${ip}`);
        const data = await ipRes.json();

        if (data?.country) {
            detectedCountry = data.country;
        }

        return res.json({
            success: true,
            data: { country: detectedCountry }
        });
        
    } catch {
        return res.json({
            success: true,
            data: { country: 'GR' }
        });
    }
});

// router.post("/update-customer-country", requireAuth, requireOwner, async (req, res) => {
//     const { companyId } = req.user;
//     const { country } = req.body;

//     const { data: company } = await supabase
//         .from("companies")
//         .select("stripe_customer_id")
//         .eq("id", companyId)
//         .single();

//     if (company?.stripe_customer_id) {
//         await stripe.customers.update(company.stripe_customer_id, {
//             address: { country }
//         });
//     }

//     return res.json({ success: true });
// });

router.get('/subscription', requireAuth, requireOwner, async (req, res) => {
    try {
        const { companyId } = req.user;

        const { data: subscription, error } = await supabase
            .from("subscriptions")
            .select(`
                plan_id,
                billing_period,
                billing_status,
                current_period_end,
                cancel_at_period_end,
                stripe_subscription_id,
                stripe_subscription_schedule_id
            `)
            .eq("company_id", companyId)
            .single();

        if (error) {
            console.error("SUBSCRIPTION SELECT ERROR:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση της συνδρομής",
                code: "DB_ERROR"
            });
        }

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε συνδρομή",
                code: "SUBSCRIPTION_NOT_FOUND"
            });
        }

        // =============================================
        // FETCH CARD FROM STRIPE
        // =============================================
        let cardBrand = null;
        let cardLast4 = null;
        let cardExpMonth = null;
        let cardExpYear = null;

        if (subscription.stripe_subscription_id) {
            try {
                const stripeSubscription = await stripe.subscriptions.retrieve(
                    subscription.stripe_subscription_id,
                    { expand: ['default_payment_method'] }
                );
                
                const paymentMethod = stripeSubscription.default_payment_method;
                if (paymentMethod?.card) {
                    cardBrand = paymentMethod.card.brand;
                    cardLast4 = paymentMethod.card.last4;
                    cardExpMonth = paymentMethod.card.exp_month;
                    cardExpYear = paymentMethod.card.exp_year;
                }
            } catch (stripeErr) {
                console.error("Error fetching Stripe subscription:", stripeErr);
            }
        }

        // =============================================
        // FETCH SCHEDULED PLAN INFO FROM STRIPE SCHEDULE
        // =============================================
        let scheduledPlanName = null;
        let scheduledBillingPeriod = null;

        if (subscription.stripe_subscription_schedule_id) {
            try {
                const schedule = await stripe.subscriptionSchedules.retrieve(
                    subscription.stripe_subscription_schedule_id
                );

                // Phase 1 (index 1) is the scheduled new plan
                if (schedule.phases && schedule.phases.length > 1) {
                    const pendingPhase = schedule.phases[1];
                    const pendingPriceId = pendingPhase.items[0]?.price;

                    if (pendingPriceId) {
                        // Find the plan by price ID
                        const { data: pendingPlan } = await supabase
                            .from('plans')
                            .select('name, stripe_price_id_monthly, stripe_price_id_yearly')
                            .or(`stripe_price_id_monthly.eq.${pendingPriceId},stripe_price_id_yearly.eq.${pendingPriceId}`)
                            .single();

                        if (pendingPlan) {
                            scheduledPlanName = pendingPlan.name;
                            scheduledBillingPeriod = pendingPlan.stripe_price_id_monthly === pendingPriceId 
                                ? 'monthly' 
                                : 'yearly';
                        }
                    }
                }
            } catch (scheduleErr) {
                console.error("Error fetching Stripe schedule:", scheduleErr);
            }
        }

        // =============================================
        // FETCH COMPANY USERS COUNT
        // =============================================
        const { count, error: cuError } = await supabase
            .from('company_users')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'active');

        if (cuError) {
            console.error("COMPANY USERS SELECT ERROR:", cuError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση της χρηστών σε εταιρεία",
                code: "DB_ERROR"
            });
        }

        // =============================================
        // FETCH STORE PRODUCTS COUNT
        // =============================================
        const { data: storeProducts, error: storeProductsError } = await supabase
            .from('store_products')
            .select(`
                product_id,
                stores!inner(company_id)
            `)
            .eq('stores.company_id', companyId);

        if (storeProductsError) {
            console.error("STORE PRODUCTS SELECT ERROR:", storeProductsError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση προϊόντων ανά κατάστημα",
                code: "DB_ERROR"
            });
        }

        const uniqueProductsCount = new Set(
            storeProducts.map(row => row.product_id)
        ).size;

        // =============================================
        // FETCH BILLING DETAILS (not from companies table)
        // =============================================
        const { data: billingDetails, error: billingError } = await supabase
            .from("billing_details")
            .select(`
                billing_name,
                tax_id,
                tax_office,
                address,
                city,
                postal_code,
                country
            `)
            .eq("company_id", companyId)
            .eq("is_active", true)
            .maybeSingle();

        if (billingError) {
            console.error("BILLING DETAILS SELECT ERROR:", billingError);
        }

        return res.json({
            success: true,
            message: "Επιτυχής λήψη στοιχείων συνδρομής",
            data: {
                plan_id: subscription.plan_id,
                billing_period: subscription.billing_period,
                billing_status: subscription.billing_status,
                current_period_end: subscription.current_period_end,
                cancel_at_period_end: subscription.cancel_at_period_end,
                company_users_count: count,
                store_products_count: uniqueProductsCount,
                scheduled_plan_name: scheduledPlanName,
                scheduled_billing_period: scheduledBillingPeriod,
                card: cardLast4 ? { 
                    brand: cardBrand, 
                    last4: cardLast4,
                    exp_month: String(cardExpMonth).padStart(2, '0'),
                    exp_year: cardExpYear
                } : null,
                billingInfo: billingDetails ? {
                    name: billingDetails.billing_name,
                    taxId: billingDetails.tax_id,
                    taxOffice: billingDetails.tax_office,
                    address: billingDetails.address,
                    city: billingDetails.city,
                    postalCode: billingDetails.postal_code,
                    country: billingDetails.country
                } : null
            }
        });

    } catch (err) {
        console.error("GET SUBSCRIPTION ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});


router.get('/billing-info', requireAuth, requireOwner, async (req, res) => {
    try {
        const { companyId } = req.user;

        // 1. Get subscription with items
        const { data: subscription, error: subError } = await supabase
            .from("subscriptions")
            .select(`
                id,
                stripe_subscription_id,
                billing_period,
                current_period_end,
                cancel_at_period_end,
                currency,
                plans (
                    name
                )
            `)
            .eq("company_id", companyId)
            .single();

        if (subError || !subscription) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε συνδρομή",
                code: "SUBSCRIPTION_NOT_FOUND"
            });
        }

        // 2. Get subscription items
        const { data: items, error: itemsError } = await supabase
            .from("subscription_items")
            .select(`
                item_type,
                plugin_key,
                quantity,
                unit_amount,
                plugins (
                    name
                )
            `)
            .eq("subscription_id", subscription.id)
            .eq("status", "active");

        if (itemsError) {
            console.error("SUBSCRIPTION ITEMS ERROR:", itemsError);
        }

        // 3. Get billing info: prefer billing_details (where onboarding/plan-change saves),
        //    fall back to companies, then Stripe Customer address
        const { data: billingDetails, error: bdError } = await supabase
            .from("billing_details")
            .select("billing_name, tax_id, tax_office, address, city, postal_code, country")
            .eq("company_id", companyId)
            .eq("is_active", true)
            .maybeSingle();

        const { data: company, error: companyError } = await supabase
            .from("companies")
            .select("name, tax_id, address, city, postal_code, country, stripe_customer_id")
            .eq("id", companyId)
            .single();

        // 4. Fallback: get address from Stripe Customer when DB has nulls
        let stripeAddress = null;
        if (company?.stripe_customer_id) {
            try {
                const stripeCustomer = await stripe.customers.retrieve(company.stripe_customer_id);
                if (stripeCustomer?.address?.line1 || stripeCustomer?.address?.country) {
                    stripeAddress = {
                        name: stripeCustomer.name,
                        address: stripeCustomer.address?.line1 || null,
                        city: stripeCustomer.address?.city || null,
                        postalCode: stripeCustomer.address?.postal_code || null,
                        country: stripeCustomer.address?.country || null
                    };
                }
            } catch (stripeErr) {
                console.error("STRIPE CUSTOMER RETRIEVE ERROR:", stripeErr);
            }
        }

        // 5. Merge billing info: billing_details > company > Stripe (per-field fallback)
        const name = billingDetails?.billing_name?.trim() || company?.name?.trim() || stripeAddress?.name?.trim();
        const billingInfo = name ? {
            name,
            taxId: billingDetails?.tax_id ?? company?.tax_id ?? null,
            address: billingDetails?.address ?? company?.address ?? stripeAddress?.address ?? null,
            city: billingDetails?.city ?? company?.city ?? stripeAddress?.city ?? null,
            postalCode: billingDetails?.postal_code ?? company?.postal_code ?? stripeAddress?.postalCode ?? null,
            country: billingDetails?.country ?? company?.country ?? stripeAddress?.country ?? null
        } : null;

        // 6. Get payment method from Stripe (if exists)
        let paymentMethod = null;
        if (subscription.stripe_subscription_id) {
            try {
                const stripeSubscription = await stripe.subscriptions.retrieve(
                    subscription.stripe_subscription_id
                );
                
                if (stripeSubscription.default_payment_method) {
                    const pm = await stripe.paymentMethods.retrieve(
                        stripeSubscription.default_payment_method
                    );
                    
                    if (pm.card) {
                        paymentMethod = {
                            brand: pm.card.brand,
                            last4: pm.card.last4,
                            exp_month: String(pm.card.exp_month).padStart(2, '0'),
                            exp_year: pm.card.exp_year
                        };
                    }
                }
            } catch (stripeErr) {
                console.error("STRIPE PAYMENT METHOD ERROR:", stripeErr);
            }
        }

        // 5. Format items for response
        const formattedItems = (items || []).map(item => ({
            item_type: item.item_type,
            name: item.item_type === 'plan' 
                ? subscription.plans?.name 
                : item.item_type === 'plugin' 
                    ? item.plugins?.name 
                    : 'Extra κατάστημα',
            plugin_key: item.plugin_key,
            quantity: item.quantity,
            unit_amount: parseFloat(item.unit_amount) || 0
        }));

        // 6. Calculate next billing amount
        const nextBillingAmount = formattedItems.reduce(
            (sum, item) => sum + (item.unit_amount * item.quantity), 
            0
        );

        return res.json({
            success: true,
            data: {
                items: formattedItems,
                payment_method: paymentMethod,
                billing_info: billingInfo,
                billing_period: subscription.billing_period || 'monthly',
                next_billing: {
                    amount: nextBillingAmount,
                    date: subscription.current_period_end
                },
                currency: subscription.currency === 'eur' ? '€' : subscription.currency,
                cancel_at_period_end: subscription.cancel_at_period_end
            }
        });

    } catch (err) {
        console.error("GET BILLING DETAILS ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

router.post("/update-payment-method", requireAuth, requireOwner, async (req, res) => {
    try {
        const { companyId } = req.user;
        const { paymentMethodId } = req.body;

        if (!paymentMethodId) {
            return res.status(400).json({
                success: false,
                message: "Δεν δόθηκε μέθοδος πληρωμής",
                code: "MISSING_PAYMENT_METHOD"
            });
        }

        // 1. Πάρε το stripe_customer_id από company
        const { data: company, error: companyErr } = await supabase
            .from("companies")
            .select("stripe_customer_id")
            .eq("id", companyId)
            .single();

        if (companyErr || !company) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε εταιρεία",
                code: "COMPANY_NOT_FOUND"
            });
        }

        if (!company.stripe_customer_id) {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχει λογαριασμός πληρωμών",
                code: "NO_STRIPE_CUSTOMER"
            });
        }

        // 2. Attach payment method στον customer
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: company.stripe_customer_id
        });

        // 3. Όρισε ως default payment method
        await stripe.customers.update(company.stripe_customer_id, {
            invoice_settings: { default_payment_method: paymentMethodId }
        });

        // 4. Ενημέρωσε και το subscription αν υπάρχει
        const { data: subscription } = await supabase
            .from("subscriptions")
            .select("stripe_subscription_id")
            .eq("company_id", companyId)
            .in("billing_status", ["active", "trialing"])
            .single();

        if (subscription?.stripe_subscription_id) {
            await stripe.subscriptions.update(subscription.stripe_subscription_id, {
                default_payment_method: paymentMethodId
            });
        }

        return res.json({
            success: true,
            message: "Η μέθοδος πληρωμής ενημερώθηκε επιτυχώς"
        });

    } catch (error) {
        console.error("UPDATE PAYMENT METHOD ERROR:", error);

        // Handle specific Stripe errors
        if (error.type === 'StripeCardError') {
            return res.status(400).json({
                success: false,
                message: error.message || "Η κάρτα απορρίφθηκε",
                code: "CARD_ERROR"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Αποτυχία ενημέρωσης μεθόδου πληρωμής",
            code: "SERVER_ERROR"
        });
    }
});

router.post('/update-billing-info', requireAuth, requireOwner, async (req, res) => {
    try {
        const { companyId } = req.user;
        const { name, taxId, address, city, postalCode, country } = req.body;

        if (!name || !address || !city || !postalCode || !country) {
            return res.status(400).json({
                success: false,
                message: "Συμπληρώστε τα υποχρεωτικά πεδία",
                code: "MISSING_FIELDS"
            });
        }

        // 1. Get stripe_customer_id
        const { data: company, error: companyErr } = await supabase
            .from("companies")
            .select("stripe_customer_id")
            .eq("id", companyId)
            .single();

        if (companyErr || !company) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε εταιρεία",
                code: "COMPANY_NOT_FOUND"
            });
        }

        // 2. Update Stripe Customer
        if (company.stripe_customer_id) {
            await stripe.customers.update(company.stripe_customer_id, {
                name,
                address: {
                    line1: address,
                    city,
                    postal_code: postalCode,
                    country
                }
            });

            // 3. Handle Tax ID
            if (taxId) {
                // Διαγραφή παλιών tax IDs
                const existingTaxIds = await stripe.customers.listTaxIds(company.stripe_customer_id);
                for (const existingTaxId of existingTaxIds.data) {
                    await stripe.customers.deleteTaxId(company.stripe_customer_id, existingTaxId.id);
                }

                // Προσθήκη νέου
                const taxType = getTaxType(country, taxId);

                if (taxType) {
                    try {
                        await stripe.customers.createTaxId(company.stripe_customer_id, {
                            type: taxType.type,
                            value: taxType.value
                        });
                    } catch (taxError) {
                        console.error("Tax ID error:", taxError);
                    }
                }
            }
        }

        // 4. Update companies table
        const { error: updateErr } = await supabase
            .from("companies")
            .update({
                name,
                tax_id: taxId || null,
                address,
                city,
                postal_code: postalCode,
                country
            })
            .eq("id", companyId);

        if (updateErr) {
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση",
                code: "DB_ERROR"
            });
        }

        // 5. Upsert billing_details (keep in sync for GET /billing-info)
        await supabase
            .from("billing_details")
            .update({ is_active: false })
            .eq("company_id", companyId)
            .eq("is_active", true);

        const { error: billingInsertErr } = await supabase
            .from("billing_details")
            .insert({
                company_id: companyId,
                is_corporate: !!taxId,
                billing_name: name.trim(),
                tax_id: taxId || null,
                address: address.trim(),
                city: city.trim(),
                postal_code: postalCode.trim(),
                country: country.trim(),
                is_active: true
            });

        if (billingInsertErr) {
            console.error("BILLING_DETAILS INSERT ERROR:", billingInsertErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την αποθήκευση στοιχείων τιμολόγησης. Δοκιμάστε ξανά.",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            message: "Τα στοιχεία ενημερώθηκαν επιτυχώς"
        });

    } catch (err) {
        console.error("UPDATE BILLING INFO ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});




// ============================================
// POST /api/billing/cancel-downgrade
// ============================================
router.post("/cancel-downgrade", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;

    try {
        // =============================================
        // 1. FETCH CURRENT SUBSCRIPTION
        // =============================================
        const { data: subscription, error: subErr } = await supabase
            .from("subscriptions")
            .select(`
                id,
                stripe_subscription_id,
                stripe_subscription_schedule_id
            `)
            .eq("company_id", companyId)
            .in("billing_status", ["active", "trialing", "past_due"])
            .single();

        if (subErr || !subscription) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε ενεργή συνδρομή",
                code: "NO_ACTIVE_SUBSCRIPTION"
            });
        }

        // =============================================
        // 2. CHECK IF THERE'S A PENDING DOWNGRADE
        // =============================================
        if (!subscription.stripe_subscription_schedule_id) {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχει προγραμματισμένη αλλαγή πλάνου",
                code: "NO_PENDING_DOWNGRADE"
            });
        }

        // =============================================
        // 3. RELEASE THE SCHEDULE (not cancel!)
        // release() keeps the subscription on current plan
        // cancel() cancels the entire subscription
        // =============================================
        try {
            await stripe.subscriptionSchedules.release(
                subscription.stripe_subscription_schedule_id
            );
            console.log(`Released schedule: ${subscription.stripe_subscription_schedule_id}`);
        } catch (releaseErr) {
            console.error("Failed to release schedule:", releaseErr.message);
            // DON'T fallback to cancel() - it cancels the subscription!
            // Just continue and clear from DB
        }

        // =============================================
        // 4. UPDATE DATABASE
        // =============================================
        await supabase
            .from("subscriptions")
            .update({
                stripe_subscription_schedule_id: null,
                updated_at: new Date().toISOString()
            })
            .eq("id", subscription.id);

        console.log(`Scheduled downgrade canceled for company ${companyId}`);

        return res.json({
            success: true,
            message: "Η προγραμματισμένη αλλαγή πλάνου ακυρώθηκε"
        });

    } catch (error) {
        console.error("CANCEL DOWNGRADE ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή. Προσπαθήστε ξανά.",
            code: "SERVER_ERROR"
        });
    }
});

router.post("/cancel-subscription", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;
    const userId = req.user.id;
    const { cancelImmediately = false } = req.body;

    try {
        // =============================================
        // 1. FETCH CURRENT SUBSCRIPTION
        // =============================================
        const { data: subscription, error: subErr } = await supabase
            .from("subscriptions")
            .select(`
                id,
                stripe_subscription_id,
                stripe_subscription_schedule_id,
                current_period_end
            `)
            .eq("company_id", companyId)
            .in("billing_status", ["active", "trialing", "past_due"])
            .single();

        if (subErr || !subscription) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε ενεργή συνδρομή",
                code: "NO_ACTIVE_SUBSCRIPTION"
            });
        }

        if (!subscription.stripe_subscription_id) {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχει ενεργή συνδρομή Stripe",
                code: "NO_STRIPE_SUBSCRIPTION"
            });
        }

        // =============================================
        // 2. RELEASE PENDING SCHEDULE IF EXISTS
        // =============================================
        if (subscription.stripe_subscription_schedule_id) {
            try {
                await stripe.subscriptionSchedules.release(
                    subscription.stripe_subscription_schedule_id
                );

                await supabase
                    .from("subscriptions")
                    .update({
                        stripe_subscription_schedule_id: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", subscription.id);
            } catch (scheduleErr) {
                console.error("Failed to cancel schedule:", scheduleErr);
            }
        }

        // =============================================
        // 3. CANCEL SUBSCRIPTION IN STRIPE
        // =============================================
        if (cancelImmediately) {
            await stripe.subscriptions.update(
                subscription.stripe_subscription_id,
                {
                    metadata: {
                        canceled_by_user_id: userId
                    }
                }
            );

            await stripe.subscriptions.cancel(
                subscription.stripe_subscription_id
            );

            // Webhook θα κάνει τα υπόλοιπα

            console.log(`Subscription canceled immediately for company ${companyId}`);

            return res.json({
                success: true,
                message: "Η συνδρομή ακυρώθηκε"
            });

        } else {
            const stripeSubscription = await stripe.subscriptions.update(
                subscription.stripe_subscription_id,
                {
                    cancel_at_period_end: true,
                    metadata: {
                        canceled_by_user_id: userId
                    }
                }
            );

            const cancelAt = new Date(stripeSubscription.cancel_at * 1000).toISOString();

            await supabase
                .from("subscriptions")
                .update({
                    cancel_at_period_end: true,
                    cancel_at: cancelAt,
                    updated_at: new Date().toISOString()
                })
                .eq("id", subscription.id);

            console.log(`Subscription scheduled for cancellation for company ${companyId}`);

            return res.json({
                success: true,
                message: "Η συνδρομή θα ακυρωθεί στο τέλος της τρέχουσας περιόδου",
                data: {
                    cancel_at: cancelAt
                }
            });
        }

    } catch (error) {
        console.error("CANCEL SUBSCRIPTION ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή. Προσπαθήστε ξανά.",
            code: "SERVER_ERROR"
        });
    }
});

router.post("/reactivate-subscription", requireAuth, requireOwner, async (req, res) => {
    const { companyId } = req.user;

    try {
        // =============================================
        // 1. FETCH CURRENT SUBSCRIPTION
        // =============================================
        const { data: subscription, error: subErr } = await supabase
            .from("subscriptions")
            .select(`
                id,
                stripe_subscription_id,
                cancel_at_period_end,
                billing_status
            `)
            .eq("company_id", companyId)
            .in("billing_status", ["active", "trialing", "past_due"])
            .single();

        if (subErr || !subscription) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε συνδρομή",
                code: "NO_SUBSCRIPTION"
            });
        }

        // =============================================
        // 2. CHECK IF REACTIVATION IS POSSIBLE
        // =============================================

        if (!subscription.cancel_at_period_end) {
            return res.status(400).json({
                success: false,
                message: "Η συνδρομή δεν έχει προγραμματιστεί για ακύρωση",
                code: "NOT_PENDING_CANCELLATION"
            });
        }

        if (!subscription.stripe_subscription_id) {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχει ενεργή συνδρομή Stripe",
                code: "NO_STRIPE_SUBSCRIPTION"
            });
        }

        // =============================================
        // 3. REACTIVATE IN STRIPE
        // =============================================
        await stripe.subscriptions.update(
            subscription.stripe_subscription_id,
            {
                cancel_at_period_end: false,
                metadata: {
                    canceled_by_user_id: null
                }
            }
        );

        // =============================================
        // 4. UPDATE DATABASE
        // =============================================
        await supabase
            .from("subscriptions")
            .update({
                cancel_at_period_end: false,
                cancel_at: null,
                updated_at: new Date().toISOString()
            })
            .eq("id", subscription.id);

        console.log(`Subscription reactivated for company ${companyId}`);

        return res.json({
            success: true,
            message: "Η συνδρομή επανενεργοποιήθηκε"
        });

    } catch (error) {
        console.error("REACTIVATE SUBSCRIPTION ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή. Προσπαθήστε ξανά.",
            code: "SERVER_ERROR"
        });
    }
});





router.post("/validate-tax-info", requireAuth, async (req, res) => {
    const { taxId, country } = req.body;

    if (!taxId || !country) {
        return res.status(200).json({
            success: false,
            message: "Λείπει ΑΦΜ ή χώρα",
            code: "MISSING_VALUES"
        });
    }

    // 1. Έλεγχος συμβατότητας
    const { valid: validTaxPrefix, error: errorTaxPrefix = '' } = validateTaxPrefix(country, taxId);

    if(!validTaxPrefix) {
        return res.status(200).json({
            success: false,
            message: errorTaxPrefix,
            code: "PREFIX_COUNTRY_MISMATCH",
            data: {
                valid: false,
                status: 'invalid',
            }
        });
    }

    // 2. Έλεγχος Μορφής (Regex)
    const { valid: validEuVatFormat, error: errorEuVatFormat = '' } = validateEuVatFormat(country, taxId);

    if(!validEuVatFormat) {
        return res.status(200).json({
            success: false,
            message: errorEuVatFormat,
            code: "INVALID_EU_VAT_FORMAT",
            data: {
                valid: false,
                status: 'invalid',
            }
        });
    }

    // 3. VIES Call (ΜΟΝΟ για EU)
    if (euCountries.includes(country)) {
        const { countryCode, vatNumber } = splitEuVat(country, taxId);

        try {
            const viesResult = await validateViaVies(countryCode, vatNumber);

            if (!viesResult.success) {
                // ⚠ VIES down (timeout, unavailable, rate limit) → ΔΕΝ μπλοκάρουμε business logic
                return res.status(200).json({
                    success: true,
                    message: "VIES προσωρινά μη διαθέσιμο",
                    code: "VIES_UNAVAILABLE",
                    data: {
                        valid: false,
                        status: 'unavailable',
                    }
                });
            }

            if (!viesResult.valid) {
                return res.status(200).json({
                    success: true,
                    message: "Το ΑΦΜ δεν είναι ενεργό στο VIES.",
                    code: "VIES_INVALID_VAT",
                    data: {
                        valid: false,
                        status: 'invalid',
                    }
                });
            }

            // Valid EU tax info
            return res.status(200).json({
                success: true,
                message: "Έγκυρα EU στοιχεία",
                code: "TAX_INFO_VALID",
                data: {
                    valid: true,
                    status: 'valid',
                }
            });
        } catch (error) {
            console.error("VALIDATE TAX ID ERROR:", error);
            return res.status(200).json({
                success: true,
                message: "VIES προσωρινά μη διαθέσιμο",
                code: "VIES_UNAVAILABLE",
                data: {
                    valid: false,
                    status: 'unavailable',
                }
            });
        }
    }

    // Non-EU tax info
    return res.status(200).json({
        success: true,
        message: "Έγκυρα Non-EU στοιχεία",
        code: "TAX_INFO_VALID",
        data: {
            valid: true,
            status: 'idle',
        }
    });
});


module.exports = router;


// // When user tries to add a new store
// async function canAddStore(companyId) {
//     // Get subscription limits
//     const { data: subscription } = await supabase
//         .from('subscriptions')
//         .select(`
//             plans (included_branches),
//             subscription_items!inner (quantity)
//         `)
//         .eq('company_id', companyId)
//         .eq('subscription_items.item_type', 'extra_store')
//         .single();

//     const includedBranches = subscription?.plans?.included_branches || 0;
//     const paidExtraBranches = subscription?.subscription_items?.[0]?.quantity || 0;
//     const totalAllowed = 1 + includedBranches + paidExtraBranches; // 1 main + included + paid

//     // Count current stores
//     const { count } = await supabase
//         .from('stores')
//         .select('id', { count: 'exact' })
//         .eq('company_id', companyId)
//         .eq('is_active', true);

//     return count < totalAllowed;
// }