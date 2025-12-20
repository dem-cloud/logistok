import styles from './BillingToggle.module.css'

interface BillingToggleProps {
    value: "monthly" | "yearly";
    onChange: (period: "monthly" | "yearly") => void;

    monthlyPrice: number;
    yearlyPrice: number;
    discount?: number;

    disabled?: boolean;
}

export default function BillingToggle({
    value,
    onChange,
    monthlyPrice,
    yearlyPrice,
    discount,
    disabled = false
}: BillingToggleProps) {

    return (
        <div className={styles.billingOptions}>
            {/* MONTHLY */}
            <div
                className={`${styles.option} ${value === "monthly" ? styles.active : ""} ${disabled ? styles.disabled : ""}`}
                onClick={() => !disabled && onChange("monthly")}
            >
                <div className={styles.radioOuter}>
                    {value === "monthly" && <div className={styles.radioInner} />}
                </div>

                <div className={styles.optionInfo}>
                    <strong>Μηνιαία πληρωμή</strong>
                    <span>{monthlyPrice}€ / μήνα</span>
                </div>
            </div>

            {/* YEARLY */}
            <div
                className={`${styles.option} ${value === "yearly" ? styles.active : ""} ${disabled ? styles.disabled : ""}`}
                onClick={() => !disabled && onChange("yearly")}
            >
                <div className={styles.radioOuter}>
                    {value === "yearly" && <div className={styles.radioInner} />}
                </div>

                <div className={styles.optionInfo}>
                    <strong>Ετήσια πληρωμή</strong>
                    <span>
                        {yearlyPrice}€ / μήνα
                        {discount && (
                        <span className={styles.saveTag}>
                            Εξοικονομήστε {discount}%
                        </span>
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
}
