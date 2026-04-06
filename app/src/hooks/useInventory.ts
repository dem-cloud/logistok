import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type StoreProduct = {
    id: number | null;
    store_id: string;
    product_id: number;
    product_variant_id: number;
    stock_quantity: number;
    store_sale_price: number | null;
    product?: { id: number; name: string } | null;
    variant?: { id: number; name: string; sku: string | null } | null;
    unit?: { id: number; unit_key: string; symbol: string | null } | null;
};

export type AdjustParams = {
    store_id: string;
    product_id: number;
    product_variant_id: number;
    physical_quantity: number;
    confirm_negative_stock?: boolean;
};

export type TransferParams = {
    from_store_id: string;
    to_store_id: string;
    product_id: number;
    product_variant_id: number;
    quantity: number;
    confirm_negative_stock?: boolean;
};

// Ενδοδιακίνηση - multi-line transfer
export type TransferLine = {
    product_id: number;
    product_variant_id: number;
    quantity: number;
};

export type CreateTransferParams = {
    source_store_id: string;
    dest_store_id: string;
    lines: TransferLine[];
    status?: "draft" | "posted";
};

export type StockCountSession = {
    id: number;
    store_id: string;
    status: string;
    created_at: string;
    stock_count_lines?: StockCountLine[];
};

export type StockCountLine = {
    id: number;
    session_id: number;
    product_id: number;
    product_variant_id: number;
    system_quantity: number;
    counted_quantity: number | null;
    product?: { name: string } | null;
    product_variants?: { name: string; sku: string | null } | null;
};

export type StockMovement = {
    id: number;
    created_at: string;
    product_id: number;
    product_variant_id: number;
    quantity: number;
    movement_type: string;
    source: string;
    related_document_type: string | null;
    related_document_id: string | number | null;
    created_by: string | null;
    product_name: string | null;
    variant_name: string | null;
    variant_sku: string | null;
};

export type StockMovementFilters = {
    dateFrom?: string;
    dateTo?: string;
    movementType?: string;
};

// ============================================
// HOOKS
// ============================================
export function useStoreProducts(filters?: { storeId?: string; search?: string }) {
    const { activeCompany } = useAuth();

    const query = useQuery<StoreProduct[]>({
        queryKey: [
            "store-products",
            activeCompany?.id,
            filters?.storeId,
            filters?.search,
        ],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.storeId) params.set("store_id", filters.storeId);
            if (filters?.search) params.set("search", filters.search);
            const url = `/api/shared/company/store-products${params.toString() ? "?" + params.toString() : ""}`;
            const res = await axiosPrivate.get(url);
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης αποθεμάτων");
        },
        enabled: !!activeCompany?.id && !!filters?.storeId,
        staleTime: 1000 * 60,
        placeholderData: (previousData) => previousData,
    });

    return {
        storeProducts: query.data ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
    };
}

export function useStockMovements(storeId: string | undefined, filters?: StockMovementFilters) {
    const { activeCompany } = useAuth();

    const query = useQuery<StockMovement[]>({
        queryKey: [
            "stock-movements",
            activeCompany?.id,
            storeId,
            filters?.dateFrom,
            filters?.dateTo,
            filters?.movementType,
        ],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (storeId) params.set("store_id", storeId);
            if (filters?.dateFrom) params.set("date_from", filters.dateFrom);
            if (filters?.dateTo) params.set("date_to", filters.dateTo);
            if (filters?.movementType) params.set("movement_type", filters.movementType);
            const url = `/api/shared/company/stock-movements?${params.toString()}`;
            const res = await axiosPrivate.get(url);
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης κινήσεων");
        },
        enabled: !!activeCompany?.id && !!storeId,
        staleTime: 1000 * 60,
        placeholderData: (previousData) => previousData,
    });

    return {
        movements: query.data ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
    };
}

export function useInventoryMutations() {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const addAdjustment = useMutation({
        mutationFn: async (params: AdjustParams) => {
            try {
                const res = await axiosPrivate.post("/api/shared/company/inventory/adjust", params);
                if (!res.data.success) {
                    const err = new Error(res.data.message || "Αποτυχία προσαρμογής αποθέματος") as Error & {
                        code?: string;
                        requires_negative_stock_confirmation?: boolean;
                        insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
                    };
                    err.code = res.data.code;
                    err.requires_negative_stock_confirmation = res.data.requires_negative_stock_confirmation;
                    err.insufficientItems = res.data.insufficientItems as Array<{ product_name: string; variant_name: string; required: number; available: number }> | undefined;
                    throw err;
                }
                return res.data.data;
            } catch (e: unknown) {
                const ax = e as { response?: { data?: { message?: string; code?: string; requires_negative_stock_confirmation?: boolean; insufficientItems?: unknown[] } } };
                if (ax.response?.data) {
                    const err = new Error(ax.response.data.message || "Αποτυχία προσαρμογής αποθέματος") as Error & {
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
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const transfer = useMutation({
        mutationFn: async (params: TransferParams) => {
            try {
                const res = await axiosPrivate.post("/api/shared/company/inventory/transfer", params);
                if (!res.data.success) {
                    const err = new Error(res.data.message || "Αποτυχία μεταφοράς") as Error & {
                        code?: string;
                        requires_negative_stock_confirmation?: boolean;
                        insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
                    };
                    err.code = res.data.code;
                    err.requires_negative_stock_confirmation = res.data.requires_negative_stock_confirmation;
                    err.insufficientItems = res.data.insufficientItems as Array<{ product_name: string; variant_name: string; required: number; available: number }> | undefined;
                    throw err;
                }
                return res.data.data;
            } catch (e: unknown) {
                const ax = e as { response?: { data?: { message?: string; code?: string; requires_negative_stock_confirmation?: boolean; insufficientItems?: unknown[] } } };
                if (ax.response?.data) {
                    const err = new Error(ax.response.data.message || "Αποτυχία μεταφοράς") as Error & {
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
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const createTransfer = useMutation({
        mutationFn: async (params: CreateTransferParams) => {
            const res = await axiosPrivate.post("/api/shared/company/transfers", params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία δημιουργίας μεταφοράς");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const finalizeTransfer = useMutation({
        mutationFn: async (transferId: number) => {
            const res = await axiosPrivate.post(`/api/shared/company/transfers/${transferId}/finalize`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία οριστικοποίησης μεταφοράς");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const reverseTransfer = useMutation({
        mutationFn: async (transferId: number) => {
            const res = await axiosPrivate.post(`/api/shared/company/transfers/${transferId}/reverse`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία αντιστροφής μεταφοράς");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const createStockCount = useMutation({
        mutationFn: async (storeId: string) => {
            const res = await axiosPrivate.post("/api/shared/company/stock-counts", { store_id: storeId });
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία δημιουργίας απογραφής");
            return res.data.data as StockCountSession;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const updateStockCountLines = useMutation({
        mutationFn: async ({ sessionId, lines }: { sessionId: number; lines: Array<{ id: number; counted_quantity: number | null }> }) => {
            const res = await axiosPrivate.put(`/api/shared/company/stock-counts/${sessionId}/lines`, { lines });
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία ενημέρωσης απογραφής");
            return res.data.data as StockCountSession;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["stock-count", activeCompany?.id, variables.sessionId] });
        },
    });

    const finalizeStockCount = useMutation({
        mutationFn: async (sessionId: number) => {
            const res = await axiosPrivate.post(`/api/shared/company/stock-counts/${sessionId}/finalize`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία οριστικοποίησης απογραφής");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["stock-movements", activeCompany?.id] });
        },
    });

    const updateStoreSalePrice = useMutation({
        mutationFn: async (params: {
            store_id: string;
            product_id: number;
            product_variant_id: number;
            store_product_id: number | null;
            store_sale_price: number | null;
        }) => {
            if (params.store_product_id != null) {
                const res = await axiosPrivate.patch(
                    `/api/shared/company/store-products/${params.store_product_id}`,
                    { store_sale_price: params.store_sale_price }
                );
                if (!res.data.success) throw new Error(res.data.message || "Αποτυχία ενημέρωσης τιμής");
                return res.data.data;
            } else {
                const res = await axiosPrivate.post("/api/shared/company/store-products", {
                    store_id: params.store_id,
                    product_id: params.product_id,
                    product_variant_id: params.product_variant_id,
                    store_sale_price: params.store_sale_price,
                });
                if (!res.data.success) throw new Error(res.data.message || "Αποτυχία ενημέρωσης τιμής");
                return res.data.data;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
        },
    });

    return {
        addAdjustment,
        transfer,
        createTransfer,
        finalizeTransfer,
        reverseTransfer,
        createStockCount,
        updateStockCountLines,
        finalizeStockCount,
        updateStoreSalePrice,
    };
}

export function useStockCount(sessionId: number | null) {
    const { activeCompany } = useAuth();

    const query = useQuery<StockCountSession>({
        queryKey: ["stock-count", activeCompany?.id, sessionId],
        queryFn: async () => {
            if (!sessionId) throw new Error("No session");
            const res = await axiosPrivate.get(`/api/shared/company/stock-counts/${sessionId}`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία φόρτωσης απογραφής");
            return res.data.data;
        },
        enabled: !!activeCompany?.id && !!sessionId,
        staleTime: 0,
    });

    return {
        session: query.data,
        isLoading: query.isLoading,
        refetch: query.refetch,
    };
}

export default useStoreProducts;
