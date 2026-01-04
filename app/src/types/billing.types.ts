
export type BillingPeriod = "monthly" | "yearly";

export interface PricePreviewParams {
    planId: string;
    billingPeriod: BillingPeriod;
    totalStores: number;
    plugins: string[];
}

/**
 * ⚠️ UI ONLY – NOT USED FOR BILLING
 */
export interface PricePreviewResponse {
    currency: {
        code: string;
        symbol: string;
    };

    plan: {
        id: string;
        name: string;
        billingPeriod: BillingPeriod;
        prices: {
            monthly: number;
            yearly: number;
            yearly_per_month: number;
            yearly_discount_percent: number;
        };
    };

    branches: {
        included: number;
        total: number;
        chargeable: number;
        unit_price_monthly: number;
        unit_price_yearly: number;
        total_price: number;
    };

    plugins: {
        key: string;
        name: string;
        prices: {
            monthly: number;
            yearly: number ;
            yearly_per_month: number ;
        };
        total_price: number;
    }[];

    summary: {
        subtotal: number;
        vat_percent: number;
        vat_amount: number;
        total: number;
        original_yearly_total: number;
    };
}
