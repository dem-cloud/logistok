import { axiosPrivate } from "@/api/axios";
import { useQuery } from "@tanstack/react-query";

export type BillingPeriod = "monthly" | "yearly";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled";

export interface Subscription {
  id: string;
  planId: string;

  billingPeriod: BillingPeriod;
  status: SubscriptionStatus;

  currentPeriodEnd: string; // ISO string
  cancelAtPeriodEnd: boolean;
}

export function useSubscription() {
    return useQuery<Subscription>({
        queryKey: ["subscription"],
        queryFn: async () => {
            const res = await axiosPrivate.get("/api/billing/subscription");

            // αναμένουμε:
            // { success: true, data: Subscription }
            return res.data.data;
        },
        staleTime: 1000 * 60 * 5, // 5 λεπτά
    });
}
