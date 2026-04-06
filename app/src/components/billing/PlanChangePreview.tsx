import { BillingInfo, PaymentMethod } from "@/hooks/useBillingDetails";
import { BillingPeriod } from "@/types/billing.types";
import { PaymentMethodFormRef } from "../PaymentMethodForm";
import BillingInfoForm, { BillingInfoFormRef } from "../BillingInfoForm";
import { RefObject } from "react";
import PaymentForm from "../PaymentForm";
import { CreditCard } from "lucide-react";
import styles from './PlanChangePreview.module.css';

export interface PlanChangePreviewData {
    currency: {
        code: string;
        symbol: string;
    };
    summary: {
        tax_percent: number;
    },
    current: {
        plan: string;
        billing_period: BillingPeriod;
        breakdown: {
            plan: number;
            extra_stores: number;
            plugins: number;
        };
        subtotal: number;
        vat: number;
        total: number;
    };
    new: {
        plan: string;
        billing_period: BillingPeriod;
        breakdown: {
            plan: number;
            extra_stores: number;
            plugins: number;
        };
        subtotal: number;
        vat: number;
        total: number;
    };
    proration: {
        remaining_days: number;
        total_days: number;
        amount: number;
        vat: number;
        total: number;
        description: string;
    };
    warning?: {
        type: string;
        message: string;
    };
}

interface PlanChangePreviewProps {
    preview: PlanChangePreviewData | null;
    previewLoading: boolean;
    // Payment Method
    currentCard: PaymentMethod | null;
    selectedPaymentMethod: "existing" | "new";
    onMethodChange: (method: "existing" | "new") => void;
    paymentFormRef: React.RefObject<PaymentMethodFormRef | null>;
    // Billing Info
    initialData?: Partial<BillingInfo> | null;
    currentBillingInfo: BillingInfo | null;
    selectedBillingMethod: "existing" | "new";
    onBillingMethodChange: (method: "existing" | "new") => void;
    billingFormRef: RefObject<BillingInfoFormRef | null>;
    onCountryChange?: (country: string) => void;
    onTaxIdChange: (vatId: string) => void;
    onTaxInfoIsValidChange: (taxInfoIsValid: boolean) => void;
    // Errors
    onSetupError?: (error: string) => void;
}

const PlanChangePreview: React.FC<PlanChangePreviewProps> = ({ 
    preview,
    previewLoading,
    currentCard,
    selectedPaymentMethod,
    onMethodChange,
    paymentFormRef,
    currentBillingInfo,
    selectedBillingMethod,
    onBillingMethodChange,
    billingFormRef,
    onCountryChange,
    onTaxIdChange,
    onTaxInfoIsValidChange,
    onSetupError
}) => {
    
    // Helper για billing period label
    const periodLabel = (period?: BillingPeriod) => period === 'yearly' ? '/έτος' : '/μήνα';
    const isSamePlanNewBillingPeriod = preview 
        ? preview.current.billing_period !== preview.new.billing_period && preview.current.plan === preview.new.plan
        : false;

    // Helper για amount display (handles negative/zero)
    const formatAmount = (amount: number | undefined, symbol: string | undefined) => {
        if (amount === undefined || amount === null) return '—';
        if (amount <= 0) return `0${symbol}`;
        return `${amount}${symbol}`;
    };

    // Check if this is a scheduled downgrade (no payment today)
    const isScheduledDowngrade = preview ? preview.proration.total <= 0 : false;

    // Skeleton component
    const Skeleton = ({ width = 80 }: { width?: number }) => (
        <div 
            className={styles.skeleton} 
            style={{ width: `${width}px` }}
        />
    );

    return (
        <div className={styles.previewContainer}>
            {/* Billing Info */}
            <div className={styles.previewSection}>
                <h3 className={styles.previewSectionTitle}>Στοιχεία Χρέωσης</h3>

                <div className={styles.billingMethodOptions}>
                    <div className={styles.optionsRow}>
                        {/* EXISTING BILLING INFO */}
                        {currentBillingInfo && (
                            <div
                                className={`${styles.billingOption} ${selectedBillingMethod === "existing" ? styles.active : ""}`}
                                onClick={() => onBillingMethodChange("existing")}
                            >
                                <div className={styles.radioOuter}>
                                    {selectedBillingMethod === "existing" && <div className={styles.radioInner} />}
                                </div>

                                <div className={styles.billingOptionInfo}>
                                    <strong>{currentBillingInfo.name}</strong>
                                    {currentBillingInfo.taxId && (
                                        <span>ΑΦΜ: {currentBillingInfo.taxId}</span>
                                    )}
                                    <span className={styles.billingAddress}>
                                        {currentBillingInfo.address}, {currentBillingInfo.city}{currentBillingInfo.postalCode ? ` ${currentBillingInfo.postalCode}` : ''}{currentBillingInfo.country ? `, ${currentBillingInfo.country}` : ''}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* NEW BILLING INFO */}
                        <div
                            className={`${styles.billingOption} ${selectedBillingMethod === "new" ? styles.active : ""}`}
                            onClick={() => onBillingMethodChange("new")}
                        >
                            <div className={styles.radioOuter}>
                                {selectedBillingMethod === "new" && <div className={styles.radioInner} />}
                            </div>

                            <div className={styles.billingOptionInfo}>
                                <strong>Νέα στοιχεία χρέωσης</strong>
                                <span>Προσθήκη νέων στοιχείων τιμολόγησης</span>
                            </div>
                        </div>
                    </div>

                    {/* BILLING FORM */}
                    {selectedBillingMethod === "new" && (
                        <div className={styles.billingFormWrapper}>
                            <BillingInfoForm 
                                ref={billingFormRef} 
                                onCountryChange={onCountryChange}
                                onTaxIdChange={onTaxIdChange}
                                onTaxInfoIsValidChange={onTaxInfoIsValidChange}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Card - Hide if scheduled downgrade (no payment needed) */}
            {!isScheduledDowngrade && (
                <div className={styles.previewSection}>
                    <h3 className={styles.previewSectionTitle}>Τρόπος Πληρωμής</h3>

                    <div className={styles.paymentMethodOptions}>
                        <div className={styles.optionsRow}>
                            {/* EXISTING CARD */}
                            {currentCard && (
                                <div
                                    className={`${styles.paymentOption} ${selectedPaymentMethod === "existing" ? styles.active : ""}`}
                                    onClick={() => onMethodChange("existing")}
                                >
                                    <div className={styles.radioOuter}>
                                        {selectedPaymentMethod === "existing" && <div className={styles.radioInner} />}
                                    </div>

                                    <div className={styles.paymentOptionInfo}>
                                        <div className={styles.cardRow}>
                                            <CreditCard size={18} />
                                            <strong>{currentCard.brand?.toUpperCase()}</strong>
                                            <span>•••• {currentCard.last4}</span>
                                        </div>
                                        <span className={styles.expiry}>
                                            Λήξη: {currentCard.exp_month}/{currentCard.exp_year}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* NEW CARD */}
                            <div
                                className={`${styles.paymentOption} ${selectedPaymentMethod === "new" ? styles.active : ""}`}
                                onClick={() => onMethodChange("new")}
                            >
                                <div className={styles.radioOuter}>
                                    {selectedPaymentMethod === "new" && <div className={styles.radioInner} />}
                                </div>

                                <div className={styles.paymentOptionInfo}>
                                <strong>Νέα κάρτα</strong>
                                <span>Προσθήκη νέας κάρτας πληρωμής</span>
                            </div>
                        </div>

                        {/* PAYMENT FORM */}
                        {selectedPaymentMethod === "new" && (
                            <div className={styles.paymentFormWrapper}>
                                <PaymentForm
                                    ref={paymentFormRef}
                                    onSetupError={onSetupError}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            )}

            {/* Current Plan */}
            <div className={styles.previewSection}>
                <h3 className={styles.previewSectionTitle}>
                    {isSamePlanNewBillingPeriod ? "Τρέχον Περίοδος" : "Τρέχον Πλάνο"}
                </h3>
                <div className={styles.previewCard}>
                    <div className={styles.previewRow}>
                        <span className={styles.previewLabel}>
                            {previewLoading ? <Skeleton width={100} /> : (
                                <>
                                    {preview?.current.plan}
                                    <span className={styles.previewBadge}>
                                        {preview?.current.billing_period === 'yearly' ? 'Ετήσια' : 'Μηνιαία'}
                                    </span>
                                </>
                            )}
                        </span>
                        <span className={styles.previewValue}>
                            {previewLoading ? <Skeleton width={60} /> : (
                                <>{preview?.current.total}{preview?.currency.symbol}{periodLabel(preview?.current.billing_period)}</>
                            )}
                        </span>
                    </div>
                    {!previewLoading && preview && (
                        <div className={styles.previewBreakdown}>
                            <div className={styles.previewBreakdownRow}>
                                <span>Πλάνο</span>
                                <span>{preview.current.breakdown.plan}{preview.currency.symbol}</span>
                            </div>
                            {preview.current.breakdown.extra_stores > 0 && (
                                <div className={styles.previewBreakdownRow}>
                                    <span>Επιπλέον καταστήματα</span>
                                    <span>{preview.current.breakdown.extra_stores}{preview.currency.symbol}</span>
                                </div>
                            )}
                            {preview.current.breakdown.plugins > 0 && (
                                <div className={styles.previewBreakdownRow}>
                                    <span>Πρόσθετα</span>
                                    <span>{preview.current.breakdown.plugins}{preview.currency.symbol}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Arrow Down */}
            <div className={styles.previewArrow}>↓</div>

            {/* New Plan */}
            <div className={styles.previewSection}>
                <h3 className={styles.previewSectionTitle}>
                    {isSamePlanNewBillingPeriod ? "Νέα Περίοδος" : "Νέο Πλάνο"}
                </h3>
                <div className={styles.previewCard}>
                    <div className={styles.previewRow}>
                        <span className={styles.previewLabel}>
                            {previewLoading ? <Skeleton width={100} /> : (
                                <>
                                    {preview?.new.plan}
                                    <span className={styles.previewBadge}>
                                        {preview?.new.billing_period === 'yearly' ? 'Ετήσια' : 'Μηνιαία'}
                                    </span>
                                </>
                            )}
                        </span>
                        <span className={styles.previewValue}>
                            {previewLoading ? <Skeleton width={60} /> : (
                                <>{preview?.new.total}{preview?.currency.symbol}{periodLabel(preview?.new.billing_period)}</>
                            )}
                        </span>
                    </div>
                    {!previewLoading && preview && (
                        <div className={styles.previewBreakdown}>
                            <div className={styles.previewBreakdownRow}>
                                <span>Πλάνο</span>
                                <span>{preview.new.breakdown.plan}{preview.currency.symbol}</span>
                            </div>
                            {preview.new.breakdown.extra_stores > 0 && (
                                <div className={styles.previewBreakdownRow}>
                                    <span>Επιπλέον καταστήματα</span>
                                    <span>{preview.new.breakdown.extra_stores}{preview.currency.symbol}</span>
                                </div>
                            )}
                            {preview.new.breakdown.plugins > 0 && (
                                <div className={styles.previewBreakdownRow}>
                                    <span>Πρόσθετα</span>
                                    <span>{preview.new.breakdown.plugins}{preview.currency.symbol}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Proration Info */}
            <div className={styles.previewSection}>
                <h3 className={styles.previewSectionTitle}>
                    {isScheduledDowngrade ? "Αλλαγή Πλάνου" : "Χρέωση Σήμερα"}
                </h3>
                <div className={styles.previewCard}>
                    {isScheduledDowngrade ? (
                        // Scheduled downgrade - no payment today
                        <>
                            <div className={styles.previewRow}>
                                <span className={styles.previewLabel}>Πληρωτέο σήμερα</span>
                                <span className={styles.previewValue}>—</span>
                            </div>
                            <div className={styles.scheduledInfo}>
                                Η αλλαγή θα ενεργοποιηθεί στο τέλος της τρέχουσας περιόδου χρέωσης.
                            </div>
                        </>
                    ) : (
                        // Immediate change with payment
                        <>
                            <div className={styles.previewRow}>
                                <span className={styles.previewLabel}>
                                    {previewLoading ? <Skeleton width={150} /> : preview?.proration.description}
                                </span>
                                <span className={styles.previewValue}>
                                    {previewLoading ? <Skeleton width={60} /> : (
                                        formatAmount(preview?.proration.total, preview?.currency.symbol)
                                    )}
                                </span>
                            </div>
                            <div className={styles.previewBreakdown}>
                                <div className={styles.previewBreakdownRow}>
                                    <span>Υποσύνολο</span>
                                    {previewLoading ? <Skeleton width={50} /> : (
                                        <span>{formatAmount(preview?.proration.amount, preview?.currency.symbol)}</span>
                                    )}
                                </div>
                                <div className={styles.previewBreakdownRow}>
                                    <span>ΦΠΑ {previewLoading ? '' : `${preview?.summary?.tax_percent}%`}</span>
                                    {previewLoading ? <Skeleton width={50} /> : (
                                        <span>{formatAmount(preview?.proration.vat, preview?.currency.symbol)}</span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Info Notice */}
            <div className={styles.previewNotice}>
                {previewLoading ? (
                    <>
                        <Skeleton width={300} />
                        <Skeleton width={250} />
                    </>
                ) : isScheduledDowngrade ? (
                    // Scheduled downgrade notice
                    <>
                        <p>
                            Το νέο πλάνο θα ενεργοποιηθεί στο τέλος της τρέχουσας περιόδου χρέωσης.
                            Μέχρι τότε, θα έχετε πρόσβαση σε όλες τις λειτουργίες του τρέχοντος πλάνου.
                        </p>
                        <p>
                            Από την επόμενη ανανέωση, θα χρεώνεστε <strong>{preview?.new.total}{preview?.currency.symbol}{periodLabel(preview?.new.billing_period)}</strong>.
                        </p>
                    </>
                ) : (
                    // Immediate change notice
                    <>
                        <p>
                            Η νέα χρέωση θα ενεργοποιηθεί αμέσως και θα χρεωθείτε 
                            <strong> {formatAmount(preview?.proration.total, preview?.currency.symbol)}</strong> σήμερα για την υπόλοιπη περίοδο.
                        </p>
                        <p>
                            Από την επόμενη ανανέωση, θα χρεώνεστε <strong>{preview?.new.total}{preview?.currency.symbol}{periodLabel(preview?.new.billing_period)}</strong>.
                        </p>
                    </>
                )}
            </div>

            {/* Warning Notice - Downgrade */}
            {!previewLoading && preview?.warning && (
                <div className={styles.warningNotice}>
                    <p className={styles.warningTitle}>⚠️ {preview.warning.message}</p>
                </div>
            )}
        </div>
    );
};

export default PlanChangePreview;