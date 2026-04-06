import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type Unit = {
    id: number;
    unit_key: string;
    name_singular: string;
    name_plural: string;
    symbol: string | null;
    decimals: number;
    is_system: boolean;
};

// ============================================
// HOOK
// ============================================
export function useUnits() {
    const { activeCompany } = useAuth();

    const query = useQuery<Unit[]>({
        queryKey: ["units"],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/units");
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης μονάδων");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 10, // 10 minutes - units rarely change
    });

    return {
        units: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

export default useUnits;
