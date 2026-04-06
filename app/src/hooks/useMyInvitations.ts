import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";

export type MyInvitation = {
    id: string;
    token: string;
    company: { id: string; name: string };
    role: { id: string; name: string };
    expires_at: string;
    created_at: string;
};

export function useMyInvitations() {
    const queryClient = useQueryClient();

    const query = useQuery<MyInvitation[]>({
        queryKey: ["my-invitations"],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/my-invitations");
            if (res.data.success && res.data.data) return res.data.data;
            throw new Error(res.data.message || "Failed to fetch invitations");
        },
        staleTime: 1000 * 60,
    });

    const acceptMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await axiosPrivate.post(`/api/shared/my-invitations/${id}/accept`);
            if (!res.data.success) throw new Error(res.data.message || "Failed to accept");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["my-invitations"] });
        },
    });

    const rejectMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await axiosPrivate.post(`/api/shared/my-invitations/${id}/reject`);
            if (!res.data.success) throw new Error(res.data.message || "Failed to reject");
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["my-invitations"] });
        },
    });

    return {
        invitations: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
        accept: acceptMutation,
        reject: rejectMutation,
    };
}

export default useMyInvitations;
