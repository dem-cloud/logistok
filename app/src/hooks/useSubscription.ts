import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";
import { PaymentMethod } from "./useBillingDetails";

// ============================================
// TYPES (match backend response)
// ============================================
export type BillingPeriod = "monthly" | "yearly";

export type BillingStatus = 
    | "incomplete"
    | "incomplete_expired"
    | "active"
    | "past_due"
    | "canceled"
    | "trialing";

export type BillingInfo = {
    name: string;
    taxId: string | null;
    taxOffice: string | null;
    address: string | null;
    city: string | null;
    postalCode: string | null;
    country: string | null;
}

export type Subscription = {
    plan_id: string;
    billing_period: BillingPeriod;
    billing_status: BillingStatus;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    company_users_count: number;
    store_products_count: number;
    scheduled_plan_name: string | null;
    scheduled_billing_period: BillingPeriod | null;
    card: PaymentMethod | null;
    billingInfo: BillingInfo | null;
};

// ============================================
// HOOK
// ============================================
export function useSubscription() {
    const { activeCompany } = useAuth();

    return useQuery<Subscription>({
        queryKey: ["subscription", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/billing/subscription");
            return res.data.data;
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

export default useSubscription;