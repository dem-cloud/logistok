import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type ProductVariant = {
    id: number;
    product_id: number;
    name: string;
    sku: string | null;
    barcode: string | null;
    cost_price: number | null;
    sale_price: number | null;
    created_at: string;
};

export type VatRate = {
    id: number;
    name: string;
    rate: number;
};

export type Product = {
    id: number;
    name: string;
    description: string | null;
    product_category_id: number | null;
    unit_id: number | null;
    company_id: string;
    created_at: string;
    variants: ProductVariant[];
    category?: { id: number; name: string } | null;
    unit?: { id: number; unit_key: string; symbol: string | null } | null;
    vat_rate?: VatRate | null;
    vat_exempt?: boolean;
};

export type CreateProductParams = {
    name: string;
    description?: string | null;
    product_category_id?: number | null;
    unit_id?: number | null;
    vat_rate_id?: number | null;
    vat_exempt?: boolean;
    variants: Array<{
        name: string;
        sku?: string | null;
        barcode?: string | null;
        cost_price?: number | null;
        sale_price?: number | null;
    }>;
};

export type UpdateProductParams = {
    name?: string;
    description?: string | null;
    product_category_id?: number | null;
    unit_id?: number | null;
    vat_rate_id?: number | null;
    vat_exempt?: boolean;
};

export type CreateVariantParams = {
    name: string;
    sku?: string | null;
    barcode?: string | null;
    cost_price?: number | null;
    sale_price?: number | null;
};

export type UpdateVariantParams = {
    name?: string;
    sku?: string | null;
    barcode?: string | null;
    cost_price?: number | null;
    sale_price?: number | null;
};

// ============================================
// HOOK
// ============================================
export function useProducts(filters?: { categoryId?: number; search?: string }) {
    const { activeCompany } = useAuth();

    const query = useQuery<Product[]>({
        queryKey: ["products", activeCompany?.id, filters?.categoryId, filters?.search],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters?.categoryId) params.set("category_id", String(filters.categoryId));
            if (filters?.search) params.set("search", filters.search);
            const url = `/api/shared/company/products${params.toString() ? "?" + params.toString() : ""}`;
            const res = await axiosPrivate.get(url);
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης προϊόντων");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 2,
    });

    return {
        products: query.data ?? [],
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
    };
}

export function useProduct(id: number | null) {
    const { activeCompany } = useAuth();

    const query = useQuery<Product>({
        queryKey: ["product", activeCompany?.id, id],
        queryFn: async () => {
            const res = await axiosPrivate.get(`/api/shared/company/products/${id}`);
            if (res.data.success) return res.data.data;
            throw new Error(res.data.message || "Αποτυχία φόρτωσης προϊόντος");
        },
        enabled: !!activeCompany?.id && id != null,
        staleTime: 1000 * 60,
    });

    return {
        product: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

export function useProductMutations() {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const createProduct = useMutation({
        mutationFn: async (params: CreateProductParams) => {
            const res = await axiosPrivate.post("/api/shared/company/products", params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία δημιουργίας προϊόντος");
            return res.data.data as Product;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
        },
    });

    const updateProduct = useMutation({
        mutationFn: async ({ id, ...params }: { id: number } & UpdateProductParams) => {
            const res = await axiosPrivate.patch(`/api/shared/company/products/${id}`, params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία ενημέρωσης προϊόντος");
            return res.data.data as Product;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["product", activeCompany?.id, data.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
        },
    });

    const deleteProduct = useMutation({
        mutationFn: async (id: number) => {
            const res = await axiosPrivate.delete(`/api/shared/company/products/${id}`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία διαγραφής προϊόντος");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
        },
    });

    const createVariant = useMutation({
        mutationFn: async ({ productId, ...params }: { productId: number } & CreateVariantParams) => {
            const res = await axiosPrivate.post(`/api/shared/company/products/${productId}/variants`, params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία δημιουργίας παραλλαγής");
            return res.data.data as ProductVariant;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["product", activeCompany?.id, variables.productId] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
        },
    });

    const updateVariant = useMutation({
        mutationFn: async ({
            productId,
            variantId,
            ...params
        }: { productId: number; variantId: number } & UpdateVariantParams) => {
            const res = await axiosPrivate.patch(
                `/api/shared/company/products/${productId}/variants/${variantId}`,
                params
            );
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία ενημέρωσης παραλλαγής");
            return res.data.data as ProductVariant;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["product", activeCompany?.id, variables.productId] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
        },
    });

    const deleteVariant = useMutation({
        mutationFn: async ({ productId, variantId }: { productId: number; variantId: number }) => {
            const res = await axiosPrivate.delete(
                `/api/shared/company/products/${productId}/variants/${variantId}`
            );
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία διαγραφής παραλλαγής");
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["products", activeCompany?.id] });
            queryClient.invalidateQueries({ queryKey: ["product", activeCompany?.id, variables.productId] });
            queryClient.invalidateQueries({ queryKey: ["store-products", activeCompany?.id] });
        },
    });

    return {
        createProduct,
        updateProduct,
        deleteProduct,
        createVariant,
        updateVariant,
        deleteVariant,
    };
}

export default useProducts;
