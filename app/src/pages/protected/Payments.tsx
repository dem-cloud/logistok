import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePayments, type Payment } from "@/hooks/usePayments";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { usePurchases } from "@/hooks/usePurchases";
import { useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { Plus } from "lucide-react";
import Button from "@/components/reusable/Button";
import SidePopup from "@/components/reusable/SidePopup";
import LoadingSpinner from "@/components/LoadingSpinner";
import styles from "./Payments.module.css";

function formatDate(iso: string | null) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("el-GR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    } catch {
        return "—";
    }
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

export default function Payments() {
    const { activeStore, showToast } = useAuth();
    const queryClient = useQueryClient();
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("");

    const [showNewPayment, setShowNewPayment] = useState(false);
    const [newPaymentPurchaseId, setNewPaymentPurchaseId] = useState<string>("");
    const [newPaymentAmount, setNewPaymentAmount] = useState("");
    const [newPaymentPaymentMethodId, setNewPaymentPaymentMethodId] = useState("");
    const [newPaymentDate, setNewPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [newPaymentNotes, setNewPaymentNotes] = useState("");
    const [newPaymentErrors, setNewPaymentErrors] = useState<Record<string, string>>({});
    const [newPaymentSaving, setNewPaymentSaving] = useState(false);

    const storeId = activeStore?.id ?? "";

    const filters = useMemo(
        () => ({
            store_id: storeId,
            from: dateFrom.trim() || undefined,
            to: dateTo.trim() || undefined,
            payment_method_id: paymentMethodFilter.trim() || undefined,
        }),
        [storeId, dateFrom, dateTo, paymentMethodFilter]
    );

    const { payments, isLoading, isFetching, refetch: refetchPayments } = usePayments(filters);
    const { paymentMethods } = usePaymentMethods();
    const { purchases } = usePurchases({
        storeId: storeId || undefined,
        documentType: undefined,
    });

    const purchasesWithBalance = useMemo(
        () =>
            purchases.filter(
                (p) =>
                    ["PUR", "GRN"].includes((p.document_type || "PUR").toUpperCase()) &&
                    ["received", "completed"].includes((p.status || "").toLowerCase()) &&
                    (p.amount_due ?? 0) > 0
            ),
        [purchases]
    );

    const totalAmount = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const handleOpenNewPayment = () => {
        setNewPaymentPurchaseId("");
        setNewPaymentAmount("");
        setNewPaymentPaymentMethodId(paymentMethods.find((pm) => pm.is_active)?.id ?? "");
        setNewPaymentDate(new Date().toISOString().slice(0, 10));
        setNewPaymentNotes("");
        setNewPaymentErrors({});
        setShowNewPayment(true);
    };

    const handleSubmitNewPayment = async () => {
        if (!activeStore?.id) return;
        const err: Record<string, string> = {};
        if (!newPaymentPurchaseId) err.purchase_id = "Επιλέξτε αγορά";
        const amt = parseFloat(newPaymentAmount) || 0;
        if (amt <= 0) err.amount = "Το ποσό πρέπει να είναι θετικό";
        if (!newPaymentPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        const purchase = purchasesWithBalance.find((p) => String(p.id) === newPaymentPurchaseId);
        if (purchase && amt > (purchase.amount_due ?? 0)) err.amount = `Μέγιστο ποσό: ${(purchase.amount_due ?? 0).toFixed(2)} €`;
        setNewPaymentErrors(err);
        if (Object.keys(err).length > 0) return;

        setNewPaymentSaving(true);
        try {
            await axiosPrivate.post("/api/shared/company/payments", {
                store_id: activeStore.id,
                purchase_id: parseInt(newPaymentPurchaseId, 10),
                amount: amt,
                payment_method_id: newPaymentPaymentMethodId,
                payment_date: newPaymentDate ? `${newPaymentDate}T12:00:00.000Z` : undefined,
                notes: newPaymentNotes.trim() || null,
            });
            showToast({ message: "Η πληρωμή καταχωρήθηκε επιτυχώς", type: "success" });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
            refetchPayments();
            setShowNewPayment(false);
        } catch (e: unknown) {
            const ax = e as { response?: { data?: { message?: string } } };
            showToast({ message: ax.response?.data?.message || "Σφάλμα", type: "error" });
        } finally {
            setNewPaymentSaving(false);
        }
    };

    if (!activeStore) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.headerRow}>
                    <h1 className={styles.title}>Πληρωμές</h1>
                    <p className={styles.subtitle}>Επιλέξτε κατάστημα για να δείτε τις πληρωμές</p>
                </div>
                <div className={styles.section}>
                    <p className={styles.sectionHint}>
                        Δεν έχει επιλεγεί κατάστημα. Επιλέξτε ένα κατάστημα από το μενού πάνω.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.headerRow}>
                <h1 className={styles.title}>Πληρωμές</h1>
                <p className={styles.subtitle}>Ιστορικό πληρωμών προς προμηθευτές</p>
            </div>

            <div className={styles.listToolbar}>
                <div className={styles.filtersRow}>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Από</label>
                        <input
                            type="date"
                            className={styles.filterInput}
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Έως</label>
                        <input
                            type="date"
                            className={styles.filterInput}
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Τρόπος πληρωμής</label>
                        <select
                            className={styles.filterSelect}
                            value={paymentMethodFilter}
                            onChange={(e) => setPaymentMethodFilter(e.target.value)}
                        >
                            <option value="">Όλοι</option>
                            {paymentMethods.map((pm) => (
                                <option key={pm.id} value={pm.id}>
                                    {pm.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className={styles.addBtn}>
                    <Button variant="primary" onClick={handleOpenNewPayment} disabled={!activeStore?.id}>
                        <Plus size={16} />
                        Νέα πληρωμή
                    </Button>
                </div>
            </div>

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Λίστα πληρωμών</h3>
                {isLoading && payments.length === 0 ? (
                    <div className={styles.listLoading}>
                        <LoadingSpinner />
                    </div>
                ) : payments.length === 0 ? (
                    <p className={styles.sectionHint}>
                        Δεν βρέθηκαν πληρωμές για τα επιλεγμένα κριτήρια.
                    </p>
                ) : (
                    <div className={styles.listWrapper}>
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Ημερομηνία</th>
                                        <th>Προμηθευτής</th>
                                        <th>Έγγραφο</th>
                                        <th>Τρόπος</th>
                                        <th className={styles.amountCol}>Ποσό</th>
                                        <th>Είδος</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((p: Payment) => (
                                        <tr key={p.id}>
                                            <td>{formatDate(p.payment_date)}</td>
                                            <td>{p.vendor_name ?? "—"}</td>
                                            <td>{p.purchase_number ?? "—"}</td>
                                            <td>{p.payment_method_name ?? "—"}</td>
                                            <td className={styles.amountCol}>{formatCurrency(p.amount)}</td>
                                            <td>
                                                {p.is_auto ? (
                                                    <span className={styles.autoBadge}>Αυτόματη</span>
                                                ) : (
                                                    <span className={styles.manualBadge}>Χειροκίνητη</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className={styles.footerRow}>
                            <span className={styles.totalLabel}>Σύνολο:</span>
                            <span className={styles.totalAmount}>{formatCurrency(totalAmount)}</span>
                        </div>
                        {isFetching && (
                            <div className={styles.listOverlay}>
                                <LoadingSpinner />
                            </div>
                        )}
                    </div>
                )}
            </div>

            <SidePopup
                isOpen={showNewPayment}
                onClose={() => setShowNewPayment(false)}
                title="Νέα πληρωμή"
                width="480px"
                footerLeftButton={{ label: "Κλείσιμο", onClick: () => setShowNewPayment(false), variant: "outline" }}
                footerRightButton={{
                    label: "Αποθήκευση",
                    onClick: handleSubmitNewPayment,
                    variant: "primary",
                    loading: newPaymentSaving,
                    disabled: purchasesWithBalance.length === 0,
                }}
            >
                {purchasesWithBalance.length === 0 ? (
                    <p className={styles.sectionHint}>
                        Δεν υπάρχουν αγορές/δελτία με υπόλοιπο για καταχώρηση πληρωμών. Δημιουργήστε πρώτα ολοκληρωμένη αγορά στην ενότητα Αγορές.
                    </p>
                ) : (
                <>
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Αγορά / Δελτίο *</label>
                    <select
                        className={styles.formSelect}
                        value={newPaymentPurchaseId}
                        onChange={(e) => {
                            setNewPaymentPurchaseId(e.target.value);
                            const purchase = purchasesWithBalance.find((p) => String(p.id) === e.target.value);
                            setNewPaymentAmount(purchase ? String(purchase.amount_due ?? "") : "");
                            setNewPaymentErrors((prev) => ({ ...prev, purchase_id: "" }));
                        }}
                    >
                        <option value="">Επιλέξτε αγορά</option>
                        {purchasesWithBalance.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.invoice_number ?? `#${p.id}`} — {p.vendor?.name ?? "—"} (Υπόλοιπο: {formatCurrency(p.amount_due ?? 0)})
                            </option>
                        ))}
                    </select>
                    {newPaymentErrors.purchase_id && <span className={styles.formError}>{newPaymentErrors.purchase_id}</span>}
                </div>
                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                    <label className={styles.formLabel}>Ποσό *</label>
                    <input
                        type="number"
                        className={styles.formInput}
                        min={0}
                        step={0.01}
                        value={newPaymentAmount}
                        onChange={(e) => {
                            setNewPaymentAmount(e.target.value);
                            setNewPaymentErrors((prev) => ({ ...prev, amount: "" }));
                        }}
                        placeholder="0.00"
                    />
                    {newPaymentErrors.amount && <span className={styles.formError}>{newPaymentErrors.amount}</span>}
                </div>
                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                    <label className={styles.formLabel}>Τρόπος πληρωμής *</label>
                    <select
                        className={styles.formSelect}
                        value={newPaymentPaymentMethodId}
                        onChange={(e) => {
                            setNewPaymentPaymentMethodId(e.target.value);
                            setNewPaymentErrors((prev) => ({ ...prev, payment_method_id: "" }));
                        }}
                    >
                        <option value="">Επιλέξτε</option>
                        {paymentMethods.filter((pm) => pm.is_active).map((pm) => (
                            <option key={pm.id} value={pm.id}>{pm.name}</option>
                        ))}
                    </select>
                    {newPaymentErrors.payment_method_id && <span className={styles.formError}>{newPaymentErrors.payment_method_id}</span>}
                </div>
                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                    <label className={styles.formLabel}>Ημερομηνία</label>
                    <input
                        type="date"
                        className={styles.formInput}
                        value={newPaymentDate}
                        onChange={(e) => setNewPaymentDate(e.target.value)}
                    />
                </div>
                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                    <label className={styles.formLabel}>Σημειώσεις</label>
                    <input
                        type="text"
                        className={styles.formInput}
                        value={newPaymentNotes}
                        onChange={(e) => setNewPaymentNotes(e.target.value)}
                        placeholder="Προαιρετικό"
                    />
                </div>
                </>
                )}
            </SidePopup>
        </div>
    );
}
