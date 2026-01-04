import { forwardRef, useImperativeHandle } from "react";
import { StripeCheckoutFormHandle } from "./StripeCheckoutForm";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { axiosPrivate } from "@/api/axios";
import { useAuth } from "@/context/AuthContext";
import Button from "./reusable/Button";
import BillingToggle from "./BillingToggle";
import styles from './InnerCheckoutForm.module.css'
import Input from "./reusable/Input";
import Spinner from "./Spinner";
import { PricePreviewResponse } from "@/types/billing.types";

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
    billingPeriod, 
    onBillingPeriodChange, 
    totalBranches = 0,
    handleIncreaseTotalBranches,
    handleDecreaseTotalBranches,
    // selectedPlugins,
    onRemovePlugin,

    mode, 
    pricePreview, 
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
        currency,
        plan,
        branches,
        plugins,
        summary
    } = pricePreview;


    const handleSubmit = async () => {
        if (!stripe || !elements || !validate()) return;

        const { error, setupIntent } = await stripe.confirmSetup({
            elements,
            redirect: 'if_required',
            // confirmParams: {
            //     return_url: window.location.origin
            // }
        });

        if (error) {
            showToast({ type: "error", message: "Η αποθήκευση μεθόδου πληρωμής απέτυχε" });
            return;
        }

        let response;
        if (mode === "onboarding") {
            response = await axiosPrivate.post("/api/billing/complete-onboarding", { setupIntentId: setupIntent.id });
        } else {
            response = await axiosPrivate.post("/api/billing/change-plan", {
                planId: plan.id,
                billingPeriod
            });
        }

        const { success } = response.data;

        if (!success) {
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
            return;
        }

        onSuccess();
    };

    useImperativeHandle(ref, () => ({ submit: handleSubmit }));

    return (
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
                        
                        <div className={`${styles.stripeWrapper} ${loading ? styles.disabled : ""}`}>
                            {loading && (
                                <div className={styles.stripeOverlay}>
                                    <Spinner />
                                    <span>Ενημέρωση χρέωσης…</span>
                                </div>
                            )}

                            <PaymentElement />

                        </div>

                    </div>
                </div>

                <div className={styles.right}>

                    {/* SELECTED PLAN */}
                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>Επιλεγμένο Πλάνο</div>
                        <div className={styles.planCard}>
                            <div className={styles.planInfo}>
                                <div className={styles.planName}>{plan.name}</div>
                                <div className={styles.planPrice}>
                                    {billingPeriod === "monthly"
                                        ? `${plan.prices.monthly}€ / μήνα`
                                        : `${plan.prices.yearly_per_month}€ / μήνα`
                                    }
                                </div>
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
                            disabled={loading}
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
                                            <>1x {plan.prices.monthly}{currency.symbol} / μήνα</>
                                        ) : (
                                            <>12x {plan.prices.yearly_per_month}{currency.symbol} / μήνα</>
                                        )}
                                </span>
                                {
                                    loading ?
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
                                    loading ?
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
                                        loading ? 
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
                        }
                    </div>

                    {mode === "onboarding" && (
                        <Button 
                            onClick={handleSubmit} 
                            disabled={loading}
                            widthFull
                        >
                            Πληρωμή
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
});

export default InnerCheckoutForm;