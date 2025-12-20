import { axiosPrivate } from "@/api/axios";
import { Industry } from "@/onboarding/types";
import { useQuery } from "@tanstack/react-query";

export function useIndustries() {
    return useQuery<Industry[]>({
        queryKey: ["industries"],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/industries");
            return res.data.data;
        },
        staleTime: 1000 * 60 * 10
    });
}
