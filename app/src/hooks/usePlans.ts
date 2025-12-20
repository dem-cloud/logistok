import { axiosPrivate } from "@/api/axios";
import { Plan } from "@/onboarding/types";
import { useQuery } from "@tanstack/react-query";

export function usePlans() {
    return useQuery<Plan[]>({
        queryKey: ["plans"],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/plans");
            return res.data.data;
        },
        staleTime: 1000 * 60 * 20, // 20 λεπτά
    });
}
