import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type Role = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    permission_keys: string[];
};

export type CreateRoleFromTemplateParams = {
    default_role_key: string;
    /** Optional: override template permissions with user-selected ones */
    permission_keys?: string[];
};
export type CreateCustomRoleParams = { name: string; key?: string; description?: string; permission_keys: string[] };
export type UpdateRoleParams = { name?: string; description?: string };
export type UpdateRolePermissionsParams = { permission_keys: string[] };

// ============================================
// HOOK
// ============================================
export function useRoles() {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery<Role[]>({
        queryKey: ["company-roles", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/company/roles");
            if (res.data.success && res.data.data) return res.data.data;
            throw new Error(res.data.message || "Failed to fetch roles");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 2, // 2 minutes
    });

    const createFromTemplate = useMutation({
        mutationFn: async (params: CreateRoleFromTemplateParams) => {
            const res = await axiosPrivate.post("/api/shared/company/roles", params);
            if (!res.data.success) throw new Error(res.data.message || "Failed to create role");
            return res.data.data as Role;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-roles", activeCompany?.id] });
        },
    });

    const createCustom = useMutation({
        mutationFn: async (params: CreateCustomRoleParams) => {
            const res = await axiosPrivate.post("/api/shared/company/roles", params);
            if (!res.data.success) throw new Error(res.data.message || "Failed to create role");
            return res.data.data as Role;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-roles", activeCompany?.id] });
        },
    });

    const updateRole = useMutation({
        mutationFn: async ({ id, ...params }: { id: string } & UpdateRoleParams) => {
            const res = await axiosPrivate.put(`/api/shared/company/roles/${id}`, params);
            if (!res.data.success) throw new Error(res.data.message || "Failed to update role");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-roles", activeCompany?.id] });
        },
    });

    const updatePermissions = useMutation({
        mutationFn: async ({ id, permission_keys }: { id: string } & UpdateRolePermissionsParams) => {
            const res = await axiosPrivate.put(`/api/shared/company/roles/${id}/permissions`, { permission_keys });
            if (!res.data.success) throw new Error(res.data.message || "Failed to update permissions");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-roles", activeCompany?.id] });
        },
    });

    const deleteRole = useMutation({
        mutationFn: async (id: string) => {
            const res = await axiosPrivate.delete(`/api/shared/company/roles/${id}`);
            if (!res.data.success) throw new Error(res.data.message || "Failed to delete role");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-roles", activeCompany?.id] });
        },
    });

    return {
        roles: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
        createFromTemplate,
        createCustom,
        updateRole,
        updatePermissions,
        deleteRole,
    };
}

export default useRoles;
