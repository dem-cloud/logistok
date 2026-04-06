import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import {
    Crown,
    Box,
    Users,
    CalendarClock,
    Headphones,
} from 'lucide-react';
import styles from './SubscriptionPlan.module.css';
import { BillingPeriod } from '@/types/billing.types';
import SidePopup from '@/components/reusable/SidePopup';
import { useAuth } from '@/contexts/AuthContext';
import usePlans, { Plan } from '@/hooks/usePlans';
import useSubscription from '@/hooks/useSubscription';
import LoadingSpinner from '@/components/LoadingSpinner';
import { axiosPrivate } from '@/api/axios';
import PlanList from '@/components/PlanList';
import { PaymentMethodFormRef } from '@/components/PaymentMethodForm';
import { BillingInfoFormRef } from '@/components/BillingInfoForm';
import PlanChangePreview, { PlanChangePreviewData } from '@/components/billing/PlanChangePreview';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// ============================================
// TYPES
// ============================================
interface CurrentPlanSummaryProps {
    planName: string;
    billingPeriod: BillingPeriod;
    renewalDate: string;
    products: number;
    maxProducts: number | null;
    users: number;
    maxUsers: number | null;
    cancelAtPeriodEnd?: boolean;
}

// ============================================
// CURRENT PLAN SUMMARY
// ============================================
const CurrentPlanSummary: React.FC<CurrentPlanSummaryProps> = ({ 
    planName, 
    billingPeriod, 
    renewalDate, 
    products, 
    maxProducts, 
    users, 
    maxUsers,
    cancelAtPeriodEnd = false
}) => {
    const formatLimit = (current: number, max: number | null) => {
        if (max === null || max === 0) return `${current} / ∞`;
        return `${current} / ${max}`;
    };

    return (
        <div className={styles.currentPlanSummary}>
            <div className={styles.summaryHeader}>
                <div className={styles.summaryIcon}>
                    <Crown size={20} strokeWidth={2} />
                </div>
                <div className={styles.summaryInfo}>
                    <span className={styles.summaryLabel}>Τρέχουσα συνδρομή</span>
                    <span className={styles.summaryPlan}>
                        {planName}
                        <span className={styles.billingBadge}>
                            {billingPeriod === 'yearly' ? 'Ετήσια' : 'Μηνιαία'}
                        </span>
                    </span>
                </div>
            </div>

            <div className={styles.summaryStats}>
                <div className={styles.statItem}>
                    <Users size={16} strokeWidth={2} />
                    <span className={styles.statLabel}>Χρήστες</span>
                    <span className={styles.statValue}>{formatLimit(users, maxUsers)}</span>
                </div>
                <div className={styles.statItem}>
                    <Box size={16} strokeWidth={2} />
                    <span className={styles.statLabel}>Προϊόντα</span>
                    <span className={styles.statValue}>{formatLimit(products, maxProducts)}</span>
                </div>
                <div className={styles.statItem}>
                    <CalendarClock size={16} strokeWidth={2} />
                    <span className={styles.statLabel}>
                        {cancelAtPeriodEnd ? 'Λήξη' : 'Ανανέωση'}
                    </span>
                    <span className={styles.statValue}>{renewalDate}</span>
                </div>
            </div>
        </div>
    );
};

// ============================================
// CONTACT FOOTER
// ============================================
const ContactFooter: React.FC = () => {
    return (
        <div className={styles.footer}>
            <div className={styles.footerContent}>
                <Headphones size={20} strokeWidth={2} />
                <div>
                    <p className={styles.footerTitle}>Χρειάζεστε βοήθεια με την επιλογή πλάνου;</p>
                    <p className={styles.footerText}>
                        Επικοινωνήστε μαζί μας για να σας βοηθήσουμε να βρείτε το κατάλληλο πλάνο για την επιχείρησή σας.
                    </p>
                </div>
                <button className={styles.contactButton}>
                    Επικοινωνία
                </button>
            </div>
        </div>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function SubscriptionPlan() {
    const queryClient = useQueryClient();
    const { showToast } = useAuth();

    const { data: plans = [], isLoading: plansLoading } = usePlans();
    const { data: subscription, isLoading: subscriptionLoading } = useSubscription();

    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("yearly");
    const [popupOpen, setPopupOpen] = useState(false);
    const [preview, setPreview] = useState<PlanChangePreviewData | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [pendingVerify, setPendingVerify] = useState<{ subscriptionId: string; invoiceId: string } | null>(null);

    // Billing Info
    const billingFormRef = useRef<BillingInfoFormRef>(null);
    const [selectedBillingMethod, setSelectedBillingMethod] = useState<"existing" | "new">("existing");
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
    const [vatId, setVatId] = useState<string | null>(null);
    const [taxInfoIsValid, setTaxInfoIsValid] = useState(false);
    // Payment Method
    const paymentFormRef = useRef<PaymentMethodFormRef>(null);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"existing" | "new">("existing");

    // Στο useEffect για initialization
    useEffect(() => {
        if (subscription?.billing_period) {
            setBillingPeriod(subscription.billing_period);
        }

        if (subscription?.billingInfo) {
            setSelectedBillingMethod("existing");
        } else {
            setSelectedBillingMethod("new");
        }

        if (subscription?.card) {
            setSelectedPaymentMethod("existing");
        } else {
            setSelectedPaymentMethod("new");
        }
    }, [subscription?.billing_period, subscription?.billingInfo, subscription?.card]);

    // Fetch preview when popup opens or billing period changes
    const fetchPreview = useCallback(async () => {
        if (!popupOpen || !selectedPlan) return;

        try {
            setPreviewLoading(true);

            const response = await axiosPrivate.post("/api/billing/plan-change-preview", {
                newPlanId: selectedPlan.id,
                billingPeriod,
                billingInfo: selectedBillingMethod === "new" ? {
                    country: selectedCountry,
                    taxId: vatId
                } : null
            });

            const { success, data } = response.data;

            if (!success) {
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
                return;
            }

            setPreview(data);

        } catch (err) {
            console.error("Preview error:", err);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setPreviewLoading(false);
        }
    }, [popupOpen, selectedPlan, billingPeriod, selectedBillingMethod, selectedCountry, vatId]);

    // Initial fetch + refetch on dependency change
    useEffect(() => {
        if(vatId && !taxInfoIsValid) return;
        fetchPreview();
    }, [fetchPreview, taxInfoIsValid]);

    // Handler για tax ID validation & change
    const handleTaxIdChange = (vatId: string) => {
        setVatId(vatId)
    };

    // Handler για country change
    const handleCountryChange = (country: string) => {
        setSelectedCountry(country)
    };

    // Loading state - NOW AFTER ALL HOOKS
    if (plansLoading || subscriptionLoading || !subscription) {
        return <LoadingSpinner />;
    }

    const currentPlan = plans.find(p => p.id === subscription.plan_id);

    // Format renewal date
    const formatDate = (dateString: string | null) => {
        if (!dateString) return "—";
        const date = new Date(dateString);
        return date.toLocaleDateString('el-GR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const handleSelectPlan = (plan: Plan) => {

        // If this exact plan + period is scheduled, cancel it
        if (
            subscription.scheduled_plan_name && 
            plan.name === subscription.scheduled_plan_name &&
            billingPeriod === subscription.scheduled_billing_period
        ) {
            handleCancelDowngrade();
            return;
        }

        setSelectedPlan(plan);
        setPopupOpen(true);
    };

    const handleCancelDowngrade = async () => {
        try {
            const response = await axiosPrivate.post("/api/billing/cancel-downgrade");

            const { success } = response.data;

            if (success) {
                showToast({ 
                    message: "Η προγραμματισμένη αλλαγή ακυρώθηκε επιτυχώς", 
                    type: "success" 
                });
                queryClient.invalidateQueries({ queryKey: ["subscription"] });
            } else {
                showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            }
        } catch (error) {
            console.error("Cancel downgrade error:", error);
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        }
    };

    const handleBillingChange = (period: BillingPeriod) => {
        setBillingPeriod(period);
    };

    const handleClosePopup = () => {
        setPopupOpen(false);
        setSelectedPlan(null);
        setPreview(null);
        setIsProcessing(false);
        setPendingVerify(null);
    };

    const handleRetryVerify = async () => {
        if (!pendingVerify) return;
        setIsProcessing(true);
        try {
            const verifyResponse = await axiosPrivate.post("/api/billing/verify-upgrade", {
                subscriptionId: pendingVerify.subscriptionId,
                invoiceId: pendingVerify.invoiceId
            });
            if (verifyResponse.data.success) {
                showToast({ message: "Το πλάνο άλλαξε επιτυχώς", type: "success" });
                await queryClient.invalidateQueries({ queryKey: ["subscription"] });
                setPendingVerify(null);
                handleClosePopup();
            } else {
                showToast({ message: "Η πληρωμή επεξεργάζεται ακόμα. Δοκιμάστε ξανά σε λίγο.", type: "warning" });
            }
        } catch (verifyErr) {
            console.error("Verify retry error:", verifyErr);
            showToast({ message: "Η πληρωμή επεξεργάζεται ακόμα. Δοκιμάστε ξανά σε λίγο.", type: "warning" });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleChangePlan = async () => {
        if (!selectedPlan) return;

        try {
            setIsProcessing(true);

            // 1. Billing Info
            let billingInfo = null;

            if (selectedBillingMethod === "new" && billingFormRef.current) {
                const { data, error } = billingFormRef.current.getData();

                if (error) {
                    showToast({ message: error, type: "error" });
                    setIsProcessing(false);
                    return;
                }

                billingInfo = data;
            }

            // 2. Payment Method
            let finalPaymentMethodId = null;

            if (selectedPaymentMethod === "new" && paymentFormRef.current) {
                const { paymentMethodId: newPmId, error } = await paymentFormRef.current.submit();
                
                if (error) {
                    setIsProcessing(false);
                    return;
                }
                
                finalPaymentMethodId = newPmId;
            }

            // Call backend
            const response = await axiosPrivate.post("/api/billing/change-plan", {
                planId: selectedPlan.id,
                billingPeriod,
                paymentMethodId: finalPaymentMethodId,
                billingInfo
            });

            const { success, code, data, message, warning } = response.data;

            // ✅ SUCCESS (no payment needed, e.g., scheduled downgrade)
            if (success) {
                const successMsg = message || "Το πλάνο άλλαξε επιτυχώς";
                showToast({
                    message: warning ? `${successMsg} ${warning}` : successMsg,
                    type: "success",
                    duration: warning ? 6000 : 3000
                });
                await queryClient.invalidateQueries({ queryKey: ["subscription"] });
                handleClosePopup();
                return;
            }

            // ⚠️ REQUIRES PAYMENT / 3DS
            if ((code === "REQUIRES_PAYMENT" || code === "REQUIRES_ACTION") && data?.clientSecret) {
                if (warning) {
                    showToast({ message: warning, type: "info", duration: 5000 });
                }
                const stripe = await stripePromise;
                
                if (!stripe) {
                    showToast({ message: "Stripe δεν είναι διαθέσιμο", type: "error" });
                    setIsProcessing(false);
                    return;
                }

                // Build confirm options
                const confirmOptions: any = {
                    clientSecret: data.clientSecret,
                    redirect: 'if_required'
                };

                // If using existing card, pass the payment method ID
                if (selectedPaymentMethod === "existing" && data.paymentMethodId) {
                    confirmOptions.confirmParams = {
                        payment_method: data.paymentMethodId,
                        return_url: window.location.href,  // Required when passing payment_method
                    };
                }

                const { error } = await stripe.confirmPayment(confirmOptions);

                if (error) {
                    console.error('Payment error:', error);
                    
                    // 3DS failed or card declined - suggest retry or new card
                    if (error.code === 'payment_intent_authentication_failure' || 
                        error.decline_code) {
                        showToast({ 
                            message: "Η πληρωμή απέτυχε. Δοκιμάστε ξανά ή χρησιμοποιήστε άλλη κάρτα.", 
                            type: "error" 
                        });
                    } else {
                        showToast({ message: error.message || "Η πληρωμή απέτυχε", type: "error" });
                    }
                    
                    setIsProcessing(false);
                    return;
                }

                // Payment succeeded - verify
                try {
                    const verifyResponse = await axiosPrivate.post("/api/billing/verify-upgrade", {
                        subscriptionId: data.subscriptionId,
                        invoiceId: data.invoiceId
                    });

                    if (verifyResponse.data.success) {
                        showToast({ message: "Το πλάνο άλλαξε επιτυχώς", type: "success" });
                        await queryClient.invalidateQueries({ queryKey: ["subscription"] });
                        handleClosePopup();
                    } else {
                        setPendingVerify({ subscriptionId: data.subscriptionId, invoiceId: data.invoiceId });
                        showToast({ 
                            message: "Η πληρωμή επεξεργάζεται. Κάντε κλικ στο 'Ξανά έλεγχος' για να ελέγξετε την κατάσταση.", 
                            type: "warning" 
                        });
                    }
                } catch (verifyErr) {
                    console.error("Verify error:", verifyErr);
                    setPendingVerify({ subscriptionId: data.subscriptionId, invoiceId: data.invoiceId });
                    showToast({ 
                        message: "Η πληρωμή επεξεργάζεται. Κάντε κλικ στο 'Ξανά έλεγχος' για να ελέγξετε την κατάσταση.", 
                        type: "warning" 
                    });
                }
                
                setIsProcessing(false);
                return;
            }

            // ❌ PAYMENT FAILED
            if (code === "PAYMENT_FAILED") {
                showToast({ 
                    message: "Η κάρτα απορρίφθηκε. Ενημερώστε τα στοιχεία πληρωμής σας.", 
                    type: "error" 
                });
                setSelectedPaymentMethod("new");
                setIsProcessing(false);
                return;
            }

            // ❓ UNKNOWN ERROR
            showToast({ message: message || "Κάτι πήγε στραβά", type: "error" });
            setIsProcessing(false);

        } catch (error: any) {
            console.error("Error changing plan:", error);
            showToast({ message: error.response?.data?.message || "Κάτι πήγε στραβά", type: "error" });
            setIsProcessing(false);
        }
    };

    return (
        <div className={styles.wrapper}>
            {/* Current Plan Summary */}
            {currentPlan && (
                <CurrentPlanSummary
                    planName={currentPlan.name}
                    billingPeriod={subscription.billing_period}
                    renewalDate={formatDate(subscription.current_period_end)}
                    products={subscription.store_products_count}
                    maxProducts={currentPlan.max_products}
                    users={subscription.company_users_count}
                    maxUsers={currentPlan.max_users}
                    cancelAtPeriodEnd={subscription.cancel_at_period_end}
                />
            )}

            {subscription.cancel_at_period_end ? (
                <div className={styles.cancelNotice}>
                    <span className={styles.cancelIcon}>⚠️</span>
                    <span className={styles.cancelText}>
                        Η συνδρομή θα ακυρωθεί στις <strong>{formatDate(subscription.current_period_end)}</strong> και θα αλλάξει σε Basic πλάνο.
                    </span>
                </div>
            )
            :
                subscription.scheduled_plan_name && (
                    <div className={styles.scheduledNotice}>
                        <span className={styles.scheduledIcon}>📅</span>
                        <span className={styles.scheduledText}>
                            Προγραμματισμένη αλλαγή: Το <strong>{subscription.scheduled_plan_name}</strong> πλάνο θα ενεργοποιηθεί στις <strong>{formatDate(subscription.current_period_end)}</strong>.
                        </span>
                    </div>
                )
            }

            {/* Plan List */}
            <PlanList
                plans={plans}
                billingPeriod={billingPeriod}
                mode="admin"
                currentPlan={currentPlan}
                currentBillingPeriod={subscription.billing_period}
                scheduledPlanName={subscription.scheduled_plan_name}
                scheduledBillingPeriod={subscription.scheduled_billing_period}
                onSelectPlan={handleSelectPlan}
                onBillingPeriodChange={handleBillingChange}
            />

            {/* Contact Footer */}
            <ContactFooter />

            {/* Plan Change Preview Popup */}
            {selectedPlan && (
                <SidePopup
                    isOpen={popupOpen}
                    onClose={handleClosePopup}
                    title={`Επιβεβαίωση Αλλαγής Πλάνου`}
                    width="520px"
                    footerLeftButton={{
                        label: "Κλείσιμο",
                        variant: "outline",
                        onClick: handleClosePopup,
                        show: true
                    }}
                    footerRightButton={{
                        label: pendingVerify
                            ? (isProcessing ? "Επεξεργασία..." : "Ξανά έλεγχος")
                            : (isProcessing ? "Επεξεργασία..." : "Επιβεβαίωση Αλλαγής"),
                        variant: "primary",
                        onClick: pendingVerify ? handleRetryVerify : handleChangePlan,
                        show: true,
                        widthFull: true,
                        disabled: previewLoading || isProcessing,
                        loading: previewLoading || isProcessing
                    }}
                >
                    <PlanChangePreview
                        preview={preview}
                        previewLoading={previewLoading}

                        currentCard={subscription.card}
                        selectedPaymentMethod={selectedPaymentMethod}
                        onMethodChange={setSelectedPaymentMethod}
                        paymentFormRef={paymentFormRef}

                        currentBillingInfo={subscription?.billingInfo}
                        selectedBillingMethod={selectedBillingMethod}
                        onBillingMethodChange={setSelectedBillingMethod}
                        billingFormRef={billingFormRef}
                        onTaxIdChange={handleTaxIdChange}
                        onCountryChange={handleCountryChange}
                        onTaxInfoIsValidChange={setTaxInfoIsValid}
                        
                        onSetupError={(error) => showToast({ message: error, type: "error" })}
                    />
                </SidePopup>
            )}
        </div>
    );
}