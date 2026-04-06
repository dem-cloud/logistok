import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

export type StoresCapacity = {
    included_branches: number;
    active_store_count: number;
    extra_store_quantity: number;
    free_slots: number;
    max_stores: number;
    extra_store_unit_price_monthly: number;
    extra_store_unit_price_yearly: number;
    plan_id: string | null;
    plan_key: string | null;
    canAddExtraStores: boolean;
};

export function useStoresCapacity() {
    const { activeCompany } = useAuth();

    return useQuery<StoresCapacity>({
        queryKey: ["stores-capacity", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/company/stores-capacity");
            return res.data.data;
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 2,
    });
}
