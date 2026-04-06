import { useMutation } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

export function useUserProfile() {
    const { user, me, setUser, setCompanies } = useAuth();

    const invalidateAndRefresh = async () => {
        try {
            const { user: updatedUser, companies } = await me();
            if (updatedUser) setUser(updatedUser);
            if (companies) setCompanies(companies);
            return updatedUser;
        } catch {
            return null;
        }
    };

    const updateProfile = useMutation({
        mutationFn: async (data: {
            first_name?: string | null;
            last_name?: string | null;
            phone?: string | null;
            avatar_url?: string | null;
        }) => {
            const res = await axiosPrivate.patch("/api/auth/me/profile", data);
            if (!res.data.success) throw new Error(res.data.message || "Failed to update");
            return res.data.data;
        },
        onSuccess: () => {
            invalidateAndRefresh();
        },
    });

    const uploadAvatar = useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append("avatar", file);
            const res = await axiosPrivate.post("/api/auth/me/avatar-upload", formData);
            if (!res.data.success) throw new Error(res.data.message || "Upload failed");
            return res.data.data.avatar_url as string;
        },
    });

    return {
        user,
        updateProfile,
        uploadAvatar,
    };
}
