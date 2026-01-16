import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { StripeCheckoutFormHandle } from "./StripeCheckoutForm";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useAuth } from "@/contexts/AuthContext";
import Button from "./reusable/Button";
import BillingToggle from "./BillingToggle";
import styles from './InnerCheckoutForm.module.css'
import Input from "./reusable/Input";
import { PricePreviewResponse } from "@/types/billing.types";
import { axiosPrivate } from "@/api/axios";
import PaymentProcessingOverlay from "./PaymentProcessingOverlay";
import { Stripe, StripeElements } from "@stripe/stripe-js";

interface Props {
    billingPeriod: "monthly" | "yearly";
    onBillingPeriodChange: (p: "monthly" | "yearly") => void;
    totalBranches?: number;
    handleIncreaseTotalBranches?: () => void;
    handleDecreaseTotalBranches?: () => void;
    selectedPlugins?: string[];
    onRemovePlugin?: (pluginKey: string) => void;

    mode: "onboarding" | "admin";
    pricePreview: PricePreviewResponse;
    priceLoading: boolean;

    companyName: string;
    companyNameError: string | undefined;
    onCompanyNameChange: (v: string) => void;
    vatNumber: string;
    onVatNumberChange: (v: string) => void;

    validate: () => boolean;

    completeOnboarding?: (data: any) => Promise<void>;
    changePlan?: () => Promise<void>;

    onSuccess: () => void;
}

const InnerCheckoutForm = forwardRef<StripeCheckoutFormHandle, Props>(({ 
    billingPeriod, 
    onBillingPeriodChange, 
    totalBranches = 0,
    handleIncreaseTotalBranches,
    handleDecreaseTotalBranches,
    // selectedPlugins,
    onRemovePlugin,

    mode, 
    pricePreview,
    priceLoading,

    companyName,
    companyNameError,
    onCompanyNameChange,
    vatNumber,
    onVatNumberChange,
    validate,
    
    completeOnboarding,
    changePlan,

    // onSuccess 
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

    const [subscriptionId, setSubscriptionId] = useState(null);

    // useEffect(() => {
    //     const fetchPendingSubscription = async () => {
    //         try {
    //             // Κάνουμε ένα GET ή POST που απλά ελέγχει για εκκρεμότητες
    //             const response = await axiosPrivate.get("/api/billing/check-pending");
    //             if (response.data.hasPending) {
    //                 setClientSecretState(response.data.clientSecret);
    //                 setSubscriptionIdState(response.data.subscriptionId);
    //                 setOnboardingResponseData(response.data.data);
    //             }
    //         } catch (err) {
    //             console.log("No pending subscription found");
    //         }
    //     };

    //     fetchPendingSubscription();
    // }, []);

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
        if(!subscriptionId) return;
        
        const MAX_ATTEMPTS = 5; // π.χ. 5 προσπάθειες
        const INTERVAL = 3000;  // κάθε 3 δευτερόλεπτα

        // Αν είναι η πρώτη προσπάθεια, κρύψε το κουμπί επανελέγχου και δείξε loading
        if (attempts === 0) {
            setIsProcessing(true);
            setShowRetryStatus(false);
        }

        try {
            const response = await axiosPrivate.post("/api/billing/onboarding-verify", { 
                subscriptionId: subscriptionId
            });

            const {success, data} = response.data

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
            setShowRetryStatus(true); // Άσε τον να ξαναδοκιμάσει αν ήταν network error
            console.error("Polling error:", err);
            // Αν είναι network error, δεν τον βάζουμε μέσα
            showToast({ type: "error", message: "Σφάλμα επικοινωνίας κατά την επιβεβαίωση." });
        }
    };

    const handleSubmit = async () => {
        if (!stripe || !elements || !validate()) return;

        const { error: submitError } = await elements.submit();
        
        if (submitError) {
            showToast({ type: "error", message: submitError.message || "Τα στοιχεία δεν είναι έγκυρα" });
            return;
        }

        try {

            if (mode === "onboarding") {
                handleOnboardingCase(stripe, elements)
            } else {

                changePlan && changePlan();
            }

        } catch (error) {
            console.error("error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        }
        
    };

    const handleOnboardingCase = async (stripe: Stripe, elements: StripeElements) => {

        // Ενεργοποιούμε το processing UI (π.χ. spinner)
        setIsProcessing(true);
        
        // 1. Καλέστε το backend για να δημιουργήσει τη συνδρομή ΚΑΙ το clientSecret
        const response = await axiosPrivate.post("/api/billing/onboarding-complete");
        const { success, data, message } = response.data;

        if(!success) {
            showToast({message: message || "Κάτι πήγε στραβά", type: "error"})
            return;
        }

        const { clientSecret, subscriptionId } = data;
        setSubscriptionId(subscriptionId)

        // 2. Επιβεβαιώστε την πληρωμή (με 3D Secure handling)
        const { error } = await stripe.confirmPayment({
            elements,
            clientSecret,
            confirmParams: {
                // Υποχρεωτικό για το SDK, βάλε το τρέχον URL
                return_url: window.location.href, 
                // return_url: `${window.location.origin}/onboarding-success`, // Redirect URL
            },
            redirect: 'if_required' 
        });

        if (error) {
            // 1. Σταματάς το loading spinner
            setIsProcessing(false);
            
            // 2. Εμφανίζεις το μήνυμα λάθους (π.χ. "Η κάρτα απορρίφθηκε")
            showToast({ 
                message: error.message || "Η πληρωμή απέτυχε. Δοκιμάστε άλλη κάρτα.", 
                type: "error" 
            });
            return;
        }
        
        
        checkSubscriptionStatus(subscriptionId, 0);
    }

    useImperativeHandle(ref, () => ({ submit: handleSubmit }));

    return (
        <>
            {/* <PaymentProcessingOverlay isVisible={isProcessing} /> */}
            
            <div className={`${styles.wrapper} ${mode === "onboarding" ? styles.onboardingLayout : styles.adminLayout}`}>

                <div className={styles.contentGrid}>

                    <div className={styles.left}>
                        {/* INPUTS */}
                        <div className={styles.section}>
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
                                    {/* <div className={styles.planPrice}>
                                        {billingPeriod === "monthly"
                                            ? `${plan.prices.monthly}€ / μήνα`
                                            : `${plan.prices.yearly_per_month}€ / μήνα`
                                        }
                                    </div> */}
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
                                                    {plugin.total_price}{pricePreview.currency.symbol} / μήνα
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
                                    {
                                        (priceLoading) ?
                                            <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                                        :
                                            <span>
                                                {summary.subtotal}{currency.symbol}
                                            </span>
                                    }
                                </div>

                                <div className={styles.detailRow}>
                                    <span>ΦΠΑ {summary.vat_percent}%</span>
                                    {
                                        (priceLoading) ?
                                            <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                                        :
                                            <span>{summary.vat_amount}{currency.symbol}</span>
                                    }
                                </div>

                                <hr className={styles.separator} />

                                {/* FINAL TOTAL */}
                                <div className={styles.totalRow}>
                                    <span>Σύνολο</span>
                                    <div className={styles.totalRowRight}>
                                        {
                                            (priceLoading) ? 
                                                <div className={`${styles.skeletonText} ${styles.skeletonTextMedium}`} />
                                            :
                                                <>
                                                <span>{summary.total}{currency.symbol}</span>
                                                {/* ORIGINAL ANNUAL PRICE (STRIKETHROUGH) */}
                                                {billingPeriod === "yearly" && (
                                                    <div className={styles.originalPrice}>
                                                        {summary.original_yearly_total}{currency.symbol}
                                                    </div>
                                                )}
                                                </>
                                        }
                                    </div>
                                </div>

                            </div>
                        </div>

                        {mode === "onboarding" && (
                            <Button 
                                onClick={handleSubmit} 
                                disabled={priceLoading || isProcessing}
                                widthFull
                                loading={isProcessing}
                            >
                                {isProcessing ? "Επεξεργασία..." : "Πληρωμή" }
                            </Button>
                        )}

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