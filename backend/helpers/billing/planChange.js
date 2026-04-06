const Stripe = require('stripe');
const supabase = require("../../supabaseConfig");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// =============================================
// HANDLE IMMEDIATE PLAN CHANGE WITH PAYMENT
// =============================================
async function handleImmediatePlanChange(
    res,
    subscription,
    planItem,
    stripeCustomerId,
    companyId,
    planId,
    billingPeriod,
    newStripePriceId,
    paymentMethodId,
    isFree,
    storesWarning = null
) {
    // Check payment method if needed
    if (!isFree) {
        if (paymentMethodId) {
            await stripe.paymentMethods.attach(paymentMethodId, {
                customer: stripeCustomerId
            });
            
            await stripe.customers.update(stripeCustomerId, {
                invoice_settings: { default_payment_method: paymentMethodId }
            });
        } else {
            const customer = await stripe.customers.retrieve(stripeCustomerId);

            if (customer.deleted) {
                return res.status(400).json({
                    success: false,
                    message: "Ο λογαριασμός πληρωμών δεν βρέθηκε",
                    code: "CUSTOMER_DELETED"
                });
            }

            if (!customer.invoice_settings?.default_payment_method) {
                return res.status(400).json({
                    success: false,
                    message: "Πρέπει να προσθέσετε κάρτα",
                    code: "NO_PAYMENT_METHOD"
                });
            }
        }
    }

    // Update subscription
    const stripeSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
            items: [{
                id: planItem.stripe_subscription_item_id,
                price: newStripePriceId,
            }],
            automatic_tax: { enabled: true },
            proration_behavior: "always_invoice",
            payment_behavior: "default_incomplete",
            expand: ['latest_invoice.confirmation_secret'],
            metadata: {
                companyId,
                planId,
                billingPeriod
            }
        }
    );

    const latestInvoice = stripeSubscription.latest_invoice;
    const invoiceLine = latestInvoice.lines.data[0];

    // Get active billing details
    const { data: activeBilling } = await supabase
        .from('billing_details')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle();

    // Create payment history if not exists
    const { data: phData } = await supabase
        .from("payment_history")
        .select("id")
        .eq("stripe_invoice_id", latestInvoice.id)
        .maybeSingle();

    if (!phData && invoiceLine) {
        await supabase
            .from('payment_history')
            .insert({
                subscription_id: subscription.id,
                billing_details_id: activeBilling?.id || null,
                stripe_invoice_id: latestInvoice.id,
                stripe_payment_intent_id: null,
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
    }

    // Check invoice status
    if (latestInvoice.status === 'paid') {
        await handlePlanChangeSuccess(
            subscription.id, 
            planId, 
            billingPeriod, 
            newStripePriceId, 
            planItem.id, 
            companyId, 
            latestInvoice.id
        );
        
        return res.json({
            success: true,
            message: "Η αλλαγή πλάνου ολοκληρώθηκε επιτυχώς"
        });
    }

    if (latestInvoice.status === 'open') {
        const clientSecret = latestInvoice.confirmation_secret?.client_secret;
        
        if (!clientSecret) {
            console.error('No client_secret in invoice:', latestInvoice.id);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία πληρωμής",
                code: "NO_CLIENT_SECRET"
            });
        }

        // Get the default payment method
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method || null;

        return res.json({
            success: false,
            message: "Απαιτείται επιβεβαίωση πληρωμής",
            code: "REQUIRES_PAYMENT",
            ...(storesWarning && { warning: storesWarning }),
            data: {
                clientSecret,
                invoiceId: latestInvoice.id,
                subscriptionId: stripeSubscription.id,
                paymentMethodId: defaultPaymentMethodId
            }
        });
    }

    if (latestInvoice.status === 'void') {
        return res.status(400).json({
            success: false,
            message: "Υπάρχει πρόβλημα με την προηγούμενη πληρωμή. Δοκιμάστε ξανά.",
            code: "INVOICE_VOID"
        });
    }

    return res.status(400).json({
        success: false,
        message: `Μη αναμενόμενη κατάσταση τιμολογίου: ${latestInvoice.status}`,
        code: "UNEXPECTED_INVOICE_STATUS"
    });
}

// =============================================
// HANDLE SCHEDULED DOWNGRADE (END OF PERIOD)
// =============================================
async function handleScheduledDowngrade(
    res,
    subscription,
    stripeCustomerId,
    companyId,
    planId,
    billingPeriod,
    currentPriceId,
    newStripePriceId,
    storesWarning = null
) {
    // Debug: Check if subscription has schedule in Stripe
    const stripeSub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
    console.log('Stripe subscription schedule:', stripeSub.schedule);
    
    if (stripeSub.schedule) {
        // Force release in Stripe
        try {
            await stripe.subscriptionSchedules.release(stripeSub.schedule);
            console.log('Released schedule from Stripe:', stripeSub.schedule);
        } catch (err) {
            console.error('Failed to release:', err.message);
        }
    }
    //

    // 1. Create schedule from existing subscription
    const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: subscription.stripe_subscription_id
    });

    // 2. Get current phase dates
    const currentPhaseStart = schedule.phases[0].start_date;
    const currentPhaseEnd = schedule.phases[0].end_date;

    // 3. Update schedule with new phases
    await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        phases: [
            {
                items: [{ price: currentPriceId, quantity: 1 }],
                start_date: currentPhaseStart,
                end_date: currentPhaseEnd,
            },
            {
                items: [{ price: newStripePriceId, quantity: 1 }],
                start_date: currentPhaseEnd,
                // Remove iterations, use end_behavior: 'release' instead
                // The phase will continue indefinitely after schedule releases
            }
        ]
    });

    // 4. Update subscription metadata
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        metadata: {
            companyId,
            planId,
            billingPeriod
        }
    });

    // 5. Save schedule ID to DB
    await supabase
        .from("subscriptions")
        .update({ 
            stripe_subscription_schedule_id: schedule.id,
            updated_at: new Date().toISOString()
        })
        .eq("id", subscription.id);

    return res.json({
        success: true,
        message: "Το νέο πλάνο θα ισχύσει στο τέλος της τρέχουσας περιόδου",
        ...(storesWarning && { warning: storesWarning })
    });
}

// =============================================
// UPDATE DB AFTER SUCCESSFUL PLAN CHANGE
// =============================================
async function handlePlanChangeSuccess(subscriptionId, planId, billingPeriod, newStripePriceId, planItemId, companyId, invoiceId) {
    // Re-enable users disabled due to plan limit
    await supabase
        .from("company_users")
        .update({ 
            status: "active",
            disabled_reason: null,
            updated_at: new Date().toISOString()
        })
        .eq("company_id", companyId)
        .eq("status", "disabled")
        .eq("disabled_reason", "plan_limit");

    // Disable extra stores when new plan has fewer allowed branches
    const { data: newPlan } = await supabase
        .from("plans")
        .select("included_branches")
        .eq("id", planId)
        .single();
    const includedBranches = Math.max(1, newPlan?.included_branches ?? 0);
    const { data: activeStores } = await supabase
        .from("stores")
        .select("id, is_main")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("created_at", { ascending: true });
    if (activeStores && activeStores.length > includedBranches) {
        const toKeep = activeStores.slice(0, includedBranches);
        const toKeepIds = toKeep.map((s) => s.id);
        const toDisable = activeStores.filter((s) => !toKeepIds.includes(s.id));
        if (toDisable.length > 0) {
            const toDisableIds = toDisable.map((s) => s.id);
            await supabase
                .from("stores")
                .update({
                    is_active: false,
                    scheduled_deactivate_at: null,
                    updated_at: new Date().toISOString()
                })
                .in("id", toDisableIds);
        }
    }

    // Update subscription
    await supabase
        .from("subscriptions")
        .update({
            plan_id: planId,
            billing_period: billingPeriod,
            billing_status: "active",
            stripe_subscription_schedule_id: null,
            cancel_at_period_end: false,
            cancel_at: null,
            canceled_at: null,
            updated_at: new Date().toISOString()
        })
        .eq("id", subscriptionId);

    // Update subscription item
    await supabase
        .from("subscription_items")
        .update({
            stripe_price_id: newStripePriceId,
            updated_at: new Date().toISOString()
        })
        .eq("id", planItemId);

    // Update payment history
    if (invoiceId) {
        await supabase
            .from('payment_history')
            .update({ 
                status: 'paid',
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString() 
            })
            .eq('stripe_invoice_id', invoiceId)
            .eq('status', 'pending');
    }
}

module.exports = {
    handleImmediatePlanChange,
    handleScheduledDowngrade,
    handlePlanChangeSuccess
};