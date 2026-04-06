import { useRef, useState } from "react";
import styles from "./SubscriptionBilling.module.css";
import { useAuth } from "@/contexts/AuthContext";
import { useBillingDetails } from "@/hooks/useBillingDetails";
import LoadingSpinner from "@/components/LoadingSpinner";
import SidePopup from "@/components/reusable/SidePopup";
import Button from "@/components/reusable/Button";
import {
    CreditCard,
    Building2,
    Calendar,
    AlertCircle,
    Pencil,
    Receipt,
    Package,
    Store,
    Puzzle,
} from "lucide-react";
import PaymentForm from "@/components/PaymentForm";
import { PaymentMethodFormRef } from "@/components/PaymentMethodForm";
import { axiosPrivate } from "@/api/axios";
import { useQueryClient } from "@tanstack/react-query";
import BillingInfoForm, { BillingInfoFormRef } from "@/components/BillingInfoForm";

// ============================================
// BILLING ITEM ROW
// ============================================
const BillingItemRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    quantity?: number;
    amount: number;
    currency: string;
    period: string;
}> = ({ icon, label, quantity, amount, currency, period }) => (
    <div className={styles.billingItem}>
        <div className={styles.billingItemLeft}>
            <span className={styles.billingItemIcon}>{icon}</span>
            <span className={styles.billingItemLabel}>
                {label}
                {quantity && quantity > 1 && (
                    <span className={styles.billingItemQty}> (x{quantity})</span>
                )}
            </span>
        </div>
        <span className={styles.billingItemAmount}>
            {amount.toFixed(2)}{currency}/{period}
        </span>
    </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
export default function SubscriptionBilling() {
    const queryClient = useQueryClient();
    const { showToast } = useAuth();
    const { data: billing, isLoading } = useBillingDetails();

    const [isEditPaymentOpen, setIsEditPaymentOpen] = useState(false);
    const [isEditBillingInfoOpen, setIsEditBillingInfoOpen] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    
    const paymentFormRef = useRef<PaymentMethodFormRef>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const billingFormRef = useRef<BillingInfoFormRef>(null);
    const [isBillingSubmitting, setIsBillingSubmitting] = useState(false);

    const [isCancelSubmitting, setIsCancelSubmitting] = useState(false);
    const [isReactivating, setIsReactivating] = useState(false);

    if (isLoading || !billing) {
        return <LoadingSpinner />;
    }

    const {
        items,
        payment_method,
        billing_info,
        billing_period,
        next_billing,
        currency,
        cancel_at_period_end,
    } = billing;

    const periodLabel = billing_period === "yearly" ? "έτος" : "μήνα";

    // Calculate totals
    const planItem = items.find(i => i.item_type === "plan");
    const extraStoreItem = items.find(i => i.item_type === "extra_store");
    const pluginItems = items.filter(i => i.item_type === "plugin");

    const subtotal = items.reduce((sum, item) => sum + (item.unit_amount * item.quantity), 0);
    const vatPercent = 24; // θα έρχεται από backend αν χρειάζεται
    const vatAmount = subtotal * (vatPercent / 100);
    const total = subtotal + vatAmount;

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString("el-GR", {
            day: "numeric",
            month: "long",
            year: "numeric",
        });
    };


    const handleSaveCard = async () => {
        if (!paymentFormRef.current) return;

        setIsSubmitting(true);

        const { paymentMethodId, error } = await paymentFormRef.current.submit();

        if (error) {
            showToast({ message: error, type: "error" });
            setIsSubmitting(false);
            return;
        }

        // Κάλεσε backend για να κάνεις attach την κάρτα ως default
        try {
            const response = await axiosPrivate.post("/api/billing/update-payment-method", {
                paymentMethodId
            });

            if (response.data.success) {
                showToast({ message: "Η κάρτα ενημερώθηκε επιτυχώς", type: "success" });
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["subscription"] }),
                    queryClient.invalidateQueries({ queryKey: ["billing-details"] }),
                ]);
                setIsEditPaymentOpen(false);
            } else {
                showToast({ message: "Αποτυχία ενημέρωσης κάρτας", type: "error" });
            }
        } catch (err) {
            showToast({ message: "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveBillingInfo = async () => {
        if (!billingFormRef.current) return;

        const { data, error } = billingFormRef.current.getData();

        if (error) {
            showToast({ message: error, type: "error" });
            return;
        }

        setIsBillingSubmitting(true);

        try {
            const response = await axiosPrivate.post("/api/billing/update-billing-info", data);

            if (response.data.success) {
                showToast({ message: "Τα στοιχεία ενημερώθηκαν επιτυχώς", type: "success" });
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["subscription"] }),
                    queryClient.invalidateQueries({ queryKey: ["billing-details"] }),
                ]);
                setIsEditBillingInfoOpen(false);
            } else {
                showToast({ message: response.data.message || "Σφάλμα", type: "error" });
            }
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } };
            showToast({ message: e.response?.data?.message || "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setIsBillingSubmitting(false);
        }
    };

    const handleCancelSubscription = async () => {
        setIsCancelSubmitting(true);
        try {
            const response = await axiosPrivate.post("/api/billing/cancel-subscription", {
                cancelImmediately: false
            });
            if (response.data.success) {
                showToast({ message: response.data.message || "Η συνδρομή θα ακυρωθεί στο τέλος της περιόδου", type: "success" });
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["subscription"] }),
                    queryClient.invalidateQueries({ queryKey: ["billing-details"] }),
                ]);
                setIsCancelModalOpen(false);
            } else {
                showToast({ message: response.data.message || "Αποτυχία ακύρωσης", type: "error" });
            }
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            showToast({ message: err.response?.data?.message || "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setIsCancelSubmitting(false);
        }
    };

    const handleReactivateSubscription = async () => {
        setIsReactivating(true);
        try {
            const response = await axiosPrivate.post("/api/billing/reactivate-subscription");
            if (response.data.success) {
                showToast({ message: response.data.message || "Η συνδρομή επανενεργοποιήθηκε", type: "success" });
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["subscription"] }),
                    queryClient.invalidateQueries({ queryKey: ["billing-details"] }),
                ]);
            } else {
                showToast({ message: response.data.message || "Αποτυχία επαναφοράς", type: "error" });
            }
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            showToast({ message: err.response?.data?.message || "Κάτι πήγε στραβά", type: "error" });
        } finally {
            setIsReactivating(false);
        }
    };

    return (
        <div className={styles.wrapper}>
            {/* Cancel Warning Banner */}
            {cancel_at_period_end && (
                <div className={styles.cancelBanner}>
                    <AlertCircle size={18} />
                    <span>
                        Η συνδρομή σας θα ακυρωθεί στις {formatDate(next_billing.date)}.
                        <button
                            type="button"
                            className={styles.reactivateLink}
                            onClick={handleReactivateSubscription}
                            disabled={isReactivating}
                        >
                            {isReactivating ? "Επεξεργασία..." : "Επαναφορά συνδρομής"}
                        </button>
                    </span>
                </div>
            )}

            <div className={styles.grid}>
                {/* Left Column */}
                <div className={styles.leftColumn}>
                    {/* Billing Breakdown */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <Receipt size={18} />
                            <h3>Ανάλυση Χρέωσης</h3>
                        </div>

                        <div className={styles.billingList}>
                            {/* Plan */}
                            {planItem && (
                                <BillingItemRow
                                    icon={<Package size={16} />}
                                    label={`${planItem.name} Plan`}
                                    amount={planItem.unit_amount}
                                    currency={currency}
                                    period={periodLabel}
                                />
                            )}

                            {/* Extra Stores */}
                            {extraStoreItem && extraStoreItem.quantity > 0 && (
                                <BillingItemRow
                                    icon={<Store size={16} />}
                                    label="Extra καταστήματα"
                                    quantity={extraStoreItem.quantity}
                                    amount={extraStoreItem.unit_amount * extraStoreItem.quantity}
                                    currency={currency}
                                    period={periodLabel}
                                />
                            )}

                            {/* Plugins */}
                            {pluginItems.map((plugin) => (
                                <BillingItemRow
                                    key={plugin.plugin_key}
                                    icon={<Puzzle size={16} />}
                                    label={plugin.name}
                                    amount={plugin.unit_amount}
                                    currency={currency}
                                    period={periodLabel}
                                />
                            ))}
                        </div>

                        <div className={styles.billingDivider} />

                        {/* Totals */}
                        <div className={styles.billingTotals}>
                            <div className={styles.billingTotalRow}>
                                <span>Υποσύνολο</span>
                                <span>{subtotal.toFixed(2)}{currency}</span>
                            </div>
                            <div className={styles.billingTotalRow}>
                                <span>ΦΠΑ ({vatPercent}%)</span>
                                <span>{vatAmount.toFixed(2)}{currency}</span>
                            </div>
                            <div className={`${styles.billingTotalRow} ${styles.billingTotalFinal}`}>
                                <span>Σύνολο</span>
                                <span>{total.toFixed(2)}{currency}/{periodLabel}</span>
                            </div>
                        </div>
                    </div>

                    {/* Next Billing */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <Calendar size={18} />
                            <h3>Επόμενη Χρέωση</h3>
                        </div>

                        <div className={styles.nextBilling}>
                            <div className={styles.nextBillingAmount}>
                                {next_billing.amount.toFixed(2)}{currency}
                            </div>
                            <div className={styles.nextBillingDate}>
                                στις {formatDate(next_billing.date)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className={styles.rightColumn}>
                    {/* Payment Method */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <CreditCard size={18} />
                            <h3>Μέθοδος Πληρωμής</h3>
                            <button
                                className={styles.editButton}
                                onClick={() => setIsEditPaymentOpen(true)}
                            >
                                <Pencil size={14} />
                                Αλλαγή
                            </button>
                        </div>

                        {payment_method ? (
                            <div className={styles.paymentMethod}>
                                <div className={styles.cardBrand}>
                                    {payment_method.brand.toUpperCase()}
                                </div>
                                <div className={styles.cardDetails}>
                                    <span className={styles.cardNumber}>
                                        •••• •••• •••• {payment_method.last4}
                                    </span>
                                    <span className={styles.cardExpiry}>
                                        Λήξη {payment_method.exp_month}/{payment_method.exp_year}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.noPaymentMethod}>
                                Δεν έχει οριστεί μέθοδος πληρωμής
                            </div>
                        )}
                    </div>

                    {/* Billing Info */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <Building2 size={18} />
                            <h3>Στοιχεία Τιμολόγησης</h3>
                            <button
                                className={styles.editButton}
                                onClick={() => setIsEditBillingInfoOpen(true)}
                            >
                                <Pencil size={14} />
                                Επεξεργασία
                            </button>
                        </div>

                        {billing_info ? (
                            <div className={styles.billingInfo}>
                                <p className={styles.billingInfoName}>{billing_info.name}</p>
                                {billing_info.taxId && (
                                    <p className={styles.billingInfoVat}>ΑΦΜ: {billing_info.taxId}</p>
                                )}
                                {billing_info.address && (
                                    <p className={styles.billingInfoAddress}>
                                        {billing_info.address}, {billing_info.city} {billing_info.postalCode}
                                    </p>
                                )}
                                {billing_info.country && (
                                    <p className={styles.billingInfoCountry}>{billing_info.country}</p>
                                )}
                            </div>
                        ) : (
                            <div className={styles.noBillingInfo}>
                                Δεν έχουν οριστεί στοιχεία τιμολόγησης
                            </div>
                        )}
                    </div>

                    {/* Cancel Subscription */}
                    <div className={styles.card}>
                        <div className={styles.dangerZone}>
                            <div>
                                <h4>Ακύρωση Συνδρομής</h4>
                                <p>Η συνδρομή θα παραμείνει ενεργή μέχρι το τέλος της τρέχουσας περιόδου.</p>
                            </div>
                            <Button
                                variant="danger"
                                onClick={() => setIsCancelModalOpen(true)}
                                disabled={cancel_at_period_end}
                            >
                                {cancel_at_period_end ? "Ακυρώθηκε" : "Ακύρωση"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Payment Method Popup */}
            <SidePopup
                isOpen={isEditPaymentOpen}
                onClose={() => setIsEditPaymentOpen(false)}
                title="Ενημέρωση Κάρτας"
                width="480px"
                footerLeftButton={{
                    label: "Κλείσιμο",
                    variant: "outline",
                    onClick: () => setIsEditPaymentOpen(false),
                    show: true
                }}
                footerRightButton={{
                    label: isSubmitting ? "Αποθήκευση..." : "Αποθήκευση",
                    variant: "primary",
                    onClick: handleSaveCard,
                    show: true,
                    disabled: isSubmitting,
                    loading: isSubmitting
                }}
            >
                <PaymentForm 
                    ref={paymentFormRef}
                    onSetupError={(error) => showToast({ message: error, type: "error" })}
                />
            </SidePopup>

            {/* Edit Billing Info Popup */}
            <SidePopup
                isOpen={isEditBillingInfoOpen}
                onClose={() => setIsEditBillingInfoOpen(false)}
                title="Στοιχεία Τιμολόγησης"
                width="480px"
                footerLeftButton={{
                    label: "Κλείσιμο",
                    variant: "outline",
                    onClick: () => setIsEditBillingInfoOpen(false),
                    show: true
                }}
                footerRightButton={{
                    label: isBillingSubmitting ? "Αποθήκευση..." : "Αποθήκευση",
                    variant: "primary",
                    onClick: handleSaveBillingInfo,
                    show: true,
                    disabled: isBillingSubmitting,
                    loading: isBillingSubmitting
                }}
            >
                <BillingInfoForm 
                    ref={billingFormRef}
                    initialData={billing_info}
                />
            </SidePopup>

            {/* Cancel Confirmation Modal */}
            <SidePopup
                isOpen={isCancelModalOpen}
                onClose={() => setIsCancelModalOpen(false)}
                title="Ακύρωση Συνδρομής"
                width="420px"
                footerLeftButton={{
                    label: "Πίσω",
                    variant: "outline",
                    onClick: () => setIsCancelModalOpen(false),
                    show: true,
                }}
                footerRightButton={{
                    label: isCancelSubmitting ? "Ακύρωση..." : "Ακύρωση Συνδρομής",
                    variant: "danger",
                    onClick: handleCancelSubscription,
                    show: true,
                    disabled: isCancelSubmitting,
                    loading: isCancelSubmitting,
                }}
            >
                <div className={styles.cancelModalContent}>
                    <AlertCircle size={48} className={styles.cancelModalIcon} />
                    <p>
                        Είστε σίγουροι ότι θέλετε να ακυρώσετε τη συνδρομή σας;
                    </p>
                    <p className={styles.cancelModalNote}>
                        Θα έχετε πρόσβαση μέχρι τις {formatDate(next_billing.date)}.
                        Μετά από αυτή την ημερομηνία, θα χάσετε πρόσβαση στα premium features.
                    </p>
                </div>
            </SidePopup>
        </div>
    );
}