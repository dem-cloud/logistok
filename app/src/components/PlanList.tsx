import { Plan } from "@/onboarding/types";
import PlanCard from "./PlanCard";
import styles from "./PlanList.module.css";

type BillingPeriod = "monthly" | "yearly";

interface PlanListProps {
    plans: Plan[];
    billingPeriod: "monthly" | "yearly";
    mode: "onboarding" | "admin";

    currentPlan?: Plan; // μόνο στο billing settings
    onSelectPlan: (plan: Plan) => void;
    onBillingPeriodChange: (period: BillingPeriod) => void;
}

type PlanAction = {
    actionLabel: string;
    actionVariant?: "outline" | "primary" | "secondary" | "dark" | "current";
    actionDisabled?: boolean;
};


export default function PlanList({ 
    plans,
    billingPeriod,
    mode,
    currentPlan,
    onSelectPlan,
    onBillingPeriodChange
}: PlanListProps) {

    const getActionProps = (plan: Plan): PlanAction => {
        // ONBOARDING: πάντα "Συνέχεια"
        if (mode === "onboarding") {
            return {
                actionLabel: "Συνέχεια"
            };
        }

        // BILLING SETTINGS
        if (currentPlan && plan.id === currentPlan.id) {
            return {
                actionLabel: "Τρέχον Πλάνο",
                actionVariant: "current",
                actionDisabled: true
            };
        }

        if (currentPlan && plan.rank > currentPlan.rank) {
            return {
                actionLabel: `Αναβάθμιση σε ${plan.name}`
            };
        }

        if (currentPlan && plan.rank < currentPlan.rank) {
            return {
                actionLabel: `Υποβάθμιση σε ${plan.name}`
            };
        }

        return {
            actionLabel: plan.name
        };
    }

    return (
        <div>
            {/* Toggle */}
            <div className={styles.toggleWrapper}>
                <div
                    className={`${styles.toggleBtn} ${
                        billingPeriod === "monthly" ? styles.toggleActive : ""
                    }`}
                    onClick={() => onBillingPeriodChange("monthly")}
                >
                    Μηνιαία
                </div>

                <div
                    className={`${styles.toggleBtn} ${
                        billingPeriod === "yearly" ? styles.toggleActive : ""
                    }`}
                    onClick={() => onBillingPeriodChange("yearly")}
                >
                    Ετήσια
                </div>
            </div>

            {/* Cards */}
            <div className={styles.cards}>
                {
                    plans.map((plan) => {

                        const action = getActionProps(plan);

                        return <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    billingPeriod={billingPeriod}
                                    isPopular={plan.is_popular}
                                    {...action}
                                    onAction={onSelectPlan}
                                />
                    })
                }
            </div>

        </div>
    );
};
