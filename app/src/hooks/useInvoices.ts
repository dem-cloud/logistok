import { useQuery } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// TYPES
// ============================================
export type InvoiceStatus = "paid" | "pending" | "failed" | "void";

export type Invoice = {
    id: string;
    number: string;
    date: string;
    due_date: string;
    amount: number;
    currency: string;
    status: InvoiceStatus;
    description: string;
    pdf_url: string | null;
};

// ============================================
// HOOK
// ============================================
export function useInvoices() {
    const { activeCompany } = useAuth();

    return useQuery<Invoice[]>({
        queryKey: ["invoices", activeCompany?.id],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/shared/subscription/invoices");
            return res.data.data;
        },
        enabled: !!activeCompany?.id,
        staleTime: 1000 * 60 * 10, // 10 minutes
    });
}

export default useInvoices;