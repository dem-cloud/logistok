import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";

export type NotificationPreferences = {
    email_invitations: boolean;
    email_marketing: boolean;
};

export function useNotificationPreferences() {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["notification-preferences"],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/auth/me/preferences");
            if (!res.data.success) throw new Error(res.data.message || "Failed to fetch preferences");
            return res.data.data.preferences as NotificationPreferences;
        },
    });

    const updatePreferences = useMutation({
        mutationFn: async (data: Partial<NotificationPreferences>) => {
            const res = await axiosPrivate.patch("/api/auth/me/preferences", data);
            if (!res.data.success) throw new Error(res.data.message || "Failed to update");
            return res.data.data.preferences as NotificationPreferences;
        },
        onSuccess: (data) => {
            queryClient.setQueryData(["notification-preferences"], data);
        },
    });

    return {
        preferences: query.data ?? {
            email_invitations: true,
            email_marketing: true,
        },
        isLoading: query.isLoading,
        updatePreferences,
    };
}
