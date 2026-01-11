const express = require('express');
const Stripe = require('stripe');
const { handlePriceSync } = require('../helpers/pricing/priceSync');
const supabase = require('../supabaseConfig');
const { sendPaymentReceiptEmail } = require('../helpers/emailService');

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
    console.log(event.type)
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
            // Β. ΟΛΟΚΛΗΡΩΣΗ ΣΥΝΔΡΟΜΗΣ (Activation)
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                if (!invoice.subscription) break;

                const stripeSubscriptionId = invoice.subscription;
                
                // Πάρε τα periods από τα Invoice Line Items
                const invoiceLine = invoice.lines.data[0];
                const periodStart = new Date(invoiceLine.period.start * 1000).toISOString();
                const periodEnd = new Date(invoiceLine.period.end * 1000).toISOString();

                // Update subscription
                const { data: subscription, error } = await supabase
                    .from('subscriptions')
                    .update({
                        billing_status: 'active',
                        current_period_start: periodStart,
                        current_period_end: periodEnd,
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', stripeSubscriptionId)
                    .select('id, company_id')
                    .single();

                if (error) {
                    console.error('Failed to activate subscription:', error);
                    throw error;
                }

                // Create payment history record
                const paymentHistoryPayload = {
                    subscription_id: subscription.id,
                    stripe_payment_intent_id: invoice.payment_intent,
                    stripe_invoice_id: invoice.id,
                    stripe_charge_id: invoice.charge,
                    amount: invoice.amount_paid / 100, // Convert from cents
                    currency: invoice.currency,
                    status: 'succeeded',
                    payment_method: invoice.payment_intent ? 'card' : null, // You can expand to get exact type
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
                    .insert(paymentHistoryPayload);

                if (paymentHistoryErr) {
                    console.error('Failed to create payment history:', paymentHistoryErr);
                    // Don't throw - subscription is already activated
                }

                // ===============================================
                // SEND RECEIPT EMAIL
                // ===============================================
                
                // Fetch company name
                const { data: company } = await supabase
                    .from('companies')
                    .select('name')
                    .eq('id', subscription.company_id)
                    .single();

                // Fetch owner from company_users
                const { data: companyUser } = await supabase
                    .from('company_users')
                    .select('user_id')
                    .eq('company_id', subscription.company_id)
                    .eq('is_owner', true)
                    .single();

                if (!companyUser) {
                    console.error('No owner found for company:', subscription.company_id);
                    break;
                }

                // Fetch user email
                const { data: user } = await supabase
                    .from('users')
                    .select('email')
                    .eq('id', companyUser.user_id)
                    .single();

                if (user && company) {
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
                }

                console.log(`Subscription ${stripeSubscriptionId} activated & receipt sent`);
                break;
            }
            // Failed Payments
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                if (!invoice.subscription) break;

                // Fetch subscription ID
                const { data: subscription } = await supabase
                    .from('subscriptions')
                    .select('id')
                    .eq('stripe_subscription_id', invoice.subscription)
                    .single();

                if (!subscription) break;

                // Create failed payment history record
                const paymentHistoryPayload = {
                    subscription_id: subscription.id,
                    stripe_payment_intent_id: invoice.payment_intent,
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
                    created_at: new Date(invoice.created * 1000).toISOString(),
                    updated_at: new Date().toISOString()
                };

                await supabase.from('payment_history').insert(paymentHistoryPayload);

                console.log(`Failed payment recorded for subscription ${invoice.subscription}`);
                break;
            }
            // SUBSCRIPTION STATUS CHANGES
            case 'customer.subscription.updated': {
                const sub = event.data.object;

                const { error } = await supabase
                    .from('subscriptions')
                    .update({
                        billing_status: sub.status, // active | past_due | unpaid | canceled
                        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
                        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', sub.id);

                if (error) throw error;

                console.log(`Subscription updated: ${sub.id} → ${sub.status}`);
                break;
            }
            // SUBSCRIPTION CANCELED
            case 'customer.subscription.deleted': {
                const sub = event.data.object;

                const { error } = await supabase
                    .from('subscriptions')
                    .update({
                        billing_status: 'canceled',
                        canceled_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', sub.id);

                if (error) throw error;

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