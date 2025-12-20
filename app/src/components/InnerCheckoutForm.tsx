import { forwardRef, useImperativeHandle } from "react";
import { PreviewDetails, StripeCheckoutFormHandle } from "./StripeCheckoutForm";
import { Plan } from "@/onboarding/types";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/context/AuthContext";
import Button from "./reusable/Button";
import BillingToggle from "./BillingToggle";
import styles from './InnerCheckoutForm.module.css'
import Input from "./reusable/Input";

interface Props {
    plan: Plan;
    billingPeriod: "monthly" | "yearly";
    onBillingPeriodChange: (p: "monthly" | "yearly") => void;
    mode: "onboarding" | "admin";
    previewDetails: PreviewDetails | null;
    loading: boolean;

    companyName: string;
    companyNameError: string | undefined;
    onCompanyNameChange: (v: string) => void;
    vatNumber: string;
    onVatNumberChange: (v: string) => void;

    validate: () => boolean;
    onSuccess: () => void;
}

const InnerCheckoutForm = forwardRef<StripeCheckoutFormHandle, Props>(({ 
    plan, 
    billingPeriod, 
    onBillingPeriodChange, 
    mode, 
    previewDetails, 
    loading, 
    companyName,
    companyNameError,
    onCompanyNameChange,
    vatNumber,
    onVatNumberChange,
    validate,
    onSuccess 
}, ref) => {

    const { showToast } = useAuth();

    const stripe = useStripe();
    const elements = useElements();

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
    } = plan || {};

    const handleSubmit = async () => {
        if (!stripe || !elements || !validate()) return;

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            redirect: "if_required"
        });

        if (error || paymentIntent?.status !== "succeeded") {
            showToast({ type: "error", message: "Η πληρωμή απέτυχε" });
            return;
        }

        if (mode === "onboarding") {
            await axiosPrivate.post("/api/billing/complete-onboarding", {
                planId: plan.id,
                billingPeriod
            });
        } else {
            await axiosPrivate.post("/api/billing/change-plan", {
                planId: plan.id,
                billingPeriod
            });
        }

        onSuccess();
    };

    useImperativeHandle(ref, () => ({ submit: handleSubmit }));

    return (
        <div className={styles.wrapper}>

            {/* INPUTS */}
            <div className={styles.row}>
                <Input
                    label="Όνομα εταιρείας"
                    name="companyName"
                    placeholder="Όνομα εταιρείας"
                    value={companyName}
                    onChange={(e) => onCompanyNameChange(e.target.value)}
                    error={companyNameError}
                />
                <Input
                    label="ΑΦΜ (προαιρετικό)"
                    name="vat"
                    placeholder="ΑΦΜ"
                    value={vatNumber}
                    onChange={(e) => onVatNumberChange(e.target.value)}
                />
            </div>

            <div className={styles.gapWrapper}>
                {/* Billing Selector */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Επιλογές Χρέωσης</div>
                    <BillingToggle
                        value={billingPeriod}
                        onChange={onBillingPeriodChange}
                        monthlyPrice={base_price_per_month}
                        yearlyPrice={base_price_per_year}
                        discount={discount}
                        disabled={loading}
                    />
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
                    <PaymentElement />

                 </div>

                {/* PRICE SUMMARY */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Σύνοψη</div>
                    { 
                    // loading ?
                    //     <div className={styles.summarySkeleton}>
                    //         <div className={styles.skeletonDetailRow}>
                    //             <div className={`${styles.skeletonText} ${styles.skeletonTextShort}`} />
                    //             <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                    //         </div>
                    //         <div className={styles.skeletonDetailRow}>
                    //             <div className={`${styles.skeletonText} ${styles.skeletonTextShort}`} />
                    //             <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                    //         </div>
                    //         <div className={styles.skeletonSeparator} />
                    //         <div className={styles.skeletonTotalRow}>
                    //             <div className={styles.skeletonTextLarge} />
                    //             <div className={styles.skeletonTextLarge} />
                    //         </div>
                    //     </div>
                    // :
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

            {mode === "onboarding" && (
                <Button onClick={handleSubmit} disabled={loading}>
                    Πληρωμή
                </Button>
            )}
        </div>
    );
});

export default InnerCheckoutForm;