import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type SaleItem = {
    id: number;
    product_id: number;
    product_variant_id: number;
    quantity: number;
    sale_price: number;
    total_price: number;
    vat_rate?: number;
    vat_exempt?: boolean;
};

import type { SalesDocType } from "@/config/documentTypes";

export type SaleReceipt = {
    id: number;
    amount: number;
    payment_method_id: string;
    payment_date: string;
    notes: string | null;
    is_auto: boolean;
};

export type Sale = {
    id: number;
    created_at: string;
    store_id: string;
    customer_id: string | null;
    payment_method_id: string;
    total_amount: number;
    status: string;
    notes: string | null;
    subtotal: number | null;
    vat_total: number | null;
    invoice_type: string;
    invoice_number: string | null;
    invoice_date?: string | null;
    amount_paid?: number | null;
    change_returned?: number | null;
    converted_from_id?: number | null;
    converted_to?: { id: number; invoice_type: string; invoice_number: string } | null;
    return_from?: { id: number; invoice_type: string; invoice_number: string } | null;
    /** SO only: DNO rows with converted_from_id = this SO (direct children). */
    linked_documents?: Array<{ id: number; invoice_type: string; invoice_number: string | null; status?: string | null }>;
    expiry_date?: string | null;
    payment_terms?: string | null;
    due_date?: string | null;
    payment_status?: string | null;
    amount_due?: number | null;
    receipts?: SaleReceipt[];
    sale_items: SaleItem[];
    store?: { id: string; name: string } | null;
    customer?: { id: string; full_name: string; email?: string | null } | null;
};

export type SaleItemInput = {
    product_id: number;
    product_variant_id: number;
    quantity: number;
    sale_price: number;
    vat_rate?: number;
    vat_exempt?: boolean;
};

export type CreateSaleParams = {
    store_id: string;
    customer_id?: string | null;
    payment_method_id: string;
    notes?: string | null;
    invoice_type?: SalesDocType;
    invoice_number?: string | null;
    invoice_date?: string | null;
    amount_paid?: number;
    status?: "draft" | "completed" | "sent";
    expiry_date?: string | null;
    payment_terms?: "immediate" | "15" | "30" | "60" | "90";
    items: SaleItemInput[];
    confirm_negative_stock?: boolean;
};

export type UpdateSaleParams = {
    customer_id?: string | null;
    payment_method_id: string;
    notes?: string | null;
    invoice_type?: SalesDocType;
    invoice_number?: string | null;
    invoice_date?: string | null;
    amount_paid?: number;
    status?: "draft" | "completed" | "cancelled" | "sent" | "expired";
    expiry_date?: string | null;
    payment_terms?: "immediate" | "15" | "30" | "60" | "90";
    items: SaleItemInput[];
    confirm_negative_stock?: boolean;
};

// ============================================
// HOOK
// ============================================
export function useSales(filters?: {
    storeId?: string;
    customerId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    documentType?: string;
    status?: string;
}) {
    const { activeCompany } = useAuth();

    const query = useQuery<Sale[]>({
        queryKey: [
            "sales",
            activeCompany?.id,
            filters?.storeId,
            filters?.customerId,
            filters?.dateFrom,
            filters?.dateTo,
            filters?.search,
            filters?.documentType,
            filters?.status,
        ],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.storeId) params.set("store_id", filters.storeId);
            if (filters?.customerId) params.set("customer_id", filters.customerId);
            if (filters?.dateFrom) params.set("date_from", filters.dateFrom);
            if (filters?.dateTo) params.set("date_to", filters.dateTo);
            if (filters?.search) params.set("search", filters.search);
            if (filters?.documentType) params.set("document_type", filters.documentType);
            if (filters?.status) params.set("status", filters.status);
            const url = `/api/shared/company/sales${params.toString() ? "?" + params.toString() : ""}`;
            const res = await axiosPrivate.get(url);
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης πωλήσεων");
        },
        enabled: !!activeCompany?.id && !!filters?.storeId,
        staleTime: 1000 * 60,
        placeholderData: (previousData) => previousData,
    });

    return {
        sales: query.data ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
    };
}

export function useSale(id: number | null) {
    const { activeCompany } = useAuth();

    const query = useQuery<Sale>({
        queryKey: ["sale", activeCompany?.id, id],
        queryFn: async () => {
            const res = await axiosPrivate.get(`/api/shared/company/sales/${id}`);
            if (res.data.success) return res.data.data;
            throw new Error(res.data.message || "Αποτυχία φόρτωσης πώλησης");
        },
        enabled: !!activeCompany?.id && id != null,
        staleTime: 1000 * 60,
    });

    return {
        sale: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

function createSaleErrorHandler(message: string) {
    return (e: unknown) => {
        const ax = e as { response?: { data?: { message?: string; code?: string; requires_negative_stock_confirmation?: boolean; insufficientItems?: unknown[] } } };
        if (ax.response?.data) {
            const err = new Error(ax.response.data.message || message) as Error & {
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
    };
}

export function useSaleMutations() {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const createSale = useMutation({
        mutationFn: async (params: CreateSaleParams) => {
            try {
                const res = await axiosPrivate.post("/api/shared/company/sales", params) as { data: { success: boolean; data?: unknown; message?: string; code?: string; requires_negative_stock_confirmation?: boolean; insufficientItems?: unknown[] } };
                if (!res.data.success) {
                    const err = new Error(res.data.message || "Αποτυχία δημιουργίας πώλησης") as Error & {
                        code?: string;
                        requires_negative_stock_confirmation?: boolean;
                        insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
                    };
                    err.code = res.data.code;
                    err.requires_negative_stock_confirmation = res.data.requires_negative_stock_confirmation;
                    err.insufficientItems = res.data.insufficientItems as Array<{ product_name: string; variant_name: string; required: number; available: number }> | undefined;
                    throw err;
                }
                return res.data.data as Sale;
            } catch (e: unknown) {
                createSaleErrorHandler("Αποτυχία δημιουργίας πώλησης")(e);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sales", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const updateSale = useMutation({
        mutationFn: async ({ id, ...params }: { id: number } & UpdateSaleParams) => {
            try {
                const res = await axiosPrivate.patch(`/api/shared/company/sales/${id}`, params);
                if (!res.data.success) {
                    const err = new Error(res.data.message || "Αποτυχία ενημέρωσης πώλησης") as Error & {
                        code?: string;
                        requires_negative_stock_confirmation?: boolean;
                        insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
                    };
                    err.code = res.data.code;
                    err.requires_negative_stock_confirmation = res.data.requires_negative_stock_confirmation;
                    err.insufficientItems = res.data.insufficientItems as Array<{ product_name: string; variant_name: string; required: number; available: number }> | undefined;
                    throw err;
                }
                return res.data.data as Sale;
            } catch (e: unknown) {
                createSaleErrorHandler("Αποτυχία ενημέρωσης πώλησης")(e);
            }
        },
        onSuccess: (_, v) => {
            queryClient.invalidateQueries({ queryKey: ["sales", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["sale", activeCompany?.id, v.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const acceptQuote = useMutation({
        mutationFn: async (id: number) => {
            try {
                const res = await axiosPrivate.post(`/api/shared/company/sales/${id}/accept-quote`);
                if (!res.data.success) throw new Error(res.data.message || "Αποτυχία αποδοχής προσφοράς");
                return res.data.data as Sale;
            } catch (e: unknown) {
                const ax = e as { response?: { data?: { message?: string } } };
                throw new Error(ax.response?.data?.message || (e as Error).message || "Αποτυχία αποδοχής προσφοράς");
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sales", activeCompany?.id] });
        },
    });

    const convertToReceipt = useMutation({
        mutationFn: async (id: number) => {
            try {
                const res = await axiosPrivate.post(`/api/shared/company/sales/${id}/convert-to-receipt`);
                if (!res.data.success) throw new Error(res.data.message || "Αποτυχία μετατροπής σε απόδειξη");
                return res.data.data as Sale;
            } catch (e: unknown) {
                const ax = e as { response?: { data?: { message?: string } } };
                throw new Error(ax.response?.data?.message || (e as Error).message || "Αποτυχία μετατροπής σε απόδειξη");
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sales", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const convertToInvoice = useMutation({
        mutationFn: async (id: number) => {
            try {
                const res = await axiosPrivate.post(`/api/shared/company/sales/${id}/convert-to-invoice`);
                if (!res.data.success) throw new Error(res.data.message || "Αποτυχία μετατροπής σε τιμολόγιο");
                return res.data.data as Sale;
            } catch (e: unknown) {
                const ax = e as { response?: { data?: { message?: string } } };
                throw new Error(ax.response?.data?.message || (e as Error).message || "Αποτυχία μετατροπής σε τιμολόγιο");
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sales", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const partialReturn = useMutation({
        mutationFn: async (params: { id: number; items: Array<{ sale_item_id: number; quantity: number }> }) => {
            const res = await axiosPrivate.post(`/api/shared/company/sales/${params.id}/partial-return`, {
                items: params.items,
            });
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία επιστροφής προϊόντων");
            return res.data.data as Sale;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sales", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const deleteSale = useMutation({
        mutationFn: async (params: { id: number; confirm_negative_stock?: boolean }) => {
            try {
                const res = await axiosPrivate.delete(`/api/shared/company/sales/${params.id}`, {
                    data: { confirm_negative_stock: params.confirm_negative_stock },
                });
                if (!res.data.success) {
                    const err = new Error(res.data.message || "Αποτυχία διαγραφής πώλησης") as Error & {
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
                createSaleErrorHandler("Αποτυχία διαγραφής πώλησης")(e);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sales", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    return {
        createSale,
        updateSale,
        deleteSale,
        acceptQuote,
        convertToReceipt,
        convertToInvoice,
        partialReturn,
    };
}

export default useSales;
