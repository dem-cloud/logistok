export function mapInvoiceStatus(stripeStatus) {
    const statusMap = {
        'paid': 'paid',
        'open': 'pending',
        'draft': 'pending',
        'uncollectible': 'failed',
        'void': 'void'
    };
    return statusMap[stripeStatus] || 'pending';
}