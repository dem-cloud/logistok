import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type Invitation = {
    id: string;
    invited_email: string;
    token: string;
    status: string;
    expires_at: string;
    created_at: string;
    role: { id: string; key: string; name: string } | null;
    invited_by: string | null;
};

// ============================================
// HOOK
// ============================================
export function useInvitations() {
    const { activeCompany } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery<Invitation[]>({
        queryKey: ["company-invitations", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/company/invitations");
            if (res.data.success && res.data.data) return res.data.data;
            throw new Error(res.data.message || "Failed to fetch invitations");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60, // 1 minute
    });

    const invite = useMutation({
        mutationFn: async ({ email, role_id }: { email: string; role_id: string }) => {
            const res = await axiosPrivate.post("/api/shared/company/invite", { email, role_id });
            if (!res.data.success) throw new Error(res.data.message || "Failed to send invitation");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-invitations", activeCompany?.id] });
        },
    });

    const revoke = useMutation({
        mutationFn: async (invitationId: string) => {
            const res = await axiosPrivate.post(`/api/shared/company/invitations/${invitationId}/revoke`);
            if (!res.data.success) throw new Error(res.data.message || "Failed to revoke invitation");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["company-invitations", activeCompany?.id] });
        },
    });

    return {
        invitations: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
        invite,
        revoke,
    };
}

export default useInvitations;
