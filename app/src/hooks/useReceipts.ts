import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type Receipt = {
    id: number;
    created_at: string;
    store_id: string;
    sale_id: number | null;
    customer_id: string | null;
    amount: number;
    payment_method_id: string | null;
    payment_date: string;
    notes: string | null;
    is_auto: boolean;
    payment_method_name?: string | null;
    customer_name?: string | null;
    invoice_number?: string | null;
};

export type ReceiptFilters = {
    store_id: string;
    from?: string;
    to?: string;
    payment_method_id?: string;
    payment_status?: string;
};

// ============================================
// HOOK
// ============================================
export function useReceipts(filters: ReceiptFilters) {
    const { activeCompany } = useAuth();

    const query = useQuery<Receipt[]>({
        queryKey: ["receipts", activeCompany?.id, filters],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.set("store_id", filters.store_id);
            if (filters.from) params.set("from", filters.from);
            if (filters.to) params.set("to", filters.to);
            if (filters.payment_method_id) params.set("payment_method_id", filters.payment_method_id);
            if (filters.payment_status) params.set("payment_status", filters.payment_status);
            const res = await axiosPrivate.get(`/api/shared/company/receipts?${params.toString()}`);
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης εισπράξεων");
        },
        enabled: !!activeCompany?.id && !!filters.store_id?.trim(),
        staleTime: 1000 * 60,
        placeholderData: (previousData) => previousData,
    });

    return {
        receipts: query.data ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
    };
}

export default useReceipts;
