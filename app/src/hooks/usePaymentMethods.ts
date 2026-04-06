import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type PaymentMethod = {
    id: string;
    key: string;
    name: string;
    type: "system" | "plugin" | "custom";
    priority: number;
    is_active: boolean;
};

// ============================================
// HOOK
// ============================================
export function usePaymentMethods() {
    const { activeCompany } = useAuth();

    const query = useQuery<PaymentMethod[]>({
        queryKey: ["payment-methods", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/company/payment-methods");
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης τρόπων πληρωμής");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    return {
        paymentMethods: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

export default usePaymentMethods;
