const express = require('express');
const Stripe = require('stripe');
const { handlePriceSync } = require('../helpers/pricing/priceSync');
const supabase = require('../supabaseConfig');
const { sendPaymentFailedEmail, sendPaymentReceiptEmailIfNeeded, sendWelcomeEmailIfNeeded, sendSubscriptionCanceledEmail } = require('../helpers/emailService');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

/**
 * Process stores scheduled for removal at period end.
 * Deactivates stores, reduces Stripe extra_store quantity, syncs subscription_items.
 */
async function processScheduledStoreRemovals(companyId, periodStart, dbSubscriptionId, stripeSubscriptionId) {
    const { data: toDeactivate } = await supabase
        .from('stores')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .not('scheduled_deactivate_at', 'is', null)
        .lte('scheduled_deactivate_at', periodStart);

    if (!toDeactivate || toDeactivate.length === 0) return;

    const storeIds = toDeactivate.map(s => s.id);
    await supabase
        .from('stores')
        .update({ is_active: false, scheduled_deactivate_at: null })
        .in('id', storeIds);

    const count = storeIds.length;
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

    const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const extraStoreItem = stripeSubscription.items?.data?.find(item => item.price?.id === priceId);
    if (!extraStoreItem) return;

    const newQuantity = Math.max(0, (extraStoreItem.quantity || 0) - count);
    if (newQuantity === 0) {
        await stripe.subscriptionItems.del(extraStoreItem.id);
        await supabase
            .from('subscription_items')
            .delete()
            .eq('subscription_id', dbSubscriptionId)
            .eq('item_type', 'extra_store');
    } else {
        await stripe.subscriptionItems.update(extraStoreItem.id, { quantity: newQuantity });
        const updatedSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const updatedItem = updatedSub.items?.data?.find(item => item.price?.id === priceId);
        if (updatedItem) {
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
                        quantity: updatedItem.quantity,
                        stripe_subscription_item_id: updatedItem.id,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);
            }
        }
    }
    console.log(`Deactivated ${count} scheduled store(s) for company ${companyId}`);
}

router.post('/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.log(err)
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    console.log('Webhook event:', event.type);
    
    try {
        switch (event.type) {
            // Α. ΣΥΓΧΡΟΝΙΣΜΟΣ ΤΙΜΩΝ (Cache Sync)
            case 'price.created':
            case 'price.updated': {
                const price = event.data.object;
                await handlePriceSync(price);
                console.log(`Price ${price.id} updated in DB cache.`);
                break;
            }

            // Β. ΟΛΟΚΛΗΡΩΣΗ ΣΥΝΔΡΟΜΗΣ (Activation & Payment History & Email Receipt)
            case 'invoice.paid': {
                const invoice = event.data.object;
                if (!invoice.subscription) break;

                const stripeSubscriptionId = invoice.subscription;

                // 1. Ανάκτηση της συνδρομής για metadata
                const fullSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
                const { companyId, planId, billingPeriod, subscriptionCode } = fullSubscription.metadata;

                if (!companyId || !planId || !billingPeriod) {
                    console.error('Missing values in subscription metadata:', stripeSubscriptionId);
                    break;
                }

                console.log(`Processing invoice.paid for Company ${companyId} (Sub ${stripeSubscriptionId})`);

                // 2. Fetch subscription από βάση (μπορεί να μην υπάρχει ακόμα για subscription_create)
                let dbSubscription = null;

                const { data: existingSub } = await supabase
                    .from('subscriptions')
                    .select('id')
                    .eq('stripe_subscription_id', stripeSubscriptionId)
                    .maybeSingle();  // maybeSingle αντί για single

                dbSubscription = existingSub;

                // Για subscription_update/subscription_cycle πρέπει να υπάρχει
                if (!dbSubscription && invoice.billing_reason !== 'subscription_create') {
                    console.error('Subscription not found in DB:', stripeSubscriptionId);
                    break;
                }

                // 3. Timestamps
                const paidAtTimestamp = invoice.status_transitions.paid_at;
                const paidAtIso = paidAtTimestamp 
                    ? new Date(paidAtTimestamp * 1000).toISOString() 
                    : new Date().toISOString();

                const invoiceLine = invoice.lines.data[0];
                const periodStart = new Date(invoiceLine.period.start * 1000).toISOString();
                const periodEnd = new Date(invoiceLine.period.end * 1000).toISOString();

                // =============================================
                // HANDLE BASED ON BILLING REASON
                // =============================================
                if (invoice.billing_reason === 'subscription_create') {
                    
                    // =============================================
                    // ONBOARDING - ΑΡΧΙΚΗ ΕΓΓΡΑΦΗ
                    // =============================================
                    const { data: upsertedSub, error: upsertErr } = await supabase
                        .from('subscriptions')
                        .upsert({
                            company_id: companyId,
                            plan_id: planId,
                            stripe_subscription_id: stripeSubscriptionId,
                            subscription_code: subscriptionCode,
                            billing_period: billingPeriod,
                            billing_status: 'active',
                            currency: invoice.currency,
                            current_period_start: periodStart,
                            current_period_end: periodEnd,
                            cancel_at_period_end: false,
                            cancel_at: null,
                            canceled_at: null,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'stripe_subscription_id'
                        })
                        .select('id')
                        .single();

                    if (upsertErr) {
                        console.error('Failed to upsert subscription:', upsertErr);
                        break;
                    }

                    dbSubscription = upsertedSub;

                    // =============================================
                    // SYNC PAYMENT METHOD TO CUSTOMER
                    // =============================================
                    if (fullSubscription.default_payment_method) {
                        try {
                            await stripe.customers.update(fullSubscription.customer, {
                                invoice_settings: { default_payment_method: fullSubscription.default_payment_method }
                            });
                            console.log(`Synced payment method to customer for company ${companyId}`);
                        } catch (pmError) {
                            console.error('Failed to sync payment method:', pmError);
                            // Non-critical - continue
                        }
                    }

                    // =============================================
                    // ENSURE BILLING_DETAILS EXISTS (safety net)
                    // =============================================
                    const { data: existingBilling } = await supabase
                        .from('billing_details')
                        .select('id')
                        .eq('company_id', companyId)
                        .eq('is_active', true)
                        .maybeSingle();

                    if (!existingBilling) {
                        const customer = await stripe.customers.retrieve(fullSubscription.customer);
                        
                        if (customer && !customer.deleted && customer.address) {
                            await supabase
                                .from('billing_details')
                                .insert({
                                    company_id: companyId,
                                    is_corporate: customer.tax_ids?.data?.length > 0,
                                    billing_name: customer.name || '',
                                    tax_id: customer.tax_ids?.data?.[0]?.value || null,
                                    address: customer.address.line1 || '',
                                    city: customer.address.city || '',
                                    postal_code: customer.address.postal_code || '',
                                    country: customer.address.country || '',
                                    is_active: true
                                });
                            
                            console.log(`Created billing_details from Stripe customer for company ${companyId}`);
                        }
                    }

                    await supabase
                        .from('onboarding')
                        .update({
                            is_completed: true,
                            updated_at: new Date().toISOString()
                        })
                        .eq('company_id', companyId);

                    await sendWelcomeEmailIfNeeded(companyId, planId, periodEnd);

                } else if (invoice.billing_reason === 'subscription_update') {
                    // =============================================
                    // UPGRADE (3DS completed or immediate)
                    // =============================================
                    
                    // Update subscription
                    await supabase
                        .from('subscriptions')
                        .update({
                            plan_id: planId,
                            billing_period: billingPeriod,
                            billing_status: 'active',
                            current_period_start: periodStart,
                            current_period_end: periodEnd,
                            cancel_at_period_end: false,
                            cancel_at: null,
                            canceled_at: null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', dbSubscription.id);

                    // Re-enable users disabled due to plan limit
                    await supabase
                        .from('company_users')
                        .update({ 
                            status: 'active',
                            disabled_reason: null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('company_id', companyId)
                        .eq('status', 'disabled')
                        .eq('disabled_reason', 'plan_limit');

                    // Fetch new plan prices
                    const { data: newPlan } = await supabase
                        .from('plans')
                        .select('stripe_price_id_monthly, stripe_price_id_yearly, cached_price_monthly, cached_price_yearly')
                        .eq('id', planId)
                        .single();

                    const newPriceId = billingPeriod === 'monthly' 
                        ? newPlan.stripe_price_id_monthly 
                        : newPlan.stripe_price_id_yearly;

                    const newUnitAmount = billingPeriod === 'monthly'
                        ? newPlan.cached_price_monthly
                        : newPlan.cached_price_yearly;

                    await supabase
                        .from('subscription_items')
                        .update({
                            stripe_price_id: newPriceId,
                            unit_amount: newUnitAmount,
                            updated_at: new Date().toISOString()
                        })
                        .eq('subscription_id', dbSubscription.id)
                        .eq('item_type', 'plan');

                    console.log(`Subscription ${stripeSubscriptionId} upgraded to plan ${planId}`);

                } else if (invoice.billing_reason === 'subscription_cycle') {
                    // =============================================
                    // RENEWAL - ΑΝΑΝΕΩΣΗ
                    // =============================================
                    
                    await supabase
                        .from('subscriptions')
                        .update({
                            current_period_start: periodStart,
                            current_period_end: periodEnd,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', dbSubscription.id);

                    // Process stores scheduled for removal at period end
                    await processScheduledStoreRemovals(companyId, periodStart, dbSubscription.id, stripeSubscriptionId);

                    console.log(`Subscription ${stripeSubscriptionId} renewed`);
                }

                // =============================================
                // PAYMENT HISTORY (για όλες τις περιπτώσεις)
                // =============================================
                const { data: activeBilling } = await supabase
                    .from('billing_details')
                    .select('id')
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .maybeSingle();

                const paymentHistoryPayload = {
                    subscription_id: dbSubscription.id,
                    billing_details_id: activeBilling?.id || null,
                    stripe_payment_intent_id: invoice.payment_intent || null,
                    stripe_invoice_id: invoice.id,
                    stripe_charge_id: invoice.charge,
                    amount: invoice.amount_paid / 100,
                    currency: invoice.currency,
                    status: 'paid',
                    paid_at: paidAtIso,
                    payment_method: 'card',
                    failure_reason: null,
                    metadata: {
                        billing_reason: invoice.billing_reason,
                        invoice_number: invoice.number,
                        subscription_period: {
                            start: periodStart,
                            end: periodEnd
                        }
                    },
                    created_at: new Date(invoice.created * 1000).toISOString(),
                    updated_at: new Date().toISOString()
                };

                await supabase
                    .from('payment_history')
                    .upsert(paymentHistoryPayload, { onConflict: 'stripe_invoice_id' });

                // =============================================
                // SEND RECEIPT EMAIL (για όλες τις περιπτώσεις)
                // =============================================
                await sendPaymentReceiptEmailIfNeeded(companyId, invoice, invoiceLine);

                console.log(`invoice.paid processed for ${stripeSubscriptionId}`);
                break;
            }

            // Γ. Failed Payments
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const stripeSubscriptionId = invoice.subscription;

                if (!stripeSubscriptionId) break;

                console.log(`Processing invoice.payment_failed for ${stripeSubscriptionId}`);

                let subscriptionIdForHistory = null;
                let companyIdForEmail = null;

                // =============================================
                // 1. FETCH OR CREATE SUBSCRIPTION
                // =============================================
                const { data: subscription } = await supabase
                    .from('subscriptions')
                    .select('id, company_id')
                    .eq('stripe_subscription_id', stripeSubscriptionId)
                    .maybeSingle();

                // Ανάκτηση metadata από τη Stripe
                const fullSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

                if (!subscription) {
                    console.log(`Subscription ${stripeSubscriptionId} not in DB, creating it from metadata...`);

                    const { companyId, planId, billingPeriod, subscriptionCode } = fullSubscription.metadata;

                    if (!companyId || !planId || !billingPeriod || !subscriptionCode) {
                        console.error('Missing values in subscription metadata:', fullSubscription.metadata);
                        break;
                    }

                    const invoiceLine = invoice.lines.data[0];
                    const periodStart = invoiceLine 
                        ? new Date(invoiceLine.period.start * 1000).toISOString() 
                        : new Date().toISOString();
                    const periodEnd = invoiceLine 
                        ? new Date(invoiceLine.period.end * 1000).toISOString() 
                        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

                    const { data: newSub, error: subError } = await supabase
                        .from('subscriptions')
                        .upsert({
                            company_id: companyId,
                            plan_id: planId,
                            stripe_subscription_id: stripeSubscriptionId,
                            subscription_code: subscriptionCode,
                            billing_period: billingPeriod,
                            billing_status: fullSubscription.status,
                            currency: invoice.currency,
                            current_period_start: periodStart,
                            current_period_end: periodEnd,
                            cancel_at_period_end: false,
                            cancel_at: null,
                            canceled_at: null,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'stripe_subscription_id',
                        })
                        .select('id')
                        .single();

                    if (subError || !newSub) {
                        console.error('Failed to create subscription:', subError);
                        break;
                    }

                    subscriptionIdForHistory = newSub.id;
                    companyIdForEmail = companyId;

                } else {
                    // Update status
                    await supabase
                        .from('subscriptions')
                        .update({
                            billing_status: fullSubscription.status,
                            updated_at: new Date().toISOString()
                        })
                        .eq('stripe_subscription_id', stripeSubscriptionId);

                    subscriptionIdForHistory = subscription.id;
                    companyIdForEmail = subscription.company_id;
                }

                // =============================================
                // 2. GET ACTIVE BILLING DETAILS
                // =============================================
                const { data: activeBilling } = await supabase
                    .from('billing_details')
                    .select('id')
                    .eq('company_id', companyIdForEmail)
                    .eq('is_active', true)
                    .maybeSingle();

                // =============================================
                // 3. UPDATE PAYMENT HISTORY
                // =============================================
                const failureMessage = invoice.last_finalization_error?.message 
                    || invoice.payment_intent?.last_payment_error?.message
                    || invoice.last_payment_error?.message
                    || 'Payment failed';

                const paymentHistoryPayload = {
                    subscription_id: subscriptionIdForHistory,
                    billing_details_id: activeBilling?.id || null,
                    stripe_payment_intent_id: invoice.payment_intent || null,
                    stripe_invoice_id: invoice.id,
                    stripe_charge_id: invoice.charge || null,
                    amount: invoice.amount_due / 100,
                    currency: invoice.currency,
                    status: 'failed',
                    payment_method: 'card',
                    failure_reason: failureMessage,
                    metadata: {
                        billing_reason: invoice.billing_reason,
                        invoice_number: invoice.number,
                        attempt_count: invoice.attempt_count
                    },
                    updated_at: new Date().toISOString()
                };

                await supabase
                    .from('payment_history')
                    .upsert(paymentHistoryPayload, {
                        onConflict: 'stripe_invoice_id'
                    });

                // =============================================
                // 4. SEND EMAIL BASED ON BILLING REASON
                // =============================================
                const isOnboarding = invoice.billing_reason === 'subscription_create';
                const isUpgrade = invoice.billing_reason === 'subscription_update';
                const isRenewal = invoice.billing_reason === 'subscription_cycle';

                // Only send failure email for renewals (not upgrades - user sees error on screen)
                if (isRenewal && companyIdForEmail) {
                    const { data: company } = await supabase
                        .from('companies')
                        .select('name')
                        .eq('id', companyIdForEmail)
                        .single();

                    const { data: companyUser } = await supabase
                        .from('company_users')
                        .select('user_id')
                        .eq('company_id', companyIdForEmail)
                        .eq('is_owner', true)
                        .single();

                    if (companyUser) {
                        const { data: user } = await supabase
                            .from('users')
                            .select('email')
                            .eq('id', companyUser.user_id)
                            .single();

                        if (user && company) {
                            const retryDate = invoice.next_payment_attempt
                                ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('el-GR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                })
                                : null;

                            await sendPaymentFailedEmail(
                                user.email,
                                company.name,
                                {
                                    amount: (invoice.amount_due / 100).toFixed(2),
                                    currency: invoice.currency.toUpperCase(),
                                    invoiceNumber: invoice.number,
                                    failureReason: failureMessage,
                                    retryDate: isRenewal ? retryDate : null // Retry μόνο για renewal
                                }
                            );
                            console.log(`Payment failed email sent to ${user.email} (${invoice.billing_reason})`);
                        }
                    }
                }

                if (isOnboarding) {
                    console.log(`Onboarding payment failed for ${stripeSubscriptionId} - user sees error on screen`);
                }

                if (isUpgrade) {
                    console.log(`Upgrade payment failed for ${stripeSubscriptionId} - user sees error on screen`);
                }

                console.log(`invoice.payment_failed processed for ${stripeSubscriptionId}`);
                break;
            }

            // Δ. SUBSCRIPTION STATUS CHANGES
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const previousAttributes = event.data.previous_attributes;
                const stripeSubscriptionId = subscription.id;

                console.log(`Processing customer.subscription.updated for ${stripeSubscriptionId}`);

                // =============================================
                // 1. FETCH SUBSCRIPTION FROM DB
                // =============================================
                const { data: dbSubscription, error: dbSubErr } = await supabase
                    .from('subscriptions')
                    .select('id, company_id, stripe_subscription_schedule_id, plan_id, billing_period')
                    .eq('stripe_subscription_id', stripeSubscriptionId)
                    .single();

                if (dbSubErr || !dbSubscription) {
                    console.error('Subscription not found in DB:', stripeSubscriptionId);
                    break;
                }

                // =============================================
                // 2. CHECK IF PRICE CHANGED (DOWNGRADE EXECUTED)
                // =============================================
                if (previousAttributes?.items && dbSubscription.stripe_subscription_schedule_id) {
                    // Το schedule εκτελέστηκε - downgrade completed
                    
                    const { planId, billingPeriod } = subscription.metadata;

                    if (!planId || !billingPeriod) {
                        console.error('Missing metadata in subscription:', stripeSubscriptionId);
                        break;
                    }

                    // Fetch new plan prices and limits
                    const { data: newPlan } = await supabase
                        .from('plans')
                        .select('stripe_price_id_monthly, stripe_price_id_yearly, cached_price_monthly, cached_price_yearly, included_branches')
                        .eq('id', planId)
                        .single();

                    if (!newPlan) {
                        console.error('Plan not found:', planId);
                        break;
                    }

                    const newPriceId = billingPeriod === 'monthly' 
                        ? newPlan.stripe_price_id_monthly 
                        : newPlan.stripe_price_id_yearly;

                    const newUnitAmount = billingPeriod === 'monthly'
                        ? newPlan.cached_price_monthly
                        : newPlan.cached_price_yearly;

                    // Update subscription
                    await supabase
                        .from('subscriptions')
                        .update({
                            plan_id: planId,
                            billing_period: billingPeriod,
                            stripe_subscription_schedule_id: null,
                            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', dbSubscription.id);

                    // Update subscription_items
                    await supabase
                        .from('subscription_items')
                        .update({
                            stripe_price_id: newPriceId,
                            unit_amount: newUnitAmount,
                            updated_at: new Date().toISOString()
                        })
                        .eq('subscription_id', dbSubscription.id)
                        .eq('item_type', 'plan');

                    // Disable extra stores when new plan has fewer allowed branches (mirror subscription.deleted logic)
                    const includedBranches = Math.max(1, newPlan.included_branches ?? 0);
                    const { data: activeStores } = await supabase
                        .from('stores')
                        .select('id, is_main')
                        .eq('company_id', dbSubscription.company_id)
                        .eq('is_active', true)
                        .order('is_main', { ascending: false })
                        .order('created_at', { ascending: true });
                    if (activeStores && activeStores.length > includedBranches) {
                        const toKeep = activeStores.slice(0, includedBranches);
                        const toKeepIds = toKeep.map(s => s.id);
                        const toDisable = activeStores.filter(s => !toKeepIds.includes(s.id));
                        if (toDisable.length > 0) {
                            const toDisableIds = toDisable.map(s => s.id);
                            await supabase
                                .from('stores')
                                .update({
                                    is_active: false,
                                    scheduled_deactivate_at: null,
                                    updated_at: new Date().toISOString()
                                })
                                .in('id', toDisableIds);
                            console.log(`Disabled ${toDisable.length} extra store(s) for company ${dbSubscription.company_id} (downgrade to plan ${planId})`);
                        }
                    }

                    console.log(`Downgrade completed for ${stripeSubscriptionId} to plan ${planId}`);
                    break;
                }

                // =============================================
                // 3. CHECK IF CANCEL_AT_PERIOD_END CHANGED
                // =============================================
                if (previousAttributes?.cancel_at_period_end !== undefined) {
                    await supabase
                        .from('subscriptions')
                        .update({
                            cancel_at_period_end: subscription.cancel_at_period_end,
                            cancel_at: subscription.cancel_at 
                                ? new Date(subscription.cancel_at * 1000).toISOString() 
                                : null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', dbSubscription.id);

                    console.log(`Cancel at period end updated to ${subscription.cancel_at_period_end}`);
                    break;
                }

                // =============================================
                // 4. CHECK IF STATUS CHANGED (for onboarding)
                // =============================================
                if (previousAttributes?.status) {
                    const newStatus = subscription.status;
                    const oldStatus = previousAttributes.status;

                    // incomplete -> active (onboarding completed via 3DS)
                    if (oldStatus === 'incomplete' && newStatus === 'active') {
                        await supabase
                            .from('subscriptions')
                            .update({
                                billing_status: 'active',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', dbSubscription.id);

                        console.log(`Subscription ${stripeSubscriptionId} activated (was incomplete)`);
                    }

                    // active -> past_due / unpaid
                    if (oldStatus === 'active' && (newStatus === 'past_due' || newStatus === 'unpaid')) {
                        await supabase
                            .from('subscriptions')
                            .update({
                                billing_status: newStatus,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', dbSubscription.id);

                        console.log(`Subscription ${stripeSubscriptionId} status changed to ${newStatus}`);
                    }

                    // past_due -> active (payment recovered)
                    if (oldStatus === 'past_due' && newStatus === 'active') {
                        await supabase
                            .from('subscriptions')
                            .update({
                                billing_status: 'active',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', dbSubscription.id);

                        console.log(`Subscription ${stripeSubscriptionId} recovered from past_due`);
                    }
                }

                console.log(`customer.subscription.updated processed for ${stripeSubscriptionId}`);
                break;
            }

            // Ε. SUBSCRIPTION CANCELED
            case 'customer.subscription.deleted': {
                const sub = event.data.object;

                console.log(`Processing customer.subscription.deleted for ${sub.id}`);

                // =============================================
                // 1. CHECK IF SUBSCRIPTION EXISTS
                // =============================================
                const { data: existingSubscription } = await supabase
                    .from('subscriptions')
                    .select('id, company_id, billing_status')
                    .eq('stripe_subscription_id', sub.id)
                    .maybeSingle();

                if (!existingSubscription) {
                    console.log(`Subscription ${sub.id} not in DB. Skipping.`);
                    break;
                }

                // Αν είναι ήδη canceled, skip
                if (existingSubscription.billing_status === 'canceled') {
                    console.log(`Subscription ${sub.id} already canceled. Skipping.`);
                    break;
                }

                const canceledByUserId = sub.metadata?.canceled_by_user_id;

                // =============================================
                // 2. GET BASIC PLAN
                // =============================================
                const { data: basicPlan, error: planErr } = await supabase
                    .from('plans')
                    .select('id')
                    .eq('key', 'basic')
                    .single();

                if (planErr || !basicPlan) {
                    console.error('Basic plan not found');
                    break;
                }

                // =============================================
                // 3. UPDATE SUBSCRIPTION TO BASIC
                // =============================================
                await supabase
                    .from('subscriptions')
                    .update({
                        plan_id: basicPlan.id,
                        billing_status: 'canceled',
                        billing_period: null,
                        stripe_subscription_id: null,
                        stripe_subscription_schedule_id: null,
                        cancel_at_period_end: false,
                        cancel_at: null,
                        canceled_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingSubscription.id);

                // =============================================
                // 4. CANCEL ALL SUBSCRIPTION ITEMS
                // =============================================
                await supabase
                    .from('subscription_items')
                    .update({
                        status: 'canceled',
                        updated_at: new Date().toISOString()
                    })
                    .eq('subscription_id', existingSubscription.id)
                    .eq('status', 'active');

                // =============================================
                // 5. DISABLE PAID PLUGINS
                // =============================================
                const { data: paidPlugins } = await supabase
                    .from('plugins')
                    .select('key')
                    .or('stripe_price_id_monthly.not.is.null,stripe_price_id_yearly.not.is.null');

                if (paidPlugins && paidPlugins.length > 0) {
                    const paidPluginKeys = paidPlugins.map(p => p.key);

                    await supabase
                        .from('company_plugins')
                        .update({
                            status: 'disabled',
                            disabled_reason: 'plan_limit',
                            deactivated_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('company_id', existingSubscription.company_id)
                        .eq('status', 'active')
                        .in('plugin_key', paidPluginKeys);
                }

                // =============================================
                // 6. DISABLE EXTRA USERS (keep only canceling user)
                // =============================================
                if (canceledByUserId) {
                    await supabase
                        .from('company_users')
                        .update({
                            status: 'disabled',
                            disabled_reason: 'plan_limit',
                            updated_at: new Date().toISOString()
                        })
                        .eq('company_id', existingSubscription.company_id)
                        .neq('user_id', canceledByUserId)
                        .eq('status', 'active');
                } else {
                    // Fallback: κράτα τον παλαιότερο owner
                    const { data: primaryOwner } = await supabase
                        .from('company_users')
                        .select('user_id')
                        .eq('company_id', existingSubscription.company_id)
                        .eq('is_owner', true)
                        .order('created_at', { ascending: true })
                        .limit(1)
                        .single();

                    await supabase
                        .from('company_users')
                        .update({
                            status: 'disabled',
                            disabled_reason: 'plan_limit',
                            updated_at: new Date().toISOString()
                        })
                        .eq('company_id', existingSubscription.company_id)
                        .neq('user_id', primaryOwner?.user_id)
                        .eq('status', 'active');
                }

                // =============================================
                // 7. DISABLE EXTRA STORES (keep only main)
                // =============================================
                await supabase
                    .from('stores')
                    .update({
                        is_active: false,
                        updated_at: new Date().toISOString()
                    })
                    .eq('company_id', existingSubscription.company_id)
                    .eq('is_main', false)
                    .eq('is_active', true);

                // =============================================
                // 8. SEND CANCELLATION EMAIL
                // =============================================
                const { data: company } = await supabase
                    .from('companies')
                    .select('name')
                    .eq('id', existingSubscription.company_id)
                    .single();

                const { data: companyUser } = await supabase
                    .from('company_users')
                    .select('user_id')
                    .eq('company_id', existingSubscription.company_id)
                    .eq('is_owner', true)
                    .single();

                if (companyUser) {
                    const { data: user } = await supabase
                        .from('users')
                        .select('email')
                        .eq('id', companyUser.user_id)
                        .single();

                    if (user && company) {
                        await sendSubscriptionCanceledEmail(user.email, company.name);
                        console.log(`Cancellation email sent to ${user.email}`);
                    }
                }

                console.log(`Company ${existingSubscription.company_id} downgraded to Basic plan`);
                break;
            }
        }

        res.send({ received: true });

    } catch (error) {
        console.error("Webhook processing failed:", error);
        res.status(500).send("Webhook handler failed");
    }
});

module.exports = router;