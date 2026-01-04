import LoadingSpinner from "@/components/LoadingSpinner";
import PlanList from "@/components/PlanList";
import SidePopup from "@/components/reusable/SidePopup";
import StripeCheckoutForm, { StripeCheckoutFormHandle } from "@/components/StripeCheckoutForm";
import { usePlans } from "@/hooks/usePlans";
import { useSubscription } from "@/hooks/useSubscription";
import { Plan } from "@/onboarding/types";
import { BillingPeriod } from "@/types/billing.types";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";


export default function BillingSettings() {

    const queryClient = useQueryClient();

    const { data: plans = [] } = usePlans();
    const { data: subscription } = useSubscription();

    const paymentFormRef = useRef<StripeCheckoutFormHandle>(null);

    // payload:
    // subscription = {
    //     id: string;
    //     planId: string;

    //     billingPeriod: "monthly" | "yearly";
    //     status: "active" | "trialing" | "past_due";

    //     currentPeriodEnd: string;
    //     cancelAtPeriodEnd: boolean;
    // }
    
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly");
    const [popupOpen, setPopupOpen] = useState(false);

    if(!subscription)
        return <LoadingSpinner />

    const currentPlan = plans.find( p => p.id === subscription.planId );

    const handleSelectPlan = (plan: Plan) => {
        setSelectedPlan(plan);
        setPopupOpen(true);
    }

    const handleBillingChange = async (period: BillingPeriod) => {
        setBillingPeriod(period);
    }

    const handleClosePopup = () => {
        setPopupOpen(false);
    };

    return (
        <>
            <PlanList
                plans={plans}
                billingPeriod={billingPeriod}
                mode="admin"
                currentPlan={currentPlan}
                onSelectPlan={(plan)=>handleSelectPlan(plan)}
                onBillingPeriodChange={setBillingPeriod}
            />

            {selectedPlan && (
                <SidePopup
                    isOpen={popupOpen}
                    onClose={handleClosePopup}
                    title="Ολοκλήρωση Πληρωμής"
                    width="520px"
                    footerLeftButton={{
                        label: "Ακύρωση",
                        variant: "outline",
                        onClick: handleClosePopup,
                        show: false
                    }}
                    footerRightButton={{
                        label: "Πληρωμή",
                        variant: "primary",
                        onClick: () => {
                            paymentFormRef.current?.submit();
                        },
                        show: true,
                        widthFull: true
                    }}
                >
                    <StripeCheckoutForm
                        ref={paymentFormRef}
                        planId={selectedPlan.id}

                        billingPeriod={billingPeriod}
                        onBillingPeriodChange={handleBillingChange}

                        mode="admin"
                        onSuccess={() => {
                            queryClient.invalidateQueries({ queryKey: ["subscription"] });
                            setPopupOpen(false)
                        }}
                    />
                </SidePopup>
            )}
        </>
    )
}
