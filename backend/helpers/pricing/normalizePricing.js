export function normalizePricing(monthly, yearly) {
    
    if (!monthly && !yearly) return null;

    const displayMonthlyFromYearly =
        yearly ? Number((yearly / 12).toFixed(2)) : null;

    const discountPercent =
        monthly && yearly
        ? Math.round((1 - yearly / (monthly * 12)) * 100)
        : null;

    return {
        monthly,
        yearly,
        display_monthly_from_yearly: displayMonthlyFromYearly,
        yearly_discount_percent: discountPercent,
    }
}
