import { Plan } from "@/hooks/usePlans";
import { BillingPeriod } from "@/hooks/useSubscription";
import PlanCard from "./PlanCard";
import styles from "./PlanList.module.css";

interface PlanListProps {
    plans: Plan[];
    billingPeriod: BillingPeriod;
    mode: "onboarding" | "admin";
    currentPlan?: Plan;
    currentBillingPeriod?: BillingPeriod;
    scheduledPlanName?: string | null;
    scheduledBillingPeriod?: BillingPeriod | null;
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
    currentBillingPeriod,
    scheduledPlanName = null,
    scheduledBillingPeriod = null,
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

        // Scheduled change to this exact plan + period
        const isScheduledPlan = scheduledPlanName && 
            plan.name === scheduledPlanName && 
            billingPeriod === scheduledBillingPeriod;

        if (isScheduledPlan) {
            return {
                actionLabel: "Ακύρωση Αλλαγής",
                actionVariant: "outline",
                actionDisabled: false  // Enable so they can cancel
            };
        }

        // Current plan
        if (currentPlan && plan.id === currentPlan.id) {
            if (currentBillingPeriod !== billingPeriod) {
                // Αν το toggle διαφέρει, δείχνουμε αλλαγή περιόδου
                return {
                    actionLabel: billingPeriod === "yearly"
                        ? `Αλλαγή σε Ετήσιο`
                        : `Αλλαγή σε Μηνιαίο`,
                    actionVariant: "primary",
                    actionDisabled: false
                };
            }

            // Default current plan
            return {
                actionLabel: "Τρέχον Πλάνο",
                actionVariant: "current",
                actionDisabled: true
            };
        }

        // Upgrade
        if (currentPlan && plan.rank > currentPlan.rank) {
            return {
                actionLabel: `Αναβάθμιση σε ${plan.name}`
            };
        }

        // Downgrade
        if (currentPlan && plan.rank < currentPlan.rank && plan.key !== "basic") {
            return {
                actionLabel: `Υποβάθμιση σε ${plan.name}`
            };
        }

        return {
            actionLabel: ""
        };
    };

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
                    <span className={styles.saveBadge}>-17%</span>
                </div>
            </div>

            {/* Cards */}
            <div className={styles.cards}>
                {plans.map((plan) => {
                    const action = getActionProps(plan);

                    return (
                        <PlanCard
                            key={plan.id}
                            plan={plan}
                            billingPeriod={billingPeriod}
                            isPopular={plan.is_popular}
                            {...action}
                            onAction={onSelectPlan}
                        />
                    );
                })}
            </div>
        </div>
    );
}