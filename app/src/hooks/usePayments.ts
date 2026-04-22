import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type Payment = {
    id: number;
    created_at: string;
    store_id: string;
    purchase_id: number | null;
    vendor_id: string | null;
    amount: number;
    payment_method_id: string | null;
    payment_date: string;
    notes: string | null;
    is_auto: boolean;
    status: "draft" | "posted" | "reversed";
    payment_method_name?: string | null;
    vendor_name?: string | null;
    purchase_number?: string | null;
};

export type PaymentFilters = {
    store_id: string;
    from?: string;
    to?: string;
    payment_method_id?: string;
    payment_status?: string;
};

// ============================================
// HOOK
// ============================================
export function usePayments(filters: PaymentFilters) {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery<Payment[]>({
        queryKey: ["payments", activeCompany?.id, filters],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.set("store_id", filters.store_id);
            if (filters.from) params.set("from", filters.from);
            if (filters.to) params.set("to", filters.to);
            if (filters.payment_method_id) params.set("payment_method_id", filters.payment_method_id);
            if (filters.payment_status) params.set("payment_status", filters.payment_status);
            const res = await axiosPrivate.get(`/api/shared/company/payments?${params.toString()}`);
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης πληρωμών");
        },
        enabled: !!activeCompany?.id && !!filters.store_id?.trim(),
        staleTime: 1000 * 60,
        placeholderData: (previousData) => previousData,
    });

    const createPayment = useMutation({
        mutationFn: async (params: {
            store_id: string;
            purchase_id: number;
            vendor_id?: string | null;
            amount?: number;
            payment_method_id?: string;
            payment_date?: string;
            notes?: string | null;
        }) => {
            const res = await axiosPrivate.post("/api/shared/company/payments", params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία δημιουργίας πληρωμής");
            return res.data.data as Payment;
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["payments", activeCompany?.id] }),
                queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany?.id] }),
                queryClient.invalidateQueries({ queryKey: ["purchase", activeCompany?.id] }),
            ]);
        },
    });

    const updatePayment = useMutation({
        mutationFn: async (params: {
            id: number;
            status?: string;
            amount?: number;
            payment_method_id?: string;
            payment_date?: string;
            notes?: string | null;
        }) => {
            const { id, ...body } = params;
            const res = await axiosPrivate.patch(`/api/shared/company/payments/${id}`, body);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία ενημέρωσης πληρωμής");
            return res.data.data as Payment;
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["payments", activeCompany?.id] }),
                queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany?.id] }),
                queryClient.invalidateQueries({ queryKey: ["purchase", activeCompany?.id] }),
            ]);
        },
    });

    const deletePayment = useMutation({
        mutationFn: async (id: number) => {
            const res = await axiosPrivate.delete(`/api/shared/company/payments/${id}`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία διαγραφής πληρωμής");
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["payments", activeCompany?.id] }),
                queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany?.id] }),
                queryClient.invalidateQueries({ queryKey: ["purchase", activeCompany?.id] }),
            ]);
        },
    });

    return {
        payments: query.data ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
        createPayment,
        updatePayment,
        deletePayment,
    };
}

export default usePayments;
