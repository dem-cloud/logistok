const express = require('express');
const Stripe = require('stripe');
const { handlePriceSync } = require('../helpers/pricing/priceSync');
const supabase = require('../supabaseConfig');
const { sendPaymentReceiptEmail, sendWelcomeEmail, sendPaymentFailedEmail } = require('../helpers/emailService');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

router.post('/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
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

                // 1. Ανάκτηση της συνδρομής για να πάρουμε τα σωστά metadata
                const fullSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
                
                // 2. Λήψη των τιμών από τα metadata της συνδρομής
                const { companyId, planId, billingPeriod, subscriptionCode } = fullSubscription.metadata;

                // Έλεγχος αν υπάρχουν (ασφάλεια)
                if (!companyId || !planId || !billingPeriod || !subscriptionCode ) {
                    console.error('Missing values in invoice metadata:', invoice.id);
                    break; // Σημαντικό: δεν μπορούμε να το αντιστοιχίσουμε σε πελάτη
                }

                console.log(`Processing invoice.paid for Company ${companyId} (Sub ${stripeSubscriptionId})`);

                // Σωστή λήψη του paid_at από τα transitions
                const paidAtTimestamp = invoice.status_transitions.paid_at;
                const paidAtIso = paidAtTimestamp 
                    ? new Date(paidAtTimestamp * 1000).toISOString() 
                    : new Date().toISOString();

                // Get periods from Invoice Line Items
                const invoiceLine = invoice.lines.data[0];
                const periodStart = new Date(invoiceLine.period.start * 1000).toISOString();
                const periodEnd = new Date(invoiceLine.period.end * 1000).toISOString();

                const { data: createdSubscription, error: subError } = await supabase
                    .from('subscriptions')
                    .upsert({
                        company_id: companyId,
                        plan_id: planId,
                        stripe_subscription_id: stripeSubscriptionId,
                        subscription_code: subscriptionCode,
                        billing_period: billingPeriod,
                        // Θα είναι 'incomplete' μέχρι να ολοκληρωθεί η πληρωμή στο frontend
                        billing_status: 'active',
                        currency: invoice.currency,
                        // Χρήση της συνδρομής για τα κύρια periods
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

                
                if (subError || !createdSubscription) {
                    console.error('Failed to get subscription ID:', subError);
                    return;
                } 

                console.log(`Subscription ${stripeSubscriptionId} activated/updated`);

                // UPSERT payment history record (Ενημερώνει το 'pending' record σε 'paid')
                const paymentHistoryPayload = {
                    subscription_id: createdSubscription.id,
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

                const { error: paymentHistoryErr } = await supabase
                    .from('payment_history')
                    .upsert(paymentHistoryPayload, { 
                        onConflict: 'stripe_invoice_id' // Το κλειδί σύγκρουσης
                    });

                if (paymentHistoryErr) {
                    console.error('Failed to UPSERT payment history:', paymentHistoryErr);
                } else {
                    console.log(`Payment history updated/created for invoice ${invoice.id}`);
                }

                const { error: onboardingUpdateErr } = await supabase
                    .from('onboarding')
                    .update({
                        is_completed: true,
                        updated_at: new Date().toISOString()
                    })
                    .eq('company_id', companyId);

                if (onboardingUpdateErr) {
                    console.error('Could not update onboarding is_completed for company:', companyId);
                }

                // === Emails ===
                // Fetch company name
                const { data: company } = await supabase
                    .from('companies')
                    .select('name')
                    .eq('id', companyId)
                    .single();

                // Fetch owner from company_users
                const { data: companyUser } = await supabase
                    .from('company_users')
                    .select('user_id')
                    .eq('company_id', companyId)
                    .eq('is_owner', true)
                    .single();

                if (!company || !companyUser) {
                    console.error('No owner found for company:', companyId);
                    break;
                }

                // Fetch user email
                const { data: user } = await supabase
                    .from('users')
                    .select('email')
                    .eq('id', companyUser.user_id)
                    .single();

                if (!user) {
                    console.error('No user found');
                    break;
                }

                if (invoice.billing_reason === 'subscription_create') {

                    const { data: plan } = await supabase
                        .from('plans')
                        .select('name')
                        .eq('id', planId)
                        .single();

                    if (!plan) {
                        console.error('No plan found');
                        break;
                    }
                
                    // WELCOME EMAIL (Μόνο στην αρχική εγγραφή)
                    console.log(`Sending Welcome Email to ${user.email}`);

                    const nextPaymentDate = new Date(invoiceLine.period.end * 1000)
                        .toLocaleDateString('el-GR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                        });

                    await sendWelcomeEmail(
                        user.email,
                        company.name,
                        plan.name,
                        false,
                        nextPaymentDate
                    );

                } else {
                    console.log('Skipping Welcome Email (Reason: ' + invoice.billing_reason + ')');
                }

                await sendPaymentReceiptEmail(
                    user.email,
                    company.name,
                    {
                        amount: (invoice.amount_paid / 100).toFixed(2),
                        currency: invoice.currency.toUpperCase(),
                        invoiceNumber: invoice.number,
                        periodStart: new Date(invoiceLine.period.start * 1000).toLocaleDateString('el-GR'),
                        periodEnd: new Date(invoiceLine.period.end * 1000).toLocaleDateString('el-GR'),
                        receiptUrl: invoice.hosted_invoice_url,
                        invoiceUrl: invoice.invoice_pdf
                    }
                );

                console.log(`Subscription ${stripeSubscriptionId} activated & receipt sent`);
                break;
            }

            // Γ. Failed Payments
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const stripeSubscriptionId = invoice.subscription;

                if (!stripeSubscriptionId) break;

                let subscriptionIdForHistory = null;
                let companyIdForEmail = null;

                // 1. Ενημέρωση του status της συνδρομής σε 'past_due' ή 'incomplete'
                // Check if subscription exists
                const { data: subscription } = await supabase
                    .from('subscriptions')
                    .select('id, company_id')
                    .eq('stripe_subscription_id', stripeSubscriptionId)
                    .maybeSingle();

                // Ανάκτηση metadata από τη Stripe
                const fullSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

                if (!subscription) {
                    console.log(`Subscription ${stripeSubscriptionId} not in DB, creating it from metadata...`);

                    // Λήψη των τιμών από τα metadata της συνδρομής
                    const { companyId, planId, billingPeriod, subscriptionCode } = fullSubscription.metadata;

                    // Έλεγχος αν υπάρχουν (ασφάλεια)
                    if (!companyId || !planId || !billingPeriod || !subscriptionCode ) {
                        console.error('Missing values in subscription metadata:', fullSubscription.metadata);
                        break;
                    }

                    // Ασφαλής λήψη περιόδων
                    const invoiceLine = invoice.lines.data[0];
                    const periodStart = invoiceLine 
                        ? new Date(invoiceLine.period.start * 1000).toISOString() 
                        : new Date().toISOString();
                    const periodEnd = invoiceLine 
                        ? new Date(invoiceLine.period.end * 1000).toISOString() 
                        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

                    // Δημιουργούμε τη συνδρομή στη βάση ως 'incomplete'
                    const { data: newSub, error: subError } = await supabase
                        .from('subscriptions')
                        .upsert({
                            company_id: companyId,
                            plan_id: planId,
                            stripe_subscription_id: stripeSubscriptionId,
                            subscription_code: subscriptionCode,
                            billing_period: billingPeriod,
                            billing_status: fullSubscription.status, // θα είναι 'incomplete'
                            currency: invoice.currency,
                            // Χρήση της συνδρομής για τα κύρια periods
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
                    // Ανανέωσε το status αφού τη βρήκαμε
                    await supabase
                        .from('subscriptions')
                        .update({
                            billing_status: fullSubscription.status, // π.χ. 'incomplete', 'past_due'
                            updated_at: new Date().toISOString()
                        })
                        .eq('stripe_subscription_id', stripeSubscriptionId);


                    subscriptionIdForHistory = subscription.id;
                    companyIdForEmail = subscription.company_id;
                }

                // 2. Καταγραφή στο Payment History
                const paymentHistoryPayload = {
                    subscription_id: subscriptionIdForHistory,
                    stripe_payment_intent_id: invoice.payment_intent || null,
                    stripe_invoice_id: invoice.id,
                    stripe_charge_id: invoice.charge,
                    amount: invoice.amount_due / 100,
                    currency: invoice.currency,
                    status: 'failed',
                    payment_method: 'card',
                    failure_reason: invoice.last_payment_error?.message || 'Payment failed',
                    metadata: {
                        billing_reason: invoice.billing_reason,
                        attempt_count: invoice.attempt_count
                    },
                    updated_at: new Date().toISOString()
                };

                await supabase
                    .from('payment_history')
                    .upsert(paymentHistoryPayload, { 
                        onConflict: 'stripe_invoice_id' // Το κλειδί σύγκρουσης
                    });

                // 3. ΑΠΟΣΤΟΛΗ EMAIL ΑΠΟΤΥΧΙΑΣ (Dunning Email)

                // Έλεγχος: Είναι η πρώτη πληρωμή ή ανανέωση;
                const isOnboarding = invoice.billing_reason === 'subscription_create';
                const isRenewal = invoice.billing_reason === 'subscription_cycle';

                if (isRenewal && companyIdForEmail) {
                    // ΣΤΕΙΛΕ EMAIL ΑΜΕΣΩΣ
                    // Ο χρήστης πρέπει να μάθει ότι η κάρτα του απέτυχε στην αυτόματη χρέωση.

                    // Get company name
                    const { data: company } = await supabase
                        .from('companies')
                        .select('name')
                        .eq('id', companyIdForEmail)
                        .single();

                    // Get company owner
                    const { data: companyUser } = await supabase
                        .from('company_users')
                        .select('user_id')
                        .eq('company_id', companyIdForEmail)
                        .eq('is_owner', true)
                        .single();

                    if (companyUser) {
                        // Get user email
                        const { data: user } = await supabase
                            .from('users')
                            .select('email')
                            .eq('id', companyUser.user_id)
                            .single();

                        if (user && company) {
                            // Calculate retry date (if Stripe provides it)
                            const retryDate = invoice.next_payment_attempt 
                                ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('el-GR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                })
                                : null;

                            // Send payment failed email
                            await sendPaymentFailedEmail(
                                user.email,
                                company.name,
                                {
                                    amount: (invoice.amount_due / 100).toFixed(2),
                                    currency: invoice.currency.toUpperCase(),
                                    invoiceNumber: invoice.number,
                                    failureReason: invoice.last_payment_error?.message || 'Η κάρτα σας απορρίφθηκε',
                                    retryDate: retryDate
                                }
                            );

                            console.log(`Payment failed email sent to ${user.email}`);
                        }
                    }
                }
                
                if (isOnboarding) {
                    // ΠΡΟΑΙΡΕΤΙΚΑ: Καταγραφή στο DB/Logs για να τον πάρεις τηλέφωνο 
                    // ή να στείλεις email μετά από 24 ώρες αν δεν έχει γίνει active. (προγραμματισμένο job CRON)
                    console.log("Onboarding failure - user is likely seeing this on screen.");
                }

                console.log(`Failed payment recorded for subscription ${stripeSubscriptionId}`);
                break;
            }

            // Δ. SUBSCRIPTION STATUS CHANGES
            case 'customer.subscription.updated': {
                const sub = event.data.object;

                // 1. Προετοιμασία των ημερομηνιών (Από το root του sub object)
                const periodStart = new Date(sub.current_period_start * 1000).toISOString();
                const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

                // 2. ΜΟΝΟ UPDATE
                const { data, error } = await supabase
                    .from('subscriptions')
                    .update({
                        billing_status: sub.status, // π.χ. active, past_due, trialing
                        current_period_start: periodStart,
                        current_period_end: periodEnd,
                        cancel_at_period_end: sub.cancel_at_period_end, // ✅ Ενημέρωσε αν ο χρήστης πάτησε "ακύρωση στο τέλος του μήνα"
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', sub.id)
                    .select('id');

                if (error) {
                    console.error(`Failed to update subscription ${sub.id}:`, error);
                    // Δεν κάνουμε throw για να μην κολλήσει το webhook queue της Stripe
                } 

                if (!data || data.length === 0) {
                    console.log(`Subscription ${sub.id} not found in DB. Likely still in onboarding.`);
                    break;
                }

                console.log(`Subscription updated in DB: ${sub.id} status: ${sub.status}`);
                break;
            }

            // Ε. SUBSCRIPTION CANCELED
            case 'customer.subscription.deleted': {
                const sub = event.data.object;

                // ✅ Check if subscription exists
                const { data: existingSubscription } = await supabase
                    .from('subscriptions')
                    .select('id')
                    .eq('stripe_subscription_id', sub.id)
                    .maybeSingle();

                if (!existingSubscription) {
                    console.log(`Subscription ${sub.id} not in DB. Skipping cancellation.`);
                    break;
                }

                const { error } = await supabase
                    .from('subscriptions')
                    .update({
                        billing_status: 'canceled',
                        canceled_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', sub.id);

                if (error) {
                    console.error('Failed to cancel subscription:', error);
                    throw error;
                }

                console.log(`Subscription canceled: ${sub.id}`);
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