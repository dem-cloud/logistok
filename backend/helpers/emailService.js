const { Resend } = require('resend');
const { getWelcomeEmail, getPaymentReceiptEmail, getSubscriptionCanceledEmail, getPaymentFailedEmail } = require('./emailTemplates');
const supabase = require('../supabaseConfig');

const resend = new Resend(process.env.RESEND_API_KEY);

const NOTIFICATION_DEFAULTS = {
    email_invitations: true,
    email_marketing: true
};

/**
 * Check if user wants to receive a notification type.
 * @param {string} userId - User ID
 * @param {'email_invitations'|'email_marketing'} type
 * @returns {Promise<boolean>} - true = send, false = skip
 */
async function shouldSendNotification(userId, type) {
    if (!userId) return true;
    try {
        const { data: user } = await supabase
            .from('users')
            .select('notification_preferences')
            .eq('id', userId)
            .maybeSingle();
        const prefs = user?.notification_preferences;
        const merged = { ...NOTIFICATION_DEFAULTS, ...(typeof prefs === 'object' ? prefs : {}) };
        return merged[type] !== false;
    } catch {
        return true;
    }
}

/**
 * Send welcome email - για όλα τα plans (Free, Pro, Business)
 */
async function sendWelcomeEmail(userEmail, companyName, planName, isFree, nextPaymentDate = null) {
    try {
        const emailContent = getWelcomeEmail(companyName, planName, isFree, nextPaymentDate);
        
        const { data, error } = await resend.emails.send({
            from: `Olyntos <${process.env.RESEND_EMAIL}>`,
            to: userEmail,
            ...emailContent
        });

        if (error) {
            console.error('Resend API error:', error);
            return;
        }

        console.log(`Welcome email sent to ${userEmail}`, data);
    } catch (error) {
        console.error('Failed to send welcome email:', error);
    }
}

/**
 * Send payment receipt email - μόνο για paid plans, κάθε μήνα
 */
async function sendPaymentReceiptEmail(userEmail, companyName, paymentDetails) {
    try {
        const { 
            amount, 
            currency, 
            invoiceNumber, 
            periodStart, 
            periodEnd, 
            receiptUrl, 
            invoiceUrl 
        } = paymentDetails;
        
        const emailContent = getPaymentReceiptEmail(
            companyName,
            amount,
            currency,
            invoiceNumber,
            periodStart,
            periodEnd,
            receiptUrl,
            invoiceUrl
        );

        const { data, error } = await resend.emails.send({
            from: `Olyntos <${process.env.RESEND_EMAIL}>`,
            to: userEmail,
            ...emailContent
        });

        if (error) {
            console.error('Resend API error:', error);
            return;
        }

        console.log(`Receipt email sent to ${userEmail}`, data);
    } catch (error) {
        console.error('Failed to send receipt email:', error);
    }
}

/**
 * Send payment failed email - όταν αποτυγχάνει renewal payment
 */
async function sendPaymentFailedEmail(userEmail, companyName, failureDetails) {
    try {
        const { 
            amount, 
            currency, 
            invoiceNumber, 
            failureReason, 
            retryDate 
        } = failureDetails;
        
        const emailContent = getPaymentFailedEmail(
            companyName,
            amount,
            currency,
            invoiceNumber,
            failureReason,
            retryDate
        );

        const { data, error } = await resend.emails.send({
            from: `Olyntos <${process.env.RESEND_EMAIL}>`,
            to: userEmail,
            ...emailContent
        });

        if (error) {
            console.error('Resend API error:', error);
            return;
        }

        console.log(`Payment failed email sent to ${userEmail}`, data);
    } catch (error) {
        console.error('Failed to send payment failed email:', error);
    }
}

/**
 * Send subscription canceled email - όταν λήγει ή ακυρώνεται η συνδρομή
 */
async function sendSubscriptionCanceledEmail(userEmail, companyName) {
    try {
        
        const emailContent = getSubscriptionCanceledEmail(companyName);

        const { data, error } = await resend.emails.send({
            from: `Olyntos <${process.env.RESEND_EMAIL}>`,
            to: userEmail,
            ...emailContent
        });

        if (error) {
            console.error('Resend API error:', error);
            return;
        }

        console.log(`Subscription canceled email sent to ${userEmail}`, data);
    } catch (error) {
        console.error('Failed to send subscription canceled email:', error);
    }
}

// ================== Email Helpers ==================
async function sendWelcomeEmailIfNeeded(companyId, planId, periodEnd) {
    const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single();

    const { data: companyUser } = await supabase
        .from('company_users')
        .select('user_id')
        .eq('company_id', companyId)
        .eq('is_owner', true)
        .single();

    const { data: user } = await supabase
        .from('users')
        .select('email')
        .eq('id', companyUser?.user_id)
        .single();

    const { data: plan } = await supabase
        .from('plans')
        .select('name')
        .eq('id', planId)
        .single();

    if (company && user && plan) {
        const nextPaymentDate = new Date(periodEnd)
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
    }
}

async function sendPaymentReceiptEmailIfNeeded(companyId, invoice, invoiceLine) {
    const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single();

    const { data: companyUser } = await supabase
        .from('company_users')
        .select('user_id')
        .eq('company_id', companyId)
        .eq('is_owner', true)
        .single();

    const { data: user } = await supabase
        .from('users')
        .select('email')
        .eq('id', companyUser?.user_id)
        .single();

    if (company && user) {
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
}

module.exports = {
    sendWelcomeEmail,
    sendPaymentReceiptEmail,
    sendPaymentFailedEmail,
    sendSubscriptionCanceledEmail,
    shouldSendNotification,

    sendWelcomeEmailIfNeeded,
    sendPaymentReceiptEmailIfNeeded
};