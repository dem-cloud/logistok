import { Plan } from "@/onboarding/types";
import styles from "./PlanCard.module.css";
import Button from "./reusable/Button";

type ButtonVariant = "outline" | "primary" | "secondary" | "dark" | "current";

interface PlanCardProps {
    plan: Plan;
    billingPeriod: "monthly" | "yearly";
    isPopular?: boolean;

    actionLabel: string;
    actionVariant?: ButtonVariant;
    actionDisabled?: boolean;

    onAction: (plan: Plan) => void;
}

export default function PlanCard ({ 
    plan,
    billingPeriod,
    isPopular = false,
    actionLabel,
    actionVariant = "primary",
    actionDisabled = false,
    onAction
 }: PlanCardProps) {

    const price =
    billingPeriod === "monthly"
      ? plan.pricing.monthly
      : plan.pricing.display_monthly_from_yearly;
      
    
    return (
        <div className={`${styles.card} ${isPopular ? styles.popular : ""}`}>
            {
                isPopular && 
                    <div className={styles.tag}>
                        Δημοφιλέστερο
                    </div>
            }

            <h3 className={styles.name}>{plan.name}</h3>
            <div className={styles.description}>{plan.description}</div>

            <div className={styles.priceRow}>
                <span className={styles.price}>{price}€</span>

                {(billingPeriod === "yearly" && plan.pricing.display_monthly_from_yearly !== 0) && (
                    <span className={styles.oldPrice}>
                        {plan.pricing.monthly}€
                    </span>
                )}
            </div>

            <div className={styles.featureList}>
                {plan.features.map((f, i) => (
                    <div key={i}>✓ {f}</div>
                ))}
            </div>

            <Button
                variant={actionVariant}
                disabled={actionDisabled}
                onClick={() => onAction(plan)}
            >
                {actionLabel}
            </Button>

            
        </div>
    );
};
