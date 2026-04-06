import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";

// ============================================
// TYPES (match backend response)
// ============================================
export type Plan = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    features: string[];
    
    max_users: number | null;
    max_products: number | null;
    included_branches: number;
    
    pricing: {
        monthly: number;
        yearly: number;
        display_monthly_from_yearly: number;
        yearly_discount_percent: number | null;
    };
    
    extra_store_pricing: {
        monthly: number;
        yearly: number;
        display_monthly_from_yearly: number | null;
        yearly_discount_percent: number | null;
    };
    
    is_free: boolean;
    is_popular: boolean;
    allows_paid_plugins: boolean;
    rank: number;
};

// ============================================
// HOOK
// ============================================
export function usePlans() {
    return useQuery<Plan[]>({
        queryKey: ["plans"],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/plans");
            return res.data.data;
        },
        staleTime: 1000 * 60 * 20, // 20 minutes
    });
}

export default usePlans;