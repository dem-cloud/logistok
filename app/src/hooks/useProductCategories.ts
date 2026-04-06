import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type ProductCategory = {
    id: number;
    name: string;
    parent_id: number | null;
    company_id: string;
    created_at: string;
    parent?: { id: number; name: string } | null;
};

export type CreateProductCategoryParams = {
    name: string;
    parent_id?: number | null;
};

export type UpdateProductCategoryParams = {
    name?: string;
    parent_id?: number | null;
};

// ============================================
// HOOK
// ============================================
export function useProductCategories() {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery<ProductCategory[]>({
        queryKey: ["product-categories", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/company/product-categories");
            if (res.data.success) return res.data.data ?? [];
            throw new Error(res.data.message || "Αποτυχία φόρτωσης κατηγοριών");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 2, // 2 minutes
    });

    const createCategory = useMutation({
        mutationFn: async (params: CreateProductCategoryParams) => {
            const res = await axiosPrivate.post("/api/shared/company/product-categories", params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία δημιουργίας κατηγορίας");
            return res.data.data as ProductCategory;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-categories", activeCompany?.id] });
        },
    });

    const updateCategory = useMutation({
        mutationFn: async ({ id, ...params }: { id: number } & UpdateProductCategoryParams) => {
            const res = await axiosPrivate.patch(`/api/shared/company/product-categories/${id}`, params);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία ενημέρωσης κατηγορίας");
            return res.data.data as ProductCategory;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-categories", activeCompany?.id] });
        },
    });

    const deleteCategory = useMutation({
        mutationFn: async (id: number) => {
            const res = await axiosPrivate.delete(`/api/shared/company/product-categories/${id}`);
            if (!res.data.success) throw new Error(res.data.message || "Αποτυχία διαγραφής κατηγορίας");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-categories", activeCompany?.id] });
        },
    });

    return {
        categories: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
        createCategory,
        updateCategory,
        deleteCategory,
    };
}

export default useProductCategories;
