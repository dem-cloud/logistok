import { useMutation } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";

export function useChangePassword() {
    return useMutation({
        mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
            const res = await axiosPrivate.post("/api/auth/me/change-password", data);
            if (!res.data.success) throw new Error(res.data.message || "Failed to change password");
        },
    });
}
