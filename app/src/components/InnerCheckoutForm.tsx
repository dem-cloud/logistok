import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { StripeCheckoutFormHandle } from "./StripeCheckoutForm";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useAuth } from "@/contexts/AuthContext";
import Button from "./reusable/Button";
import BillingToggle from "./BillingToggle";
import styles from './InnerCheckoutForm.module.css'
import { PricePreviewResponse } from "@/types/billing.types";
import { axiosPrivate } from "@/api/axios";
import BillingInfoForm, { BillingInfoFormRef } from "./BillingInfoForm";

interface Props {
    billingPeriod: "monthly" | "yearly";
    onBillingPeriodChange: (p: "monthly" | "yearly") => void;
    totalBranches?: number;
    handleIncreaseTotalBranches?: () => void;
    handleDecreaseTotalBranches?: () => void;
    selectedPlugins?: string[];
    onRemovePlugin?: (pluginKey: string) => void;

    pricePreview: PricePreviewResponse;
    priceLoading: boolean;

    billingFormRef: React.RefObject<BillingInfoFormRef | null>;
    onCountryChange?: (country: string) => void;
    onTaxIdChange: (vatId: string) => void;
    onTaxInfoIsValidChange: (taxInfoIsValid: boolean) => void;

    completeOnboarding?: (data: any) => Promise<void>;

    onSuccess: () => void;
}

const InnerCheckoutForm = forwardRef<StripeCheckoutFormHandle, Props>(({ 
    billingPeriod, 
    onBillingPeriodChange, 
    totalBranches = 0,
    handleIncreaseTotalBranches,
    handleDecreaseTotalBranches,
    onRemovePlugin,

    pricePreview,
    priceLoading,

    billingFormRef,
    onCountryChange,
    onTaxIdChange,
    onTaxInfoIsValidChange,
    
    completeOnboarding
}, ref) => {

    const { showToast } = useAuth();

    const stripe = useStripe();
    const elements = useElements();

    const {
        currency,
        plan,
        branches,
        plugins,
        summary
    } = pricePreview;

    const [isProcessing, setIsProcessing] = useState(false);
    const [showRetryStatus, setShowRetryStatus] = useState(false);
    const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

    useEffect(() => {
        if (summary?.total !== undefined) {
            updatePrice(summary.total * 100);
        }
    }, [summary?.total]);

    const updatePrice = (newTotal: number) => {
        if (!elements) return;
        elements.update({ amount: newTotal });
    };

    const checkSubscriptionStatus = async (subscriptionId: string | null, attempts: number) => {
        if (!subscriptionId) return;
        
        const MAX_ATTEMPTS = 5; // π.χ. 5 προσπάθειες
        const INTERVAL = 3000; // κάθε 3 δευτερόλεπτα

        if (attempts === 0) {
            setIsProcessing(true);
            setShowRetryStatus(false);
        }

        try {
            const response = await axiosPrivate.post("/api/billing/onboarding-verify", { 
                subscriptionId: subscriptionId
            });

            const { success, data } = response.data;

            if (success) {
                // ΕΠΙΤΥΧΙΑ: Ο server επιβεβαίωσε το 'active'
                setIsProcessing(false);
                completeOnboarding && completeOnboarding(data);
                return;
            } 
            
            // Διαχείριση μη-επιτυχίας
            if (attempts < MAX_ATTEMPTS) {
                // ΑΚΟΜΑ ΠΕΡΙΜΕΝΟΥΜΕ
                setTimeout(() => checkSubscriptionStatus(subscriptionId, attempts + 1), INTERVAL);
            } else {
                // TIMEOUT: Σταματάμε εδώ. ΜΗΝ καλείς το completeOnboarding.
                setIsProcessing(false);
                setShowRetryStatus(true);
                
                // Ελέγχουμε αν το API μας γύρισε κάποιο συγκεκριμένο status (π.χ. incomplete)
                const status = data?.status || 'unknown';

                if (status === 'incomplete') {
                    // Η Stripe λέει ακόμα incomplete. Μπορεί να είναι αργή τράπεζα ή έλλειψη υπολοίπου.
                    showToast({ 
                        type: "error", 
                        message: "Η πληρωμή επεξεργάζεται από την τράπεζά σας. Παρακαλώ δοκιμάστε 'Έλεγχο Κατάστασης' σε λίγα δευτερόλεπτα." 
                    });
                } else {
                    // Άλλο status (past_due, unpaid) ή τελείως άγνωστο
                    // Περίπτωση που απλά αργεί πολύ το Stripe Webhook
                    showToast({ 
                        type: "warning", 
                        message: "Η πληρωμή δεν ολοκληρώθηκε (Status: " + status + "). Παρακαλώ ελέγξτε την κάρτα σας." 
                    });
                }
            }
        } catch (err) {
            setIsProcessing(false);
            setShowRetryStatus(true);
            console.error("Polling error:", err);
            showToast({ type: "error", message: "Σφάλμα επικοινωνίας κατά την επιβεβαίωση." });
        }
    };

    const handleSubmit = async () => {
        if (!stripe || !elements) return;

        // Validate billing info
        if (billingFormRef.current) {
            const { error } = billingFormRef.current.getData();
            if (error) {
                showToast({ type: "error", message: error });
                return;
            }
        }

        const { error: submitError } = await elements.submit();
        
        if (submitError) {
            showToast({ type: "error", message: submitError.message || "Τα στοιχεία δεν είναι έγκυρα" });
            return;
        }

        try {
            setIsProcessing(true);

            // Get billing data
            let billingData = null;
            if (billingFormRef.current) {
                const { data, error } = billingFormRef.current.getData();
                if (error) {
                    showToast({ type: "error", message: error });
                    setIsProcessing(false);
                    return;
                }
                billingData = data;
            }
            
            // 1. Καλέστε το backend για να δημιουργήσει τη συνδρομή ΚΑΙ το clientSecret
            const response = await axiosPrivate.post("/api/billing/onboarding-complete", {
                billingInfo: billingData
            });
            const { success, data, message } = response.data;

            if (!success) {
                showToast({ message: message || "Κάτι πήγε στραβά", type: "error" });
                setIsProcessing(false);
                return;
            }

            const { clientSecret, subscriptionId } = data;
            setSubscriptionId(subscriptionId);

            // 2. Επιβεβαιώστε την πληρωμή (με 3D Secure handling)
            const { error } = await stripe.confirmPayment({
                elements,
                clientSecret,
                confirmParams: {
                    return_url: window.location.href, 
                    // return_url: `${window.location.origin}/onboarding-success`, // Redirect URL
                },
                redirect: 'if_required' 
            });

            if (error) {
                setIsProcessing(false);
                showToast({ 
                    message: error.message || "Η πληρωμή απέτυχε. Δοκιμάστε άλλη κάρτα.", 
                    type: "error" 
                });
                return;
            }
            
            checkSubscriptionStatus(subscriptionId, 0);
        } catch (error) {
            console.error("error:", error);
            setIsProcessing(false);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        }
    };

    useImperativeHandle(ref, () => ({ submit: handleSubmit }));

    return (
        <>
            <div className={`${styles.wrapper}`}>

                <div className={styles.contentGrid}>

                    <div className={styles.left}>
                        {/* BILLING INFO */}
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Στοιχεία Χρέωσης</div>
                            <div className={styles.billingCard}>
                                <BillingInfoForm 
                                    ref={billingFormRef} 
                                    onCountryChange={onCountryChange}
                                    onTaxIdChange={onTaxIdChange}
                                    onTaxInfoIsValidChange={onTaxInfoIsValidChange}
                                />
                            </div>
                        </div>

                        {/* STRIPE UI */}
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Τρόπος Πληρωμής</div>
                            <PaymentElement />
                        </div>
                    </div>

                    <div className={styles.right}>

                        {/* SELECTED PLAN */}
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Επιλεγμένο Πλάνο</div>
                            <div className={styles.planCard}>
                                <div className={styles.planInfo}>
                                    <div className={styles.planName}>{plan.name}</div>
                                </div>
                            </div>
                        </div>

                        {/* BILLING SELECTOR */}
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Επιλογές Χρέωσης</div>
                            <BillingToggle
                                value={billingPeriod}
                                onChange={onBillingPeriodChange}
                                monthlyPrice={plan.prices.monthly}
                                yearlyPrice={plan.prices.yearly_per_month}
                                discount={plan.prices.yearly_discount_percent}
                            />
                        </div>

                        {/* SELECTED PLUGINS */}
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Επιλεγμένα Πρόσθετα</div>

                            {plugins.length === 0 ? (
                                <div className={styles.empty}>Δεν υπάρχουν πρόσθετα</div>
                            ) : (
                                <div className={styles.pluginsList}>
                                    {plugins.map(plugin => (
                                        <div key={plugin.key} className={styles.pluginRow}>
                                            <div className={styles.pluginInfo}>
                                                <span className={styles.pluginName}>{plugin.name}</span>
                                                <span className={styles.pluginPrice}>
                                                    {plugin.total_price}{currency.symbol} / μήνα
                                                </span>
                                            </div>

                                            {onRemovePlugin && (
                                                <button
                                                    className={styles.removeBtn}
                                                    onClick={() => onRemovePlugin(plugin.key)}
                                                    aria-label={`Αφαίρεση ${plugin.name}`}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* EXTRA STORES */}
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Καταστήματα</div>
                            <div className={styles.storesCard}>
                                <span className={styles.storeIncluded}>
                                    Περιλαμβάνονται στο πλάνο: x1 κύριο κατάστημα
                                    {branches.included > 0 && (
                                        branches.included === 1 
                                            ? `, x${branches.included} υποκατάστημα`
                                            : `, x${branches.included} υποκαταστήματα`
                                    )}
                                </span>

                                <span className={styles.storeLabel}>Υποκαταστήματα</span>
                                <span className={styles.storeIncluded}>({branches.unit_price_monthly}{currency.symbol}/μήνα/υποκατάστημα)</span>

                                <div className={styles.storeCounter}>
                                    <button 
                                        className={styles.counterBtn}
                                        onClick={handleDecreaseTotalBranches}
                                        disabled={totalBranches <= 0}
                                        aria-label="Μείωση υποκαταστημάτων"
                                    >
                                        −
                                    </button>
                                    <div className={styles.counterValue}>{totalBranches}</div>
                                    <button 
                                        className={styles.counterBtn}
                                        onClick={handleIncreaseTotalBranches}
                                        disabled={totalBranches >= 9}
                                        aria-label="Αύξηση υποκαταστημάτων"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* PRICE SUMMARY */}
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Σύνοψη</div>
                            
                            <div className={styles.summaryCard}>

                                {/* DETAILS */}
                                <div className={styles.detailRow}>
                                    <span>Υποσύνολο</span>
                                    {priceLoading ? (
                                        <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                                    ) : (
                                        <span>{summary.subtotal}{currency.symbol}</span>
                                    )}
                                </div>

                                <div className={styles.detailRow}>
                                    <span>ΦΠΑ {summary.vat_percent}%</span>
                                    {priceLoading ? (
                                        <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                                    ) : (
                                        <span>{summary.vat_amount}{currency.symbol}</span>
                                    )}
                                </div>

                                <hr className={styles.separator} />

                                {/* FINAL TOTAL */}
                                <div className={styles.totalRow}>
                                    <span>Σύνολο</span>
                                    <div className={styles.totalRowRight}>
                                        {priceLoading ? (
                                            <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                                        ) : (
                                            <>
                                                <span>{summary.total}{currency.symbol}</span>
                                                {billingPeriod === "yearly" && (
                                                    <div className={styles.originalPrice}>
                                                        {summary.original_yearly_total}{currency.symbol}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>

                        <Button 
                            onClick={handleSubmit} 
                            disabled={priceLoading || isProcessing}
                            widthFull
                            loading={isProcessing}
                        >
                            {isProcessing ? "Επεξεργασία..." : "Πληρωμή"}
                        </Button>

                        {showRetryStatus && !isProcessing && (
                            <div>
                                <p>
                                    Η πληρωμή φαίνεται να καθυστερεί από την τράπεζά σας.
                                </p>
                                <Button 
                                    onClick={() => checkSubscriptionStatus(subscriptionId, 0)}
                                    widthFull
                                    variant="outline"
                                    title="Πάτησε εδώ για να δεις αν εγκρίθηκε τώρα"
                                >
                                    Επανέλεγχος
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
});

export default InnerCheckoutForm;