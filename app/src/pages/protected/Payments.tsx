import { useState, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePayments, type Payment } from "@/hooks/usePayments";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { usePurchases } from "@/hooks/usePurchases";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Info, FileDown } from "lucide-react";
import { axiosPrivate } from "@/api/axios";
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

const STATUS_LABELS: Record<string, string> = {
    draft: "Πρόχειρη",
    posted: "Οριστικοποιημένη",
    reversed: "Αντιλογισμένη",
};

export default function Payments() {
    const { activeStore, showToast } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("");

    const [editPayment, setEditPayment] = useState<Payment | null>(null);
    const [popupOpen, setPopupOpen] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    const [formAmount, setFormAmount] = useState("");
    const [formPaymentMethodId, setFormPaymentMethodId] = useState("");
    const [formPaymentDate, setFormPaymentDate] = useState("");
    const [formNotes, setFormNotes] = useState("");
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [pdfLoading, setPdfLoading] = useState(false);

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

    const { payments, isLoading, isFetching, createPayment, updatePayment, deletePayment } = usePayments(filters);
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

    const totalAmount = payments
        .filter((p) => p.status === "posted")
        .reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const populateForm = useCallback((p: Payment | null) => {
        if (p) {
            setFormAmount(String(p.amount ?? ""));
            setFormPaymentMethodId(p.payment_method_id ?? "");
            setFormPaymentDate(p.payment_date ? new Date(p.payment_date).toISOString().slice(0, 10) : "");
            setFormNotes(p.notes ?? "");
        } else {
            setFormAmount("");
            setFormPaymentMethodId(paymentMethods.find((pm) => pm.is_active)?.id ?? "");
            setFormPaymentDate(new Date().toISOString().slice(0, 10));
            setFormNotes("");
        }
        setFormErrors({});
        setDeleteConfirmId(null);
    }, [paymentMethods]);

    const openPayment = useCallback((p: Payment) => {
        setEditPayment(p);
        populateForm(p);
        setPopupOpen(true);
    }, [populateForm]);

    const closePopup = useCallback(() => {
        setPopupOpen(false);
        setEditPayment(null);
        setDeleteConfirmId(null);
        const params = new URLSearchParams(searchParams);
        if (params.has("open")) {
            params.delete("open");
            setSearchParams(params, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        const openId = searchParams.get("open");
        if (!openId) return;
        if (isLoading || isFetching) return;
        const found = payments.find((p) => String(p.id) === openId);
        if (found) {
            openPayment(found);
            const params = new URLSearchParams(searchParams);
            params.delete("open");
            setSearchParams(params, { replace: true });
        }
    }, [searchParams, payments, isLoading, isFetching, openPayment, setSearchParams]);

    const isDraft = (editPayment?.status || "posted") === "draft";
    const isPosted = (editPayment?.status || "posted") === "posted";
    const isReversed = (editPayment?.status || "posted") === "reversed";
    const isReadOnly = !isDraft;

    const handleSave = async () => {
        if (!editPayment) return;
        const err: Record<string, string> = {};
        const amt = parseFloat(formAmount) || 0;
        if (amt <= 0) err.amount = "Το ποσό πρέπει να είναι θετικό";
        if (!formPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        setFormErrors(err);
        if (Object.keys(err).length > 0) return;

        try {
            const result = await updatePayment.mutateAsync({
                id: editPayment.id,
                amount: amt,
                payment_method_id: formPaymentMethodId,
                payment_date: formPaymentDate ? `${formPaymentDate}T12:00:00.000Z` : undefined,
                notes: formNotes.trim() || null,
            });
            setEditPayment(result);
            showToast({ message: "Η πληρωμή αποθηκεύτηκε", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const handleFinalize = async () => {
        if (!editPayment) return;
        const err: Record<string, string> = {};
        const amt = parseFloat(formAmount) || 0;
        if (amt <= 0) err.amount = "Το ποσό πρέπει να είναι θετικό";
        if (!formPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        setFormErrors(err);
        if (Object.keys(err).length > 0) return;

        try {
            const result = await updatePayment.mutateAsync({
                id: editPayment.id,
                status: "posted",
                amount: amt,
                payment_method_id: formPaymentMethodId,
                payment_date: formPaymentDate ? `${formPaymentDate}T12:00:00.000Z` : undefined,
                notes: formNotes.trim() || null,
            });
            setEditPayment(result);
            showToast({ message: "Η πληρωμή οριστικοποιήθηκε", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const handleReverse = async () => {
        if (!editPayment) return;
        try {
            await updatePayment.mutateAsync({ id: editPayment.id, status: "reversed" });
            showToast({ message: "Η πληρωμή αντιλογίστηκε", type: "success" });
            closePopup();
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const handleDelete = async () => {
        if (!editPayment) return;
        try {
            await deletePayment.mutateAsync(editPayment.id);
            showToast({ message: "Η πληρωμή διαγράφηκε", type: "success" });
            closePopup();
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const handleDownloadPdf = useCallback(async () => {
        if (!editPayment) return;
        setPdfLoading(true);
        try {
            const res = await axiosPrivate.get(`/api/shared/company/payments/${editPayment.id}/pdf`, {
                responseType: "blob",
            });
            const blob = res.data as Blob;
            const filename = `pliromi-PAY-${String(editPayment.id).padStart(4, "0")}.pdf`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα κατά τη λήψη PDF", type: "error" });
        } finally {
            setPdfLoading(false);
        }
    }, [editPayment, showToast]);

    const handleNewPayment = async () => {
        if (!activeStore?.id || purchasesWithBalance.length === 0) return;
        const firstPurchase = purchasesWithBalance[0];
        try {
            const created = await createPayment.mutateAsync({
                store_id: activeStore.id,
                purchase_id: firstPurchase.id,
                amount: firstPurchase.amount_due ?? firstPurchase.total_amount ?? 0,
                payment_method_id: paymentMethods.find((pm) => pm.is_active)?.id,
            });
            openPayment(created);
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const statusBadgeClass = (s: string) =>
        s === "draft" ? styles.statusDraft : s === "reversed" ? styles.statusReversed : styles.statusPosted;

    const footerLeft = deleteConfirmId != null
        ? { label: "Πίσω", onClick: () => setDeleteConfirmId(null), variant: "outline" as const }
        : { label: "Κλείσιμο", onClick: closePopup, variant: "outline" as const };

    const footerRight = deleteConfirmId != null
        ? { label: "Επιβεβαίωση Διαγραφής", onClick: handleDelete, variant: "danger" as const, loading: deletePayment.isPending }
        : isDraft
            ? { label: "Οριστικοποίηση", onClick: handleFinalize, variant: "primary" as const, loading: updatePayment.isPending }
            : isPosted
                ? { label: "Αντιλογισμός Συναλλαγής", onClick: handleReverse, variant: "outline" as const, loading: updatePayment.isPending }
                : undefined;

    const footerActions = isDraft && deleteConfirmId == null
        ? [
            { label: "Αποθήκευση", onClick: handleSave, variant: "outline" as const, loading: updatePayment.isPending },
            { label: "Διαγραφή", onClick: () => editPayment && setDeleteConfirmId(editPayment.id), variant: "danger" as const },
          ]
        : (isPosted || isReversed) && deleteConfirmId == null
            ? [{ label: "Λήψη PDF", onClick: handleDownloadPdf, variant: "outline" as const, loading: pdfLoading }]
            : undefined;

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
                        <input type="date" className={styles.filterInput} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Έως</label>
                        <input type="date" className={styles.filterInput} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Τρόπος πληρωμής</label>
                        <select className={styles.filterSelect} value={paymentMethodFilter} onChange={(e) => setPaymentMethodFilter(e.target.value)}>
                            <option value="">Όλοι</option>
                            {paymentMethods.map((pm) => (
                                <option key={pm.id} value={pm.id}>{pm.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className={styles.addBtn}>
                    <Button variant="primary" onClick={handleNewPayment} disabled={!activeStore?.id || purchasesWithBalance.length === 0} loading={createPayment.isPending}>
                        <Plus size={16} />
                        Νέα πληρωμή
                    </Button>
                </div>
            </div>

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Λίστα πληρωμών</h3>
                {isLoading && payments.length === 0 ? (
                    <div className={styles.listLoading}><LoadingSpinner /></div>
                ) : payments.length === 0 ? (
                    <p className={styles.sectionHint}>Δεν βρέθηκαν πληρωμές για τα επιλεγμένα κριτήρια.</p>
                ) : (
                    <div className={styles.listWrapper}>
                        <div className={styles.summaryRow}>
                            <span className={styles.totalLabel}>Σύνολο:</span>
                            <span className={styles.totalAmount}>{formatCurrency(totalAmount)}</span>
                            <span className={styles.infoIcon} title="Μόνο οριστικοποιημένες πληρωμές">
                                <Info size={14} />
                            </span>
                        </div>
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Ημερομηνία</th>
                                        <th>Προμηθευτής</th>
                                        <th>Έγγραφο</th>
                                        <th>Τρόπος</th>
                                        <th className={styles.amountCol}>Ποσό</th>
                                        <th>Κατάσταση</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((p: Payment) => (
                                        <tr key={p.id} onClick={() => openPayment(p)}>
                                            <td>{formatDate(p.payment_date)}</td>
                                            <td>{p.vendor_name ?? "—"}</td>
                                            <td>{p.purchase_number ?? "—"}</td>
                                            <td>{p.payment_method_name ?? "—"}</td>
                                            <td className={styles.amountCol}>{formatCurrency(p.amount)}</td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${statusBadgeClass(p.status)}`}>
                                                    {STATUS_LABELS[p.status] || p.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {isFetching && (
                            <div className={styles.listOverlay}><LoadingSpinner /></div>
                        )}
                    </div>
                )}
            </div>

            <SidePopup
                isOpen={popupOpen}
                onClose={closePopup}
                title={
                    deleteConfirmId != null
                        ? "Διαγραφή πληρωμής"
                        : editPayment
                            ? isDraft ? "Επεξεργασία πληρωμής" : "Πληρωμή"
                            : "Νέα πληρωμή"
                }
                width="560px"
                footerLeftButton={footerLeft}
                footerRightButton={footerRight}
                footerActions={footerActions}
            >
                {editPayment ? (
                    <div className={styles.slidingWrapper}>
                        <div
                            className={styles.slidingPanels}
                            style={{ transform: deleteConfirmId != null ? "translateX(-50%)" : undefined }}
                        >
                            <div className={styles.slidingPanel}>
                                <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                                    <span className={`${styles.statusBadge} ${statusBadgeClass(editPayment.status)}`}>
                                        {STATUS_LABELS[editPayment.status] || editPayment.status}
                                    </span>
                                    {editPayment.purchase_number && editPayment.purchase_id && (
                                        <span
                                            className={styles.relatedDocLink}
                                            onClick={() => {
                                                closePopup();
                                                navigate("/purchases", { state: { openPurchaseId: editPayment.purchase_id } });
                                            }}
                                        >
                                            {editPayment.purchase_number}
                                        </span>
                                    )}
                                </div>

                                <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                                    <label className={styles.formLabel}>Προμηθευτής</label>
                                    <input type="text" className={`${styles.formInput} ${styles.formReadOnly}`} value={editPayment.vendor_name || "—"} readOnly />
                                </div>

                                {isDraft && (
                                    <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                                        <label className={styles.formLabel}>Σχετική αγορά</label>
                                        <input type="text" className={`${styles.formInput} ${styles.formReadOnly}`} value={editPayment.purchase_number || `#${editPayment.purchase_id}`} readOnly />
                                    </div>
                                )}

                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Ποσό *</label>
                                    <input
                                        type="number"
                                        className={`${styles.formInput} ${isReadOnly ? styles.formReadOnly : ""}`}
                                        min={0}
                                        step={0.01}
                                        value={formAmount}
                                        onChange={(e) => { setFormAmount(e.target.value); setFormErrors((prev) => ({ ...prev, amount: "" })); }}
                                        readOnly={isReadOnly}
                                        placeholder="0.00"
                                    />
                                    {formErrors.amount && <span className={styles.formError}>{formErrors.amount}</span>}
                                </div>

                                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                                    <label className={styles.formLabel}>Τρόπος πληρωμής *</label>
                                    <select
                                        className={`${styles.formSelect} ${isReadOnly ? styles.formReadOnly : ""}`}
                                        value={formPaymentMethodId}
                                        onChange={(e) => { setFormPaymentMethodId(e.target.value); setFormErrors((prev) => ({ ...prev, payment_method_id: "" })); }}
                                        disabled={isReadOnly}
                                    >
                                        <option value="">Επιλέξτε</option>
                                        {paymentMethods.filter((pm) => pm.is_active).map((pm) => (
                                            <option key={pm.id} value={pm.id}>{pm.name}</option>
                                        ))}
                                    </select>
                                    {formErrors.payment_method_id && <span className={styles.formError}>{formErrors.payment_method_id}</span>}
                                </div>

                                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                                    <label className={styles.formLabel}>Ημερομηνία</label>
                                    <input
                                        type="date"
                                        className={`${styles.formInput} ${isReadOnly ? styles.formReadOnly : ""}`}
                                        value={formPaymentDate}
                                        onChange={(e) => setFormPaymentDate(e.target.value)}
                                        readOnly={isReadOnly}
                                    />
                                </div>

                                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                                    <label className={styles.formLabel}>Σημειώσεις</label>
                                    <input
                                        type="text"
                                        className={`${styles.formInput} ${isReadOnly ? styles.formReadOnly : ""}`}
                                        value={formNotes}
                                        onChange={(e) => setFormNotes(e.target.value)}
                                        readOnly={isReadOnly}
                                        placeholder="Προαιρετικό"
                                    />
                                </div>
                            </div>

                            <div className={styles.slidingPanel}>
                                <p style={{ margin: 0, color: "#374151" }}>
                                    Θέλετε σίγουρα να διαγράψετε αυτή την πληρωμή;
                                </p>
                            </div>
                        </div>
                    </div>
                ) : null}
            </SidePopup>
        </div>
    );
}
