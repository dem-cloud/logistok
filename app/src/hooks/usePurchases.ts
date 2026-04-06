import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type PurchaseItem = {
    id: number;
    product_id: number;
    product_variant_id: number;
    quantity: number;
    cost_price: number;
    total_cost: number;
    vat_rate?: number;
    vat_exempt?: boolean;
    po_line_id?: number | null;
    is_extra?: boolean;
};

export type PurchasePayment = {
    id: number;
    amount: number;
    payment_method_id: string;
    payment_date: string;
    notes: string | null;
    is_auto?: boolean;
};

export type Purchase = {
    id: number;
    created_at: string;
    store_id: string;
    vendor_id: string | null;
    payment_method_id: string;
    total_amount: number;
    status: string;
    notes: string | null;
    subtotal: number | null;
    vat_total: number | null;
    invoice_number: string | null;
    invoice_date: string | null;
    document_type?: string;
    converted_from_id?: number | null;
    converted_to?: { id: number; document_type: string; invoice_number: string } | null;
    return_from?: { id: number; document_type: string; invoice_number: string } | null;
    /** PO only: linked GRN / PUR rows (from converted_from_id chain) */
    linked_documents?: Array<{ id: number; document_type: string; invoice_number: string | null; status?: string }>;
    /** GRN from PO: source order for ordered qty per line */
    source_purchase?: {
        id: number;
        invoice_number: string | null;
        status?: string;
        purchase_items: PurchaseItem[];
    } | null;
    /** GRN from PO: cumulative received per PO line id (excludes current draft GRN) */
    po_line_received_totals?: Record<string, number> | null;
    payment_terms?: string | null;
    due_date?: string | null;
    payment_status?: string | null;
    amount_due?: number | null;
    payments?: PurchasePayment[];
    purchase_items: PurchaseItem[];
    store?: { id: string; name: string } | null;
    vendor?: { id: string; name: string } | null;
};

export type PurchaseItemInput = {
    product_id: number;
    product_variant_id: number;
    quantity: number;
    cost_price: number;
    vat_rate?: number;
    vat_exempt?: boolean;
    po_line_id?: number | null;
    is_extra?: boolean;
};

export type CreatePurchaseParams = {
    store_id: string;
    vendor_id?: string | null;
    payment_method_id: string;
    invoice_number?: string | null;
    invoice_date?: string | null;
    status?: string;
    document_type?: "PUR" | "GRN" | "DBN" | "PO";
    payment_terms?: string | null;
    notes?: string | null;
    items: PurchaseItemInput[];
};

export type UpdatePurchaseParams = {
    vendor_id?: string | null;
    payment_method_id: string;
    invoice_number?: string | null;
    invoice_date?: string | null;
    status?: string;
    document_type?: "PUR" | "GRN" | "DBN" | "PO";
    payment_terms?: string | null;
    notes?: string | null;
    items: PurchaseItemInput[];
    confirm_negative_stock?: boolean;
};

// ============================================
// HOOK
// ============================================
export function usePurchases(filters?: {
    storeId?: string;
    vendorId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    documentType?: string;
    status?: string;
}) {
    const { activeCompany } = useAuth();

    const query = useQuery<Purchase[]>({
        queryKey: [
            "purchases",
            activeCompany?.id,
            filters?.storeId,
            filters?.vendorId,
            filters?.dateFrom,
            filters?.dateTo,
            filters?.search,
            filters?.documentType,
            filters?.status,
        ],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.storeId) params.set("store_id", filters.storeId);
            if (filters?.vendorId) params.set("vendor_id", filters.vendorId);
            if (filters?.dateFrom) params.set("date_from", filters.dateFrom);
            if (filters?.dateTo) params.set("date_to", filters.dateTo);
            if (filters?.search) params.set("search", filters.search);
            if (filters?.documentType) params.set("document_type", filters.documentType);
            if (filters?.status) params.set("status", filters.status);
            const url = `/api/shared/company/purchases${params.toString() ? "?" + params.toString() : ""}`;
            const res = await axiosPrivate.get(url);
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης αγορών");
        },
        enabled: !!activeCompany?.id && !!filters?.storeId,
        staleTime: 1000 * 60,
        placeholderData: (previousData) => previousData,
    });

    return {
        purchases: query.data ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
    };
}

export function usePurchase(id: number | null) {
    const { activeCompany } = useAuth();

    const query = useQuery<Purchase>({
        queryKey: ["purchase", activeCompany?.id, id],
        queryFn: async () => {
            const res = await axiosPrivate.get(`/api/shared/company/purchases/${id}`);
            if (res.data.success) return res.data.data;
            throw new Error(res.data.message || "Αποτυχία φόρτωσης αγοράς");
        },
        enabled: !!activeCompany?.id && id != null,
        staleTime: 1000 * 60,
    });

    return {
        purchase: id == null ? null : (query.data ?? null),
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

export function usePurchaseMutations() {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const createPurchase = useMutation({
        mutationFn: async (params: CreatePurchaseParams) => {
            const res = await axiosPrivate.post("/api/shared/company/purchases", params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία δημιουργίας αγοράς");
            return res.data.data as Purchase;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const updatePurchase = useMutation({
        mutationFn: async ({ id, ...params }: { id: number } & UpdatePurchaseParams) => {
            try {
                const res = await axiosPrivate.patch(`/api/shared/company/purchases/${id}`, params);
                if (!res.data.success) {
                    const err = new Error(res.data.message || "Αποτυχία ενημέρωσης αγοράς") as Error & {
                        code?: string;
                        requires_negative_stock_confirmation?: boolean;
                        insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
                    };
                    err.code = res.data.code;
                    err.requires_negative_stock_confirmation = res.data.requires_negative_stock_confirmation;
                    err.insufficientItems = res.data.insufficientItems as Array<{ product_name: string; variant_name: string; required: number; available: number }> | undefined;
                    throw err;
                }
                return res.data.data as Purchase;
            } catch (e: unknown) {
                const ax = e as { response?: { data?: { message?: string; code?: string; requires_negative_stock_confirmation?: boolean; insufficientItems?: unknown[] } } };
                if (ax.response?.data) {
                    const err = new Error(ax.response.data.message || "Αποτυχία ενημέρωσης αγοράς") as Error & {
                        code?: string;
                        requires_negative_stock_confirmation?: boolean;
                        insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
                    };
                    err.code = ax.response.data.code;
                    err.requires_negative_stock_confirmation = ax.response.data.requires_negative_stock_confirmation;
                    err.insufficientItems = ax.response.data.insufficientItems as Array<{ product_name: string; variant_name: string; required: number; available: number }> | undefined;
                    throw err;
                }
                throw e;
            }
        },
        onSuccess: (data, v) => {
            queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["purchase", activeCompany?.id, v.id] });
            const rawParent = data?.converted_from_id;
            if (rawParent != null) {
                const parentPoId = typeof rawParent === "number" ? rawParent : Number(rawParent);
                if (!Number.isNaN(parentPoId)) {
                    queryClient.invalidateQueries({ queryKey: ["purchase", activeCompany?.id, parentPoId] });
                }
            }
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const partialReturn = useMutation({
        mutationFn: async (params: { id: number; items: Array<{ purchase_item_id: number; quantity: number }> }) => {
            const res = await axiosPrivate.post(`/api/shared/company/purchases/${params.id}/partial-return`, {
                items: params.items,
            });
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία επιστροφής προϊόντων");
            return res.data.data as Purchase;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const createPayment = useMutation({
        mutationFn: async (params: {
            store_id: string;
            purchase_id: number;
            vendor_id?: string | null;
            amount: number;
            payment_method_id: string;
            payment_date?: string;
            notes?: string | null;
        }) => {
            const res = await axiosPrivate.post("/api/shared/company/payments", params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία καταχώρησης πληρωμής");
            return res.data.data;
        },
        onSuccess: (_, v) => {
            queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["purchase", activeCompany?.id, v.purchase_id] });
        },
    });

    const convertFromGrn = useMutation({
        mutationFn: async (id: number) => {
            const res = await axiosPrivate.post(`/api/shared/company/purchases/${id}/convert-from-grn`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία μετατροπής GRN σε τιμολόγιο");
            return res.data.data as Purchase;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const createGrnFromPo = useMutation({
        mutationFn: async (id: number) => {
            const res = await axiosPrivate.post(`/api/shared/company/purchases/${id}/create-grn`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία δημιουργίας δελτίου παραλαβής");
            return {
                purchase: res.data.data as Purchase,
                reused_existing_draft: Boolean(res.data.reused_existing_draft),
            };
        },
        onSuccess: (result, poId) => {
            queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["purchase", activeCompany?.id, poId] });
            if (result.purchase?.id != null) {
                queryClient.invalidateQueries({ queryKey: ["purchase", activeCompany?.id, result.purchase.id] });
            }
        },
    });

    const deletePurchase = useMutation({
        mutationFn: async (params: { id: number; confirm_negative_stock?: boolean }) => {
            try {
                const res = await axiosPrivate.delete(`/api/shared/company/purchases/${params.id}`, {
                    data: { confirm_negative_stock: params.confirm_negative_stock },
                });
                if (!res.data.success) {
                    const err = new Error(res.data.message || "Αποτυχία διαγραφής αγοράς") as Error & {
                        code?: string;
                        requires_negative_stock_confirmation?: boolean;
                        insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
                    };
                    err.code = res.data.code;
                    err.requires_negative_stock_confirmation = res.data.requires_negative_stock_confirmation;
                    err.insufficientItems = res.data.insufficientItems as Array<{ product_name: string; variant_name: string; required: number; available: number }> | undefined;
                    throw err;
                }
            } catch (e: unknown) {
                const ax = e as { response?: { data?: { message?: string; code?: string; requires_negative_stock_confirmation?: boolean; insufficientItems?: unknown[] } } };
                if (ax.response?.data) {
                    const err = new Error(ax.response.data.message || "Αποτυχία διαγραφής αγοράς") as Error & {
                        code?: string;
                        requires_negative_stock_confirmation?: boolean;
                        insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
                    };
                    err.code = ax.response.data.code;
                    err.requires_negative_stock_confirmation = ax.response.data.requires_negative_stock_confirmation;
                    err.insufficientItems = ax.response.data.insufficientItems as Array<{ product_name: string; variant_name: string; required: number; available: number }> | undefined;
                    throw err;
                }
                throw e;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["purchase", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    return {
        createPurchase,
        updatePurchase,
        deletePurchase,
        convertFromGrn,
        createGrnFromPo,
        partialReturn,
        createPayment,
    };
}

export default usePurchases;
