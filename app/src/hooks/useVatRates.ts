import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type VatRateOption = {
    id: number;
    name: string;
    rate: number;
    country_code: string;
    is_default: boolean;
};

// ============================================
// HOOK
// ============================================
export function useVatRates() {
    const { activeCompany } = useAuth();

    const query = useQuery<VatRateOption[]>({
        queryKey: ["vat-rates", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/company/vat-rates");
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης συντελεστών ΦΠΑ");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 10, // 10 minutes - VAT rates rarely change
    });

    const defaultRate = query.data?.find((r) => r.is_default);

    return {
        vatRates: query.data ?? [],
        defaultVatRateId: defaultRate?.id ?? null,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

export default useVatRates;
