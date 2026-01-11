const express = require('express');
const { requireAuth, requireOwner, requireActiveCompany } = require('../middlewares/authRequired');
const Stripe = require('stripe');
const supabase = require('../supabaseConfig');
const { TOTAL_STEPS } = require('../helpers/onboarding/onboardingSteps');
const { generateSubscriptionCode } = require('../helpers/generateSubscriptionCode');
const { validateCompleteOnboardingData } = require('../helpers/onboarding/onboardingValidation');
const { completeOnboardingProcess } = require('../helpers/onboarding/completeOnboarding');
const { sendWelcomeEmail } = require('../helpers/emailService');

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

router.post('/create-setup-intent', requireAuth, requireOwner, async (req, res) => {
    try {
        const companyId = req.user.companyId;
        
        const { data: company, error: companyErr } = await supabase
            .from("companies")
            .select("stripe_customer_id")
            .eq("id", companyId)
            .single();

        if (companyErr) {
            console.error("DB SELECT ERROR (companies):", companyErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη ανάγνωση της εταιρείας",
                code: "DB_ERROR",
            });
        }

        const customerId = company.stripe_customer_id;

        // Δημιουργία SetupIntent
        const setupIntent = await stripe.setupIntents.create({
            customer: customerId,
            // automatic_payment_methods: { enabled: true },
            payment_method_types: ['card'],
        });

            res.json({ 
                success: true,
                message: "Setup intent created",
                data: {
                    clientSecret: setupIntent.client_secret 
                }
            });
    } catch (error) {
            console.error("Create setup intent error:", error);
            return res.status(500).json({ 
                success: false, 
                message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', 
                code: "SERVER_ERROR"
            });
    }
});


router.post('/onboarding-complete', requireAuth, requireOwner, async (req, res) => {

    const { setupIntentId } = req.body;
    const { companyId } = req.user;
    const userId = req.user.id

    if (!setupIntentId) {
        return res.status(400).json({
            success: false,
            message: 'Missing setupIntentId'
        });
    }

    try {
        // 1. Load company (Stripe customer)
        const { data: company } = await supabase
            .from('companies')
            .select('name, stripe_customer_id')
            .eq('id', companyId)
            .single();

        if (!company?.stripe_customer_id) {
            return res.status(400).json({
                success: false,
                message: 'Stripe customer not found'
            });
        }

        const stripeCustomerId = company.stripe_customer_id;

        // 2. Retrieve SetupIntent & set default payment method
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

        // Check if SetupIntent has succeeded
        if (setupIntent.status !== 'succeeded') {
            return res.status(400).json({
                success: false,
                message: 'Payment method not confirmed yet',
                code: 'SETUP_INTENT_NOT_SUCCEEDED'
            });
        }

        const paymentMethodId = setupIntent.payment_method;

        // Verify the payment method belongs to this customer
        if (setupIntent.customer && setupIntent.customer !== stripeCustomerId) {
            return res.status(400).json({
                success: false,
                message: 'Payment method does not belong to this customer',
                code: 'INVALID_PAYMENT_METHOD'
            });
        }

        await stripe.customers.update(stripeCustomerId, {
            name: company.name,
            invoice_settings: { default_payment_method: paymentMethodId }
        });

        // 3. Load onboarding data with full validation
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

        // 3a. Check if already completed
        if (onboarding.is_completed) {
            return res.status(400).json({
                success: false,
                message: "Το onboarding έχει ήδη ολοκληρωθεί",
                code: "ALREADY_COMPLETED"
            });
        }

        // 3b. Verify user is on the final step
        if (onboarding.current_step !== TOTAL_STEPS) {
            return res.status(400).json({
                success: false,
                message: "Πρέπει να ολοκληρώσετε όλα τα steps",
                code: "NOT_ON_FINAL_STEP",
            });
        }

        const onboardingData = onboarding.data;

        // 3c. Validate the sanitized data
        const validation = validateCompleteOnboardingData(onboardingData);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: "Τα δεδομένα δεν είναι έγκυρα",
                code: "VALIDATION_ERROR",
            });
        }

        const planId = onboardingData.plan.id;
        const billingPeriod = onboardingData.plan.billing;

        // 4. Fetch plan details
        const { data: plan } = await supabase
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

        // 5. Build Stripe subscription items
        const items = [];

        // Base plan
        items.push({
            price: billingPeriod === 'monthly'
                ? plan.stripe_price_id_monthly
                : plan.stripe_price_id_yearly
        });

        // Extra branches
        const extraBranches = Math.max(0, onboardingData.branches - plan.included_branches);
        if (extraBranches > 0) {
            items.push({
                price: billingPeriod === 'monthly'
                    ? plan.stripe_extra_store_price_id_monthly
                    : plan.stripe_extra_store_price_id_yearly,
                quantity: extraBranches
            });
        }

        // Plugins
        if (onboardingData.plugins?.length) {
            const { data: plugins } = await supabase
                .from('plugins')
                .select('key, stripe_price_id_monthly, stripe_price_id_yearly')
                .in('key', onboardingData.plugins);

            plugins.forEach(p => {
                const priceId = billingPeriod === 'monthly' 
                    ? p.stripe_price_id_monthly 
                    : p.stripe_price_id_yearly;
                
                // Only add if price ID exists and is not empty
                if (priceId && priceId.trim() !== '') {
                    items.push({ price: priceId });
                } else {
                    console.warn(`Plugin ${p.key} has no valid Stripe price ID for ${billingPeriod} billing`);
                }
            });
        }

        // 6. Create Stripe subscription
        const stripeSubscription = await stripe.subscriptions.create({
            customer: stripeCustomerId,
            items,
            payment_behavior: 'default_incomplete',
            payment_settings: {
                payment_method_types: ['card'],
                save_default_payment_method: 'on_subscription'
            },
            expand: ['latest_invoice', 'items.data.price'],
            metadata: { companyId }
        });

        // 6a. Pay the invoice immediately (it's already finalized)
        const invoiceId = stripeSubscription.latest_invoice.id;
        
        const paidInvoice = await stripe.invoices.pay(invoiceId, {
            payment_method: paymentMethodId
        });

        console.log(`Invoice ${invoiceId} payment status: ${paidInvoice.status}`);

        // 7. Prepare PAID subscription payload
        const subscriptionPayload = {
            company_id: companyId,
            plan_id: plan.id,
            stripe_subscription_id: stripeSubscription.id,
            subscription_code: generateSubscriptionCode(),
            billing_period: billingPeriod,
            billing_status: 'incomplete',
            currency: 'eur',
            current_period_start: null, // Will be set by webhook
            current_period_end: null,
            cancel_at_period_end: false,
            cancel_at: null,
            canceled_at: null,
            updated_at: new Date().toISOString(),
            // metadata: {
            //     plugins: onboardingData.plugins,
            //     branches: onboardingData.branches
            // }
        };

        // 8. Complete onboarding with Stripe subscription
        const result = await completeOnboardingProcess(
            companyId,
            onboarding,
            plan,
            subscriptionPayload
        );

        // 8a. Get the created subscription ID from DB
        const { data: createdSubscription, error: fetchSubError } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('stripe_subscription_id', stripeSubscription.id)
            .single();

        if (fetchSubError || !createdSubscription) {
            console.error('Failed to fetch created subscription:', fetchSubError);
            throw fetchSubError;
        }

        // 8b. Create subscription_items from Stripe subscription items
        const subscriptionItemsToInsert = [];

        for (const stripeItem of stripeSubscription.items.data) {
            const priceId = stripeItem.price.id;
            const quantity = stripeItem.quantity;
            const unitAmount = stripeItem.price.unit_amount / 100; // Convert from cents

            let itemType = null;
            let pluginKey = null;

            // Determine item type by matching price IDs
            if (priceId === plan.stripe_price_id_monthly || priceId === plan.stripe_price_id_yearly) {
                itemType = 'plan';
            } else if (priceId === plan.stripe_extra_store_price_id_monthly || priceId === plan.stripe_extra_store_price_id_yearly) {
                itemType = 'extra_store';
            } else {
                // It's a plugin - find which one
                const { data: matchedPlugin } = await supabase
                    .from('plugins')
                    .select('key')
                    .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
                    .single();

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

        // 8c. Insert subscription items
        if (subscriptionItemsToInsert.length > 0) {
            const { error: itemsError } = await supabase
                .from('subscription_items')
                .insert(subscriptionItemsToInsert);

            if (itemsError) {
                console.error('Failed to create subscription items:', itemsError);
                throw itemsError;
            }

            console.log(`Created ${subscriptionItemsToInsert.length} subscription items`);
        }

        // 9. Send welcome email
        const { data: user } = await supabase
            .from('users')
            .select('email')
            .eq('id', userId)
            .single();

        if (user) {
            const nextPaymentDate = new Date(stripeSubscription.items.data[0].current_period_end * 1000)
                .toLocaleDateString('el-GR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });

            await sendWelcomeEmail(
                user.email,
                company.name, // company name
                plan.name,
                false, // not free
                nextPaymentDate
            );
        }

        res.json({
            success: true,
            message: "Επιτυχής ολοκλήρωση συνδρομής",
            data: {
                is_completed: result.is_completed
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
        res.status(500).json({
            success: false,
            message: 'Failed to complete onboarding'
        });
    }
});

// ------------------------------------



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