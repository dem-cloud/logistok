import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";

export type SessionInfo = {
    id: string;
    fingerprint: string;
    ip_address: string | null;
    user_agent: string | null;
    last_activity_at: string;
    last_login_at: string;
    is_current: boolean;
};

export function useSessions() {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["user-sessions"],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/auth/me/sessions");
            if (!res.data.success) throw new Error(res.data.message || "Failed to fetch sessions");
            return res.data.data.sessions as SessionInfo[];
        },
    });

    const revokeSession = useMutation({
        mutationFn: async (sessionId: string) => {
            const res = await axiosPrivate.delete(`/api/auth/me/sessions/${sessionId}`);
            if (!res.data.success) throw new Error(res.data.message || "Failed to revoke");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["user-sessions"] });
        },
    });

    const revokeAllOthers = useMutation({
        mutationFn: async () => {
            const res = await axiosPrivate.post("/api/auth/me/sessions/revoke-all");
            if (!res.data.success) throw new Error(res.data.message || "Failed to revoke");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["user-sessions"] });
        },
    });

    return {
        sessions: query.data ?? [],
        isLoading: query.isLoading,
        refetch: query.refetch,
        revokeSession,
        revokeAllOthers,
    };
}
