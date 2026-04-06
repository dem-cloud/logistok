import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

export type CompanyPlugin = {
    plugin_key: string;
    status: string;
    disabled_reason: string | null;
    activated_at: string;
    settings: unknown;
    name: string;
    description: string | null;
    photo_url: string | null;
    cached_price_monthly: number | null;
    cached_price_yearly: number | null;
};

export function useCompanyPlugins() {
    const { activeCompany } = useAuth();

    return useQuery<CompanyPlugin[]>({
        queryKey: ["company-plugins", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/company-plugins");
            if (!res.data.success) throw new Error(res.data.message);
            return res.data.data;
        },
        enabled: !!activeCompany?.id,
    });
}
