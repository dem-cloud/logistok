import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
const EMPTY_INDUSTRIES: string[] = [];

export type CompanyProfile = {
    id: string;
    name: string | null;
    display_name: string | null;
    allow_negative_stock?: boolean;
    tax_id: string | null;
    tax_office: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
    logo_url: string | null;
    settings: Record<string, unknown> | null;
};

export type CompanyProfileData = {
    company: CompanyProfile;
    industries: string[];
};

// ============================================
// HOOK
// ============================================
export function useCompanyProfile() {
    const { activeCompany, me, setCompanies, setActiveCompany } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery<CompanyProfileData>({
        queryKey: ["company-profile", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/company");
            if (res.data.success && res.data.data) return res.data.data;
            throw new Error(res.data.message || "Failed to fetch company profile");
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 2, // 2 minutes
    });

    const invalidateAndRefresh = async () => {
        queryClient.invalidateQueries({ queryKey: ["company-profile", activeCompany?.id] });
        try {
            const { companies } = await me();
            setCompanies(companies);
            if (activeCompany?.id && companies.length > 0) {
                const match = companies.find((c) => c.id === activeCompany.id);
                if (match) setActiveCompany(match);
            }
        } catch {
            // Ignore - session refresh is best-effort
        }
    };

    const updateGeneral = useMutation({
        mutationFn: async (data: {
            name?: string;
            display_name?: string;
            phone?: string;
            email?: string;
            industries?: string[];
        }) => {
            const res = await axiosPrivate.patch("/api/shared/company/general", data);
            if (!res.data.success) throw new Error(res.data.message || "Failed to update");
        },
        onSuccess: () => {
            invalidateAndRefresh();
        },
    });

    const updateBranding = useMutation({
        mutationFn: async (data: { logo_url: string | null }) => {
            const res = await axiosPrivate.patch("/api/shared/company/branding", data);
            if (!res.data.success) throw new Error(res.data.message || "Failed to update");
        },
        onSuccess: (_data, variables) => {
            queryClient.setQueryData<CompanyProfileData>(
                ["company-profile", activeCompany?.id],
                (old) => (old ? { ...old, company: { ...old.company, logo_url: variables.logo_url } } : old)
            );
            invalidateAndRefresh();
        },
    });

    const uploadLogo = useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append("logo", file);
            const res = await axiosPrivate.post("/api/shared/company/logo-upload", formData);
            if (!res.data.success) throw new Error(res.data.message || "Upload failed");
            return res.data.data.logo_url as string;
        },
    });

    const updateLegal = useMutation({
        mutationFn: async (data: {
            tax_id?: string;
            tax_office?: string;
            address?: string;
            city?: string;
            postal_code?: string;
            country?: string;
        }) => {
            const res = await axiosPrivate.patch("/api/shared/company/legal", data);
            if (!res.data.success) throw new Error(res.data.message || "Failed to update");
        },
        onSuccess: () => {
            invalidateAndRefresh();
        },
    });

    const updateAllowNegativeStock = useMutation({
        mutationFn: async (allow_negative_stock: boolean) => {
            const res = await axiosPrivate.patch("/api/shared/company/settings/allow-negative-stock", {
                allow_negative_stock,
            });
            if (!res.data.success) throw new Error(res.data.message || "Failed to update");
        },
        onSuccess: (_data, variables) => {
            queryClient.setQueryData<CompanyProfileData>(
                ["company-profile", activeCompany?.id],
                (old) =>
                    old
                        ? { ...old, company: { ...old.company, allow_negative_stock: variables } }
                        : old
            );
            invalidateAndRefresh();
        },
    });

    return {
        data: query.data,
        company: query.data?.company ?? null,
        industries: query.data?.industries ?? EMPTY_INDUSTRIES,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
        updateGeneral,
        updateBranding,
        uploadLogo,
        updateLegal,
        updateAllowNegativeStock,
    };
}

export default useCompanyProfile;
