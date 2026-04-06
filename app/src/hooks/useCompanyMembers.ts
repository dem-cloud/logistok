import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type CompanyMember = {
    id: string;
    user_id: string;
    is_owner: boolean;
    status: string;
    user: { id: string; email: string | null; first_name: string | null; last_name: string | null };
    role: { id: string; key: string; name: string } | null;
};

// ============================================
// HOOK
// ============================================
export function useCompanyMembers() {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery<CompanyMember[]>({
        queryKey: ["company-members", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/company/members");
            if (res.data.success && res.data.data) return res.data.data;
            throw new Error(res.data.message || "Failed to fetch members");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 2, // 2 minutes
    });

    const updateMemberRole = useMutation({
        mutationFn: async ({ userId, role_id }: { userId: string; role_id: string }) => {
            const res = await axiosPrivate.put(`/api/shared/company/members/${userId}/role`, { role_id });
            if (!res.data.success) throw new Error(res.data.message || "Failed to update role");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-members", activeCompany?.id] });
        },
    });

    const removeMember = useMutation({
        mutationFn: async (userId: string) => {
            const res = await axiosPrivate.delete(`/api/shared/company/members/${userId}`);
            if (!res.data.success) throw new Error(res.data.message || "Failed to remove member");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-members", activeCompany?.id] });
        },
    });

    const disableMember = useMutation({
        mutationFn: async (userId: string) => {
            const res = await axiosPrivate.patch(`/api/shared/company/members/${userId}/disable`);
            if (!res.data.success) throw new Error(res.data.message || "Failed to disable member");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-members", activeCompany?.id] });
        },
    });

    const reactivateMember = useMutation({
        mutationFn: async (userId: string) => {
            const res = await axiosPrivate.patch(`/api/shared/company/members/${userId}/reactivate`);
            if (!res.data.success) throw new Error(res.data.message || "Failed to reactivate member");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-members", activeCompany?.id] });
        },
    });

    const transferOwnership = useMutation({
        mutationFn: async (userId: string) => {
            const res = await axiosPrivate.patch(`/api/shared/company/members/${userId}/transfer-owner`);
            if (!res.data.success) throw new Error(res.data.message || "Failed to transfer ownership");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-members", activeCompany?.id] });
        },
    });

    return {
        members: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
        updateMemberRole,
        removeMember,
        disableMember,
        reactivateMember,
        transferOwnership,
    };
}

export default useCompanyMembers;
