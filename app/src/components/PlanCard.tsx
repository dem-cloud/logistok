import { Plan } from "@/hooks/usePlans";
import { BillingPeriod } from "@/hooks/useSubscription";
import styles from "./PlanCard.module.css";
import Button from "./reusable/Button";

type ButtonVariant = "outline" | "primary" | "secondary" | "dark" | "current";

interface PlanCardProps {
    plan: Plan;
    billingPeriod: BillingPeriod;
    isPopular?: boolean;

    actionLabel: string;
    actionVariant?: ButtonVariant;
    actionDisabled?: boolean;

    onAction: (plan: Plan) => void;
}

export default function PlanCard({ 
    plan,
    billingPeriod,
    isPopular = false,
    actionLabel,
    actionVariant = "primary",
    actionDisabled = false,
    onAction
}: PlanCardProps) {

    const price = billingPeriod === "monthly"
        ? plan.pricing.monthly
        : plan.pricing.display_monthly_from_yearly;

    const originalPrice = plan.pricing.monthly;
    const showDiscount = billingPeriod === "yearly" && plan.pricing.display_monthly_from_yearly > 0;

    return (
        <div className={`${styles.card} ${isPopular ? styles.popular : ""} ${actionDisabled ? styles.current : ""}`}>
            {isPopular && (
                <div className={styles.tag}>
                    Δημοφιλέστερο
                </div>
            )}

            <h3 className={styles.name}>{plan.name}</h3>
            <div className={styles.description}>{plan.description}</div>

            <div className={styles.priceRow}>
                <span className={styles.price}>{price}€</span>
                <span className={styles.interval}>/μήνα</span>

                {showDiscount && (
                    <span className={styles.oldPrice}>
                        {originalPrice}€
                    </span>
                )}
            </div>

            {billingPeriod === "yearly" && plan.pricing.yearly > 0 && (
                <div className={styles.yearlyTotal}>
                    Χρέωση {plan.pricing.yearly}€ ανά έτος
                </div>
            )}

            <div className={styles.featureList}>
                {plan.features.map((feature, i) => (
                    <div key={i} className={styles.featureItem}>
                        <span className={styles.checkmark}>✓</span>
                        {feature}
                    </div>
                ))}
            </div>

            {actionLabel &&
                <Button
                    variant={actionVariant}
                    disabled={actionDisabled}
                    onClick={() => onAction(plan)}
                >
                    {actionLabel}
                </Button>
            }
        </div>
    );
}