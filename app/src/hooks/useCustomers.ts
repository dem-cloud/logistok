import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type PaymentTermsValue = "immediate" | "15" | "30" | "60" | "90";

export type Customer = {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    tax_id: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
    notes: string | null;
    payment_terms?: PaymentTermsValue;
    company_id: string;
    created_at: string;
};

export type CreateCustomerParams = {
    full_name: string;
    phone?: string | null;
    email?: string | null;
    tax_id?: string | null;
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    country?: string | null;
    notes?: string | null;
    payment_terms?: PaymentTermsValue;
};

export type UpdateCustomerParams = {
    full_name?: string;
    phone?: string | null;
    email?: string | null;
    tax_id?: string | null;
    address?: string | null;
    city?: string | null;
    postal_code?: string | null;
    country?: string | null;
    notes?: string | null;
    payment_terms?: PaymentTermsValue;
};

// ============================================
// HOOK
// ============================================
export function useCustomers(filters?: { search?: string }) {
    const { activeCompany } = useAuth();

    const query = useQuery<Customer[]>({
        queryKey: ["customers", activeCompany?.id, filters?.search],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.search) params.set("search", filters.search);
            const url = `/api/shared/company/customers${params.toString() ? "?" + params.toString() : ""}`;
            const res = await axiosPrivate.get(url);
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης πελατών");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 2,
        placeholderData: (previousData) => previousData,
    });

    return {
        customers: query.data ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
    };
}

export function useCustomer(id: string | null) {
    const { activeCompany } = useAuth();

    const query = useQuery<Customer>({
        queryKey: ["customer", activeCompany?.id, id],
        queryFn: async () => {
            const res = await axiosPrivate.get(`/api/shared/company/customers/${id}`);
            if (res.data.success) return res.data.data;
            throw new Error(res.data.message || "Αποτυχία φόρτωσης πελάτη");
        },
        enabled: !!activeCompany?.id && !!id,
        staleTime: 1000 * 60,
    });

    return {
        customer: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

export function useCustomerOutstanding(id: string | null) {
    const { activeCompany } = useAuth();

    const query = useQuery<{ amount: number }>({
        queryKey: ["customerOutstanding", activeCompany?.id, id],
        queryFn: async () => {
            const res = await axiosPrivate.get(`/api/shared/company/customers/${id}/outstanding`);
            if (res.data.success) return res.data.data;
            return { amount: 0 };
        },
        enabled: !!activeCompany?.id && !!id,
        staleTime: 1000 * 30,
    });

    return {
        outstandingAmount: query.data?.amount ?? 0,
        isLoading: query.isLoading,
        refetch: query.refetch,
    };
}

export function useCustomerMutations() {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const createCustomer = useMutation({
        mutationFn: async (params: CreateCustomerParams) => {
            const res = await axiosPrivate.post("/api/shared/company/customers", params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία δημιουργίας πελάτη");
            return res.data.data as Customer;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customers", activeCompany?.id] });
        },
    });

    const updateCustomer = useMutation({
        mutationFn: async ({ id, ...params }: { id: string } & UpdateCustomerParams) => {
            const res = await axiosPrivate.patch(`/api/shared/company/customers/${id}`, params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία ενημέρωσης πελάτη");
            return res.data.data as Customer;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["customers", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["customer", activeCompany?.id, data.id] });
        },
    });

    const deleteCustomer = useMutation({
        mutationFn: async (id: string) => {
            const res = await axiosPrivate.delete(`/api/shared/company/customers/${id}`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία διαγραφής πελάτη");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customers", activeCompany?.id] });
        },
    });

    return {
        createCustomer,
        updateCustomer,
        deleteCustomer,
    };
}

export default useCustomers;
