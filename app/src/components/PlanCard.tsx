import styles from "./PlanCard.module.css";
import Button from "./reusable/Button";

interface Plan {
    id: number;
    name: string;
    description: string;
    base_price_per_month: number;
    base_price_per_year: number;
    extra_station_price: number;
    max_users_per_station: number;
    features: string[];
}

interface PlanCardProps {
    plan: Plan;
    billingPeriod: "monthly" | "yearly";
    isPopular?: boolean;
    onboarding?: boolean;
    currentPlan: Plan | null
    onSelectPlan: (plan: Plan) => void;
}

type ButtonVariant = "outline" | "primary" | "secondary" | "dark" | "current";

interface ButtonProps {
    label: string;
    variant?: ButtonVariant;
}

export default function PlanCard ({ plan, billingPeriod, isPopular = false, onboarding = false, currentPlan, onSelectPlan }: PlanCardProps) {

    const price = billingPeriod === "monthly" ? plan.base_price_per_month : plan.base_price_per_year;
    const isCurrent = plan.id === currentPlan?.id;
    

    const getButtonProps = (): ButtonProps => {
        if (onboarding) {
            return {
                label: "Συνέχεια",
            };
        }

        if (isCurrent) {
            return {
                label: "Τρέχον Πλάνο",
                variant: "current",
            };
        }

        // Not current → upgrade/downgrade rules
        if (plan.name === "Basic") {
            return {
                label: `Υποβάθμιση σε ${plan.name}`,
            };
        }

        if (plan.name === "Pro") {
            if (currentPlan?.name === "Basic") {
                return {
                    label: `Αναβάθμιση σε ${plan.name}`,
                };
            }
            if (currentPlan?.name === "Business") {
                return {
                    label: `Υποβάθμιση σε ${plan.name}`,
                };
            }
        }

        if (plan.name === "Business") {
            return {
                label: `Αναβάθμιση σε ${plan.name}`,
            };
        }

        // fallback
        return {
            label: plan.name,
        };
    };

    const { label, variant = "primary" } = getButtonProps();

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

                {(billingPeriod === "yearly" && plan.base_price_per_year !== 0) && (
                    <span className={styles.oldPrice}>
                        {plan.base_price_per_month}€
                    </span>
                )}
            </div>

            <div className={styles.featureList}>
                {plan.features.map((f, i) => (
                    <div key={i}>✓ {f}</div>
                ))}
            </div>

            <Button
                onClick={() => onSelectPlan(plan)}
                variant={variant}
            >
                {label}
            </Button>

            
        </div>
    );
};
