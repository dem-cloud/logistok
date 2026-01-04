const express = require('express');
const Stripe = require('stripe');
const { handlePriceSync } = require('../helpers/pricing/priceSync');
const supabase = require('../supabaseConfig');

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

                // Μόνο subscription invoices
                if (!invoice.subscription) break;

                const stripeSubscriptionId = invoice.subscription;

                // Παίρνουμε τη συνδρομή για timestamps
                const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

                const { error } = await supabase
                    .from('subscriptions')
                    .update({
                        billing_status: 'active',
                        current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
                        current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', stripeSubscriptionId);

                if (error) {
                    console.error('Failed to activate subscription:', error);
                    throw error;
                }

                console.log(`Subscription ${stripeSubscriptionId} activated`);
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
            // ΓΙΑ RECURRING ΠΛΗΡΩΜΕΣ (ΣΥΝΔΕΣΗ ΚΑΡΤΑΣ ΜΕ CUSTOMER)
            case 'setup_intent.succeeded': {
                const setupIntent = event.data.object;

                const customerId = setupIntent.customer;
                const paymentMethodId = setupIntent.payment_method;

                if (!customerId || !paymentMethodId) break;

                // Κάνουμε την κάρτα default για μελλοντικά invoices
                await stripe.customers.update(customerId, {
                    invoice_settings: {
                        default_payment_method: paymentMethodId
                    }
                });

                console.log(`Default payment method set for customer ${customerId}`);
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