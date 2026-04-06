import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";

// Permissions grouped by module: { sales: [...], products: [...], ... }
export type PermissionsByModule = Record<string, { key: string; name: string; description: string | null }[]>;

export function usePermissionsList() {
    return useQuery<PermissionsByModule>({
        queryKey: ["permissions"],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/permissions");
            if (res.data.success && res.data.data) return res.data.data;
            throw new Error(res.data.message || "Failed to fetch permissions");
        },
        staleTime: 1000 * 60 * 10, // 10 minutes - permissions rarely change
    });
}

export default usePermissionsList;
