const express = require('express');
const { requireAuth, requireOwner, requireActiveCompany } = require('../middlewares/authRequired');
const Stripe = require('stripe');
const supabase = require('../supabaseConfig');

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
    const companyId = req.user.company_id;

    if (!setupIntentId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing setupIntentId' 
        });
    }

    try {
        // 1️⃣ Load company (Stripe customer)
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

        // 2️⃣ Retrieve SetupIntent
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
        const paymentMethodId = setupIntent.payment_method;

        // 3️⃣ Set default payment method
        await stripe.customers.update(stripeCustomerId, {
            name: company.name,
            invoice_settings: { default_payment_method: paymentMethodId }
        });

        // 4️⃣ Load onboarding & plan data
        const { data: onboarding } = await supabase
            .from('onboarding')
            .select('data')
            .eq('company_id', companyId)
            .single();

        const onboardingData = onboarding.data;
        const planId = onboardingData.plan.id;
        const billingPeriod = onboardingData.plan.billing;

        const { data: plan } = await supabase
            .from('plans')
            .select(`
                stripe_price_id_monthly,
                stripe_price_id_yearly,
                stripe_extra_store_price_id_monthly,
                stripe_extra_store_price_id_yearly,
                included_branches
            `)
            .eq('id', planId)
            .single();

        // 5️⃣ Build Stripe subscription items
        const items = [];

        // Base plan
        items.push({ price: billingPeriod === 'monthly' ? plan.stripe_price_id_monthly : plan.stripe_price_id_yearly });

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
                .select('stripe_price_id_monthly,stripe_price_id_yearly')
                .in('key', onboardingData.plugins);

            plugins.forEach(p => {
                items.push({ price: billingPeriod === 'monthly' ? p.stripe_price_id_monthly : p.stripe_price_id_yearly });
            });
        }

        // 6️⃣ Create subscription (off_session, using saved payment method)
        const stripeSubscription = await stripe.subscriptions.create({
            customer: stripeCustomerId,
            items,
            payment_behavior: 'default_incomplete',
            payment_settings: { 
                save_default_payment_method: 'on_subscription' 
            },
            expand: ['latest_invoice.payment_intent'],
            metadata: { companyId }
        });

        // 7️⃣ Insert subscription in DB (draft)
        await supabase
            .from('subscriptions')
            .insert({
                company_id: companyId,
                plan_id: planId,
                stripe_subscription_id: stripeSubscription.id,
                subscription_code: `sub_${companyId.slice(0, 8)}`,
                billing_period: billingPeriod,
                billing_status: 'incomplete',
                currency: 'eur',
                metadata: {
                    plugins: onboardingData.plugins,
                    branches: onboardingData.branches
                }
            });

        // 8️⃣ Mark onboarding complete
        await supabase
            .from('onboarding')
            .update({ 
                is_completed: true, 
                updated_at: new Date().toISOString() 
            })
            .eq('company_id', companyId);

        // 9️⃣ Return client_secret for payment confirmation if needed
        res.json({
            success: true,
            clientSecret: stripeSubscription.latest_invoice.payment_intent.client_secret
        });

    } catch (err) {
        console.error('ONBOARDING COMPLETE ERROR:', err);
        res.status(500).json({ success: false, message: 'Failed to complete onboarding' });
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