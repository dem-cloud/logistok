const express = require('express');
const { requireAuth, requireOwner, requireActiveCompany } = require('../middlewares/authRequired');
const Stripe = require('stripe');
const supabase = require('../supabaseConfig');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();


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

// router.post("/create-subscription-intent", requireAuth, async (req, res) => {
//     const { planId, billingPeriod, companyName, vatNumber } = req.body;
//     const userId = req.user.id;

//     // 1) Load plan
//     const { data: plan } = await supabase
//         .from("plans")
//         .select("*")
//         .eq("id", planId)
//         .single();

//     const stripePriceId =
//         billingPeriod === "annual"
//             ? plan.stripe_price_id_yearly
//             : plan.stripe_price_id_monthly;

//     // 2) Load or create customer
//     const { data: sub, error: subscriptionError } = await supabase
//             .from("subscriptions")
//             .select("*")
//             .eq("owner_id", userId)
//             .single();

//         if (subscriptionError || !sub) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: "Subscription not found",
//                 code: "DB ERROR"
//             });
//         }

//         let stripeCustomerId = sub.stripe_customer_id;

//     // 3) Create subscription
//     const subscription = await stripe.subscriptions.create({
//         customer: stripeCustomerId,
//         items: [{ price: stripePriceId }],
//         payment_behavior: "default_incomplete",
//         automatic_tax: { enabled: true },
//         expand: ["latest_invoice.payment_intent", "latest_invoice.tax", "latest_invoice.lines"]
//     });

//     const invoice = subscription.latest_invoice;
//     const pi = invoice.payment_intent;



//     return res.json({
//         success: true,
//         data: {
//             clientSecret: pi.client_secret,
//             invoicePreview: {
//                 total: invoice.total / 100,
//                 tax: invoice.tax / 100,
//                 subtotal: invoice.subtotal / 100,
//                 currency: invoice.currency,
//                 lines: invoice.lines.data
//             }
//         }
//     });
// });




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

router.post("/create-payment-intent", requireAuth, requireOwner, async (req, res) => {

    const { id: userId, companyId } = req.user;

    const {
        mode,                // "onboarding" | "admin"
        planId,
        billingPeriod,
        companyName,
        vatNumber
    } = req.body

    if (!mode || !planId || !billingPeriod || !companyName) {
        console.log("NO DATA RECEIVED");
        return res.status(400).json({
            success: false,
            message: "Λείπουν υποχρεωτικά πεδία",
            code: "MISSING_VALUES"
        });
    }

    if (!["onboarding", "admin"].includes(mode)) {
        return res.status(400).json({
            success: false,
            message: "Invalid mode",
            code: "INVALID_MODE"
        });
    }

    try {
        /* ------------------------------------------------------------------ */
        /* 1. Φέρε user (email για Stripe)                                    */
        /* ------------------------------------------------------------------ */
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("email, first_name, last_name")
            .eq("id", userId)
            .single();

        if (userError || !user) {
            return res.status(400).json({ 
                success: false, 
                message: "User not found",
                code: "USER_NOT_FOUND"
            });
        }

        /* ------------------------------------------------------------------ */
        /* 2. Φέρε plan & Stripe prices                                       */
        /* ------------------------------------------------------------------ */
        const { data: plan, error: planError } = await supabase
            .from("plans")
            .select("stripe_price_id_monthly, stripe_price_id_yearly")
            .eq("id", planId)
            .single();

        if (planError || !plan) {
            return res.status(400).json({
                success: false,
                message: "Plan not found",
                code: "PLAN_NOT_FOUND"
            });
        }


        /* ------------------------------------------------------------------ */
        /* 3. Υπολογισμός ποσών                                               */
        /* ------------------------------------------------------------------ */
        const monthlyPrice = await stripe.prices.retrieve(plan.stripe_price_id_monthly);
        const yearlyPrice = await stripe.prices.retrieve(plan.stripe_price_id_yearly);

        const unitMonthlyAmount = monthlyPrice.unit_amount / 100; // σε ευρώ
        const unitYearlyAmount = yearlyPrice.unit_amount / 100; // σε ευρώ
        
        // Υπολογισμός summary
        const subTotal = billingPeriod === "monthly" ? unitMonthlyAmount : unitYearlyAmount;
        const vatAmount = subTotal * 0.24;
        const total = subTotal + vatAmount;
        
        const originalAnnualPrice = unitMonthlyAmount * 12 * 1.24;
        const discount = ((originalAnnualPrice - (unitYearlyAmount * 1.24)) / originalAnnualPrice * 100).toFixed(0);


        /* ------------------------------------------------------------------ */
        /* 4. Stripe Customer                                                 */
        /* ------------------------------------------------------------------ */
        let stripeCustomerId;

        if (mode === "admin") {
            // ΥΠΑΡΧΕΙ subscription
            const { data: subscription, error: subError } = await supabase
                .from("subscriptions")
                .select("stripe_customer_id")
                .eq("company_id", companyId)
                .single();

            if (subError || !subscription) {
                return res.status(400).json({
                    success: false,
                    message: "Subscription not found",
                    code: "SUBSCRIPTION_NOT_FOUND"
                });
            }

            stripeCustomerId = subscription.stripe_customer_id;

            // Αν δεν υπάρχει Stripe customer → δημιουργία & update
            if (!stripeCustomerId) {
                const customer = await stripe.customers.create({
                    email: user.email,
                    name: companyName,
                    metadata: {
                        userId,
                        companyId,
                        vatNumber: vatNumber || ""
                    }
                });

                stripeCustomerId = customer.id;

                const { error } = await supabase
                    .from("subscriptions")
                    .update({ stripe_customer_id: stripeCustomerId })
                    .eq("company_id", companyId);

                if(error) {
                    console.error("SUBSCRIPTIONS ERROR:", error);
                    return res.status(500).json({
                        success: false,
                        message: "Failed to update subscriptions",
                        code: "DB_ERROR"
                    });
                }
            }
        }

        if (mode === "onboarding") {
            // ΔΕΝ υπάρχει subscription
            const customer = await stripe.customers.create({
                email: user.email,
                name: companyName,
                metadata: {
                    userId,
                    companyId,
                }
            });

            stripeCustomerId = customer.id;
        }


        /* ------------------------------------------------------------------ */
        /* 5. Δημιουργία PaymentIntent                                        */
        /* ------------------------------------------------------------------ */
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(total * 100), // σε cents, με ΦΠΑ
            currency: 'eur',
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            metadata: {
                mode,
                userId,
                companyId,
                planId,
                billingPeriod
            }
        });

        console.log("PaymentIntent created:", paymentIntent.id);

        /* ------------------------------------------------------------------ */
        /* 6. Response                                                        */
        /* ------------------------------------------------------------------ */
        return res.json({
            success: true,
            message: "Payment intent created",
            data: {
                clientSecret: paymentIntent.client_secret,
                priceInfo: {
                    vatPercentage: 24,
                    vatAmount: Number(vatAmount.toFixed(2)),
                    subTotal: Number(subTotal.toFixed(2)),
                    total: Number(total.toFixed(2)),
                    originalAnnualPrice: Number(originalAnnualPrice.toFixed(2)),
                    discount: discount
                }
            }
        });

    } catch (error) {
        console.error("Create payment intent error:", error);
        return res.status(500).json({ 
            success: false, 
            message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', 
            code: "SERVER_ERROR"
        });
    }
});

router.post("/confirm-and-subscribe", requireAuth, async (req, res) => {

    const userId = req.user.id;
    const subId = req.user.subId;

    const { 
        paymentIntentId, 
        stripeCustomerId, 
        planId, 
        billingPeriod, 
        companyName, 
        vatNumber 
    } = req.body;

    if (!paymentIntentId || !stripeCustomerId || !planId || !billingPeriod || !companyName) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν απαραίτητα στοιχεία",
            code: "MISSING_VALUES"
        });
    }

    try {
        // 🔹 1. Update Stripe Customer με τα τελικά στοιχεία
        await stripe.customers.update(stripeCustomerId, {
            metadata: {
                userId,
                companyName,
                vatNumber: vatNumber || ""
            }
        });

        console.log("✅ Customer updated:", stripeCustomerId);

        // 🔹 2. Ελέγξε αν το PaymentIntent έχει επιτύχει
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== "succeeded") {
            return res.status(400).json({
                success: false,
                message: "Η πληρωμή δεν ολοκληρώθηκε",
                code: "PAYMENT_NOT_COMPLETED"
            });
        }

        console.log("✅ Payment confirmed:", paymentIntentId);

        // 🔹 3. Πάρε το payment method από το PaymentIntent
        const paymentMethodId = paymentIntent.payment_method;

        // 🔹 4. Φέρε το price ID
        const { data: selectedPlan, error: planError } = await supabase
            .from("plans")
            .select("stripe_price_id_monthly, stripe_price_id_yearly")
            .eq("id", planId)
            .single();

        if (planError || !selectedPlan) {
            return res.status(400).json({ 
                success: false, 
                message: "Plan not found",
                code: "DB_ERROR"
            });
        }

        const selectedPriceId = billingPeriod === "monthly" 
            ? selectedPlan.stripe_price_id_monthly 
            : selectedPlan.stripe_price_id_yearly;

        // 🔹 5. Δημιούργησε το Subscription με το payment method
        const subscription = await stripe.subscriptions.create({
            customer: stripeCustomerId,
            items: [{ price: selectedPriceId }],
            default_payment_method: paymentMethodId,
            metadata: {
                userId,
                subId,
                planId,
                billingPeriod,
                companyName,
                vatNumber: vatNumber || "",
                initial_payment_intent: paymentIntentId
            },
            // Backdate στην ημερομηνία της πληρωμής
            billing_cycle_anchor: Math.floor(Date.now() / 1000),
            proration_behavior: 'none'
        });

        console.log("✅ Subscription created:", subscription.id);

        // 🔹 6. Ενημέρωσε τη DB
        const { error: updateError } = await supabase
            .from("subscriptions")
            .update({ 
                stripe_subscription_id: subscription.id,
                plan_id: planId,
                billing_period: billingPeriod,
                status: 'active'
            })
            .eq("id", subId);

        if (updateError) {
            console.error("DB update error:", updateError);
            // Το subscription υπάρχει στο Stripe, αλλά η DB απέτυχε
            // Θα το πιάσει το webhook
        }

        return res.json({
            success: true,
            message: "Subscription created successfully",
            data: {
                subscriptionId: subscription.id,
                status: subscription.status
            }
        });

    } catch (error) {
        console.error("Confirm and subscribe error:", error);
        return res.status(500).json({ 
            success: false, 
            message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', 
            code: "SERVER_ERROR"
        });
    }
});


module.exports = router;