import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type BillingItem = {
    item_type: "plan" | "extra_store" | "plugin";
    name: string;
    plugin_key: string | null;
    quantity: number;
    unit_amount: number;
};

export type PaymentMethod = {
    brand: string;
    last4: string;
    exp_month: string;
    exp_year: number;
};

export type BillingInfo = {
    name: string;
    taxId: string | null;
    address: string | null;
    city: string | null;
    postalCode: string | null;
    country: string | null;
};

export type BillingPeriod = "monthly" | "yearly";

export type BillingDetails = {
    items: BillingItem[];
    payment_method: PaymentMethod | null;
    billing_info: BillingInfo | null;
    billing_period?: BillingPeriod;
    next_billing: {
        amount: number;
        date: string;
    };
    currency: string;
    cancel_at_period_end: boolean;
};

// ============================================
// HOOK
// ============================================
export function useBillingDetails() {
    const { activeCompany } = useAuth();

    return useQuery<BillingDetails>({
        queryKey: ["billing-details", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/billing/billing-info");
            return res.data.data;
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

export default useBillingDetails;