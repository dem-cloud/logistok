import { axiosPrivate } from "@/api/axios";
import LoadingSpinner from "@/components/LoadingSpinner";
import PlanList from "@/components/PlanList";
import SidePopup from "@/components/reusable/SidePopup";
import StripeCheckoutForm, { StripeCheckoutFormHandle } from "@/components/StripeCheckoutForm";
import { useAuth } from "@/contexts/AuthContext";
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

    const { activeCompany ,showToast } = useAuth()

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
    const [companyName, setCompanyName] = useState(activeCompany?.name || "");
    const [companyNameError, setCompanyNameError] = useState<string | undefined>(undefined);
    const [vatNumber, setVatNumber] = useState("");

    const validate = () => {
        if (!companyName.trim()) {
            setCompanyNameError("Το όνομα εταιρείας είναι υποχρεωτικό");
            return false;
        }

        setCompanyNameError(undefined);
        return true;
    };
    
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


    const handleChangePlan = async () => {
        
        if(!selectedPlan) return;

        const response = await axiosPrivate.post("/api/billing/change-plan", {
            planId: selectedPlan.id,
            billingPeriod
        });

        const { success } = response.data;

        if (!success) {
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            return;
        }
    }

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

                        billingPeriod={billingPeriod}
                        onBillingPeriodChange={handleBillingChange}

                        mode="admin"
                        loading={false}

                        companyName={companyName}
                        companyNameError={companyNameError}
                        onCompanyNameChange={(v) => {
                            setCompanyName(v);
                            setCompanyNameError(undefined);
                        }}
                        vatNumber = {vatNumber}
                        onVatNumberChange={setVatNumber}
                        validate={validate}

                        changePlan = {handleChangePlan}
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
