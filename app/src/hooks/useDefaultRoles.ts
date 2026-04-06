import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";

export type DefaultRole = {
    key: string;
    name: string;
    description: string | null;
    permission_keys: string[];
};

const EMPTY_DEFAULT_ROLES: DefaultRole[] = [];

export function useDefaultRoles() {
    const query = useQuery<DefaultRole[]>({
        queryKey: ["default-roles"],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/default-roles");
            if (res.data.success && res.data.data) return res.data.data;
            throw new Error(res.data.message || "Failed to fetch default roles");
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    return {
        defaultRoles: query.data ?? EMPTY_DEFAULT_ROLES,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

export default useDefaultRoles;
