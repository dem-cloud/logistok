import { axiosPrivate } from "@/api/axios";
import { useQuery } from "@tanstack/react-query";

type PluginScope = "onboarding" | "marketplace" | "upsell";

interface UsePluginsParams {
    scope: PluginScope;
    industries?: string[];
}

export function usePluginsRecommendations({ scope, industries = [] }: UsePluginsParams) {

  const normalizedIndustries = industries.slice().sort();

  return useQuery({
        queryKey: ["plugins-recommendations", scope, normalizedIndustries],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/plugins-recommendations", {
                params: {
                scope,
                industries: normalizedIndustries.length
                    ? normalizedIndustries.join(",")
                    : undefined
                }
            });

            return res.data.data;
        },
        staleTime: 1000 * 60 * 10
    });
}