import PlanList from "@/components/PlanList";
import styles from '../OnboardingLayout.module.css'
import { usePlans } from "@/hooks/usePlans";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "../OnboardingContext";
import { Plan } from "../types";


export function PlanStep() {

    const { showToast } = useAuth();
    const { onboardingData, nextStep } = useOnboarding();
    const { data: plans = [] } = usePlans();

    const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(onboardingData.plan?.billing || "yearly");

    const handleSelectPlan = async (plan: Plan) => {

        try {
            const values = {
                id: plan.id,
                billing: billingPeriod
            }

            await nextStep({ plan: values });

        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        }
    }

    return (
        <div className={styles.content}>
            <div className={styles.title}>Επιλέξτε το πλάνο που ταιριάζει στις ανάγκες σας</div>
            <div className={styles.tagline}>Ολα τα πλάνα είναι προσαρμοσμένα να εξυπηρετούν ανάλογα τις ανάγκες του καθενός</div>

            <PlanList 
                plans = {plans}
                billingPeriod={billingPeriod}
                mode = "onboarding"
                onSelectPlan={(plan)=>handleSelectPlan(plan)}
                onBillingPeriodChange={setBillingPeriod}
            />

        </div>
    );
}
