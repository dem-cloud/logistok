import { useEffect, useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import Input from "./reusable/Input";
import styles from "./StripeCheckoutForm.module.css";
import { PaymentIntent } from "@stripe/stripe-js";

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

interface PreviewDetails {
    vatPercentage: number,
    vatAmount: number;
    subTotal: number;
    total: number;
    originalAnnualPrice: number;
    discount: number;
}

interface Props {
    selectedPlan: Plan | null;
    billingPeriod: "monthly" | "yearly";
    setBillingPeriod: React.Dispatch<React.SetStateAction<"monthly" | "yearly">>;
    previewDetails: PreviewDetails | null;

    companyName: string;
    setCompanyName: React.Dispatch<React.SetStateAction<string>>;
    companyNameError: string;
    setCompanyNameError: React.Dispatch<React.SetStateAction<string>>;
    vatNumber: string;
    setVatNumber: React.Dispatch<React.SetStateAction<string>>;

    loading: boolean;
    onReady: (fn: () => Promise<PaymentIntent | undefined>) => void; 
}

export default function StripeCheckoutForm({
    selectedPlan,
    companyName, setCompanyName, companyNameError, setCompanyNameError,
    vatNumber, setVatNumber,
    billingPeriod, setBillingPeriod, previewDetails,
    loading,
    onReady
}: Props) {

    const stripe = useStripe();
    const elements = useElements();
    const [stripeReady, setStripeReady] = useState(false);

    const {
        vatPercentage,
        vatAmount,
        subTotal,
        total,
        originalAnnualPrice,
        discount,
    } = previewDetails || {};

    const {
        base_price_per_month,
        base_price_per_year
    } = selectedPlan || {};

    // Reset stripeReady όταν αλλάζει το loading
    useEffect(() => {
        if (loading) {
            setStripeReady(false);
        }
    }, [loading]);

    useEffect(() => {
        if (!stripe || !elements) return;

        const confirmFn = async () => {
            try {
                // 1. Validate form πριν το submit
                const { error: submitError } = await elements.submit();
                if (submitError) {
                    console.error("Form validation error:", submitError);
                    return;
                }

                // 2. Confirm payment χωρίς redirect
                const { error, paymentIntent } = await stripe.confirmPayment({
                    elements,
                    redirect: 'if_required', // 👈 Δεν κάνει redirect αν δεν χρειάζεται
                    // confirmParams: {
                    //     return_url: `${window.location.origin}/payment-success`, // fallback
                    // },
                });

                if (error) {
                    console.error("Payment confirmation error:", error);
                    return;
                }

                // 3. Έλεγξε αν η πληρωμή ολοκληρώθηκε
                if (!paymentIntent || paymentIntent.status !== "succeeded") {
                    console.error("Η πληρωμή δεν ολοκληρώθηκε");
                    return;
                }

                console.log("✅ Payment succeeded:", paymentIntent.id);
                return paymentIntent; // 👈 Επιστρέφει το paymentIntent

            } catch (error) {
                console.error("Payment confirmation error:", error);
            }
        };

        onReady(confirmFn);
    }, [stripe, elements]);

    const showPaymentSkeleton = loading || !stripeReady;

    return (
        <div className={styles.wrapper}>

            {/* INPUTS */}
            <div className={styles.row}>
                <Input
                    label="Όνομα εταιρείας"
                    name="companyName"
                    placeholder="Όνομα εταιρείας"
                    value={companyName}
                    onChange={(e) => {setCompanyName(e.target.value); setCompanyNameError("");}}
                    error={companyNameError}
                />
                <Input
                    label="ΑΦΜ (προαιρετικό)"
                    name="vat"
                    placeholder="ΑΦΜ"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                />
            </div>

            <div className={styles.gapWrapper}>
                {/* BILLING SELECTOR */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Επιλογές Χρέωσης</div>
                    <div className={styles.billingOptions}>
                        <div
                            className={`${styles.option} ${billingPeriod === "monthly" ? styles.active : ""}`}
                            onClick={() => setBillingPeriod("monthly")}
                        >
                            <div className={styles.radioOuter}>
                                {billingPeriod === "monthly" && <div className={styles.radioInner} />}
                            </div>

                            <div className={styles.optionInfo}>
                                <strong>Μηνιαία πληρωμή</strong>
                                <span>{base_price_per_month}€ / μήνα</span>
                            </div>
                        </div>

                        <div
                            className={`${styles.option} ${billingPeriod === "yearly" ? styles.active : ""}`}
                            onClick={() => setBillingPeriod("yearly")}
                        >
                            <div className={styles.radioOuter}>
                                {billingPeriod === "yearly" && <div className={styles.radioInner} />}
                            </div>

                            <div className={styles.optionInfo}>
                                <strong>Ετήσια πληρωμή</strong>
                                <span>
                                    {base_price_per_year}€ / μήνα
                                    <span className={styles.saveTag}>
                                        Εξοικονομήστε {discount}%
                                    </span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* STRIPE UI */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Τρόπος Πληρωμής</div>
                    {/* {showPaymentSkeleton && (
                        <div className={styles.paymentSkeleton}>
                            <div className={styles.skeletonHeader}>
                                <div className={styles.skeletonIcon} />
                                <div className={styles.skeletonTitle} />
                            </div>
                            <div className={styles.skeletonCardNumber} />
                            <div className={styles.skeletonRow}>
                                <div className={styles.skeletonInput} />
                                <div className={styles.skeletonInput} />
                            </div>
                            <div className={styles.skeletonDropdown} />
                        </div>
                    )} */}
                    
                    {/* <div 
                        className={styles.paymentElementWrapper}
                        style={{ display: showPaymentSkeleton ? 'none' : 'block' }}
                    > */}
                        <PaymentElement 
                            onReady={() => setStripeReady(true)}
                        />
                    {/* </div> */}
                    
                </div>

                {/* PRICE SUMMARY */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Σύνοψη</div>
                    { loading ?
                        <div className={styles.summarySkeleton}>
                            <div className={styles.skeletonDetailRow}>
                                <div className={`${styles.skeletonText} ${styles.skeletonTextShort}`} />
                                <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                            </div>
                            <div className={styles.skeletonDetailRow}>
                                <div className={`${styles.skeletonText} ${styles.skeletonTextShort}`} />
                                <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                            </div>
                            <div className={styles.skeletonSeparator} />
                            <div className={styles.skeletonTotalRow}>
                                <div className={styles.skeletonTextLarge} />
                                <div className={styles.skeletonTextLarge} />
                            </div>
                        </div>
                    :
                        <div className={styles.summaryCard}>

                            {/* DETAILS */}
                            <div className={styles.detailRow}>
                                <span>
                                    {billingPeriod === "monthly" ? (
                                            <>1x {base_price_per_month}€ / μήνα</>
                                        ) : (
                                            <>12x {base_price_per_year}€ / μήνα</>
                                        )}
                                </span>
                                <span>
                                    {`${subTotal}€`}
                                </span>
                            </div>

                            <div className={styles.detailRow}>
                                <span>ΦΠΑ {vatPercentage}%</span>
                                <span>{vatAmount}€</span>
                            </div>

                            <hr className={styles.separator} />

                            {/* FINAL TOTAL */}
                            <div className={styles.totalRow}>
                                <span>Σύνολο</span>
                                <div className={styles.totalRowRight}>
                                    <span>{total}€</span>
                                    {/* ORIGINAL ANNUAL PRICE (STRIKETHROUGH) */}
                                    {billingPeriod === "yearly" && (
                                        <div className={styles.originalPrice}>
                                            {originalAnnualPrice}€
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    }
                </div>
            </div>

        </div>
    );
}
