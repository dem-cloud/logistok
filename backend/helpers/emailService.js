const { Resend } = require('resend');
const { getWelcomeEmail, getPaymentReceiptEmail } = require('./emailTemplates');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send welcome email - για όλα τα plans (Free, Pro, Business)
 */
async function sendWelcomeEmail(userEmail, companyName, planName, isFree, nextPaymentDate = null) {
    try {
        const emailContent = getWelcomeEmail(companyName, planName, isFree, nextPaymentDate);
        
        const { data, error } = await resend.emails.send({
            from: `Logistok <${process.env.RESEND_EMAIL}>`,
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
            from: `Logistok <${process.env.RESEND_EMAIL}>`,
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

module.exports = {
    sendWelcomeEmail,
    sendPaymentReceiptEmail
};