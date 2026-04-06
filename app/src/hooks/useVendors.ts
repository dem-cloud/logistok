import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type PaymentTermsValue = "immediate" | "15" | "30" | "60" | "90";

export type Vendor = {
    id: string;
    name: string;
    contact_name: string | null;
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

export type CreateVendorParams = {
    name: string;
    contact_name?: string | null;
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

export type UpdateVendorParams = {
    name?: string;
    contact_name?: string | null;
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
export function useVendors(filters?: { search?: string }) {
    const { activeCompany } = useAuth();

    const query = useQuery<Vendor[]>({
        queryKey: ["vendors", activeCompany?.id, filters?.search],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.search) params.set("search", filters.search);
            const url = `/api/shared/company/vendors${params.toString() ? "?" + params.toString() : ""}`;
            const res = await axiosPrivate.get(url);
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης προμηθευτών");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 2,
        placeholderData: (previousData) => previousData,
    });

    return {
        vendors: query.data ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
    };
}

export function useVendor(id: string | null) {
    const { activeCompany } = useAuth();

    const query = useQuery<Vendor>({
        queryKey: ["vendor", activeCompany?.id, id],
        queryFn: async () => {
            const res = await axiosPrivate.get(`/api/shared/company/vendors/${id}`);
            if (res.data.success) return res.data.data;
            throw new Error(res.data.message || "Αποτυχία φόρτωσης προμηθευτή");
        },
        enabled: !!activeCompany?.id && !!id,
        staleTime: 1000 * 60,
    });

    return {
        vendor: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

export function useVendorOutstanding(id: string | null) {
    const { activeCompany } = useAuth();

    const query = useQuery<{ amount: number }>({
        queryKey: ["vendorOutstanding", activeCompany?.id, id],
        queryFn: async () => {
            const res = await axiosPrivate.get(`/api/shared/company/vendors/${id}/outstanding`);
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

export function useVendorMutations() {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const createVendor = useMutation({
        mutationFn: async (params: CreateVendorParams) => {
            const res = await axiosPrivate.post("/api/shared/company/vendors", params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία δημιουργίας προμηθευτή");
            return res.data.data as Vendor;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["vendors", activeCompany?.id] });
        },
    });

    const updateVendor = useMutation({
        mutationFn: async ({ id, ...params }: { id: string } & UpdateVendorParams) => {
            const res = await axiosPrivate.patch(`/api/shared/company/vendors/${id}`, params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία ενημέρωσης προμηθευτή");
            return res.data.data as Vendor;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["vendors", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["vendor", activeCompany?.id, data.id] });
        },
    });

    const deleteVendor = useMutation({
        mutationFn: async (id: string) => {
            const res = await axiosPrivate.delete(`/api/shared/company/vendors/${id}`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία διαγραφής προμηθευτή");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["vendors", activeCompany?.id] });
        },
    });

    return {
        createVendor,
        updateVendor,
        deleteVendor,
    };
}

export default useVendors;
