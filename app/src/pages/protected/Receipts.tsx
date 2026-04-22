import { useState, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useReceipts, type Receipt } from "@/hooks/useReceipts";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useSales } from "@/hooks/useSales";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Info } from "lucide-react";
import Button from "@/components/reusable/Button";
import SidePopup from "@/components/reusable/SidePopup";
import LoadingSpinner from "@/components/LoadingSpinner";
import styles from "./Receipts.module.css";

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

export default function Receipts() {
    const { activeStore, showToast } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("");

    const [editReceipt, setEditReceipt] = useState<Receipt | null>(null);
    const [popupOpen, setPopupOpen] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    const [formAmount, setFormAmount] = useState("");
    const [formPaymentMethodId, setFormPaymentMethodId] = useState("");
    const [formPaymentDate, setFormPaymentDate] = useState("");
    const [formNotes, setFormNotes] = useState("");
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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

    const { receipts, isLoading, isFetching, createReceipt, updateReceipt, deleteReceipt } = useReceipts(filters);
    const { paymentMethods } = usePaymentMethods();
    const { sales } = useSales({
        storeId: storeId || undefined,
        status: "completed",
        documentType: "INV",
    });

    const salesWithBalance = useMemo(
        () => sales.filter((s) => ((s.invoice_type || "").toUpperCase() === "INV") && ((s.amount_due ?? 0) > 0)),
        [sales]
    );

    const totalAmount = receipts
        .filter((r) => r.status === "posted")
        .reduce((sum, r) => sum + (r.amount ?? 0), 0);

    const populateForm = useCallback((r: Receipt | null) => {
        if (r) {
            setFormAmount(String(r.amount ?? ""));
            setFormPaymentMethodId(r.payment_method_id ?? "");
            setFormPaymentDate(r.payment_date ? new Date(r.payment_date).toISOString().slice(0, 10) : "");
            setFormNotes(r.notes ?? "");
        } else {
            setFormAmount("");
            setFormPaymentMethodId(paymentMethods.find((pm) => pm.is_active)?.id ?? "");
            setFormPaymentDate(new Date().toISOString().slice(0, 10));
            setFormNotes("");
        }
        setFormErrors({});
        setDeleteConfirmId(null);
    }, [paymentMethods]);

    const openReceipt = useCallback((r: Receipt) => {
        setEditReceipt(r);
        populateForm(r);
        setPopupOpen(true);
    }, [populateForm]);

    const closePopup = useCallback(() => {
        setPopupOpen(false);
        setEditReceipt(null);
        setDeleteConfirmId(null);
        const params = new URLSearchParams(searchParams);
        if (params.has("open")) {
            params.delete("open");
            setSearchParams(params, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        const openId = searchParams.get("open");
        if (openId && receipts.length > 0) {
            const found = receipts.find((r) => String(r.id) === openId);
            if (found) {
                openReceipt(found);
                const params = new URLSearchParams(searchParams);
                params.delete("open");
                setSearchParams(params, { replace: true });
            }
        }
    }, [searchParams, receipts, openReceipt, setSearchParams]);

    const isDraft = (editReceipt?.status || "posted") === "draft";
    const isPosted = (editReceipt?.status || "posted") === "posted";
    const isReversed = (editReceipt?.status || "posted") === "reversed";
    const isReadOnly = !isDraft;

    const handleSave = async () => {
        if (!editReceipt) return;
        const err: Record<string, string> = {};
        const amt = parseFloat(formAmount) || 0;
        if (amt <= 0) err.amount = "Το ποσό πρέπει να είναι θετικό";
        if (!formPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        setFormErrors(err);
        if (Object.keys(err).length > 0) return;

        try {
            const result = await updateReceipt.mutateAsync({
                id: editReceipt.id,
                amount: amt,
                payment_method_id: formPaymentMethodId,
                payment_date: formPaymentDate ? `${formPaymentDate}T12:00:00.000Z` : undefined,
                notes: formNotes.trim() || null,
            });
            setEditReceipt(result);
            showToast({ message: "Η είσπραξη αποθηκεύτηκε", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const handleFinalize = async () => {
        if (!editReceipt) return;
        const err: Record<string, string> = {};
        const amt = parseFloat(formAmount) || 0;
        if (amt <= 0) err.amount = "Το ποσό πρέπει να είναι θετικό";
        if (!formPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        setFormErrors(err);
        if (Object.keys(err).length > 0) return;

        try {
            const result = await updateReceipt.mutateAsync({
                id: editReceipt.id,
                status: "posted",
                amount: amt,
                payment_method_id: formPaymentMethodId,
                payment_date: formPaymentDate ? `${formPaymentDate}T12:00:00.000Z` : undefined,
                notes: formNotes.trim() || null,
            });
            setEditReceipt(result);
            showToast({ message: "Η είσπραξη οριστικοποιήθηκε", type: "success" });
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const handleReverse = async () => {
        if (!editReceipt) return;
        try {
            await updateReceipt.mutateAsync({ id: editReceipt.id, status: "reversed" });
            showToast({ message: "Η είσπραξη αντιλογίστηκε", type: "success" });
            closePopup();
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const handleDelete = async () => {
        if (!editReceipt) return;
        try {
            await deleteReceipt.mutateAsync(editReceipt.id);
            showToast({ message: "Η είσπραξη διαγράφηκε", type: "success" });
            closePopup();
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const handleNewReceipt = async () => {
        if (!activeStore?.id || salesWithBalance.length === 0) return;
        const firstSale = salesWithBalance[0];
        try {
            const created = await createReceipt.mutateAsync({
                store_id: activeStore.id,
                sale_id: firstSale.id,
                amount: firstSale.amount_due ?? firstSale.total_amount ?? 0,
                payment_method_id: paymentMethods.find((pm) => pm.is_active)?.id,
            });
            openReceipt(created);
        } catch (e) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const statusBadgeClass = (s: string) =>
        s === "draft" ? styles.statusDraft : s === "reversed" ? styles.statusReversed : styles.statusPosted;

    const footerLeft = deleteConfirmId != null
        ? { label: "Ακύρωση", onClick: () => setDeleteConfirmId(null), variant: "outline" as const }
        : { label: "Κλείσιμο", onClick: closePopup, variant: "outline" as const };

    const footerRight = deleteConfirmId != null
        ? { label: "Επιβεβαίωση Διαγραφής", onClick: handleDelete, variant: "danger" as const, loading: deleteReceipt.isPending }
        : isDraft
            ? { label: "Οριστικοποίηση", onClick: handleFinalize, variant: "primary" as const, loading: updateReceipt.isPending }
            : isPosted
                ? { label: "Αντιλογισμός Συναλλαγής", onClick: handleReverse, variant: "outline" as const, loading: updateReceipt.isPending }
                : undefined;

    const footerActions = isDraft && deleteConfirmId == null
        ? [
            { label: "Αποθήκευση", onClick: handleSave, variant: "outline" as const, loading: updateReceipt.isPending },
            { label: "Διαγραφή", onClick: () => editReceipt && setDeleteConfirmId(editReceipt.id), variant: "danger" as const },
          ]
        : undefined;

    if (!activeStore) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.headerRow}>
                    <h1 className={styles.title}>Εισπράξεις</h1>
                    <p className={styles.subtitle}>Επιλέξτε κατάστημα για να δείτε τις εισπράξεις</p>
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
                <h1 className={styles.title}>Εισπράξεις</h1>
                <p className={styles.subtitle}>Ιστορικό εισπράξεων από πωλήσεις</p>
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
                    <Button variant="primary" onClick={handleNewReceipt} disabled={!activeStore?.id || salesWithBalance.length === 0} loading={createReceipt.isPending}>
                        <Plus size={16} />
                        Νέα είσπραξη
                    </Button>
                </div>
            </div>

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Λίστα εισπράξεων</h3>
                {isLoading && receipts.length === 0 ? (
                    <div className={styles.listLoading}><LoadingSpinner /></div>
                ) : receipts.length === 0 ? (
                    <p className={styles.sectionHint}>Δεν βρέθηκαν εισπράξεις για τα επιλεγμένα κριτήρια.</p>
                ) : (
                    <div className={styles.listWrapper}>
                        <div className={styles.summaryRow}>
                            <span className={styles.totalLabel}>Σύνολο:</span>
                            <span className={styles.totalAmount}>{formatCurrency(totalAmount)}</span>
                            <span className={styles.infoIcon} title="Μόνο οριστικοποιημένες εισπράξεις">
                                <Info size={14} />
                            </span>
                        </div>
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Ημερομηνία</th>
                                        <th>Πελάτης</th>
                                        <th>Τιμολόγιο</th>
                                        <th>Τρόπος</th>
                                        <th className={styles.amountCol}>Ποσό</th>
                                        <th>Κατάσταση</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {receipts.map((r: Receipt) => (
                                        <tr key={r.id} onClick={() => openReceipt(r)}>
                                            <td>{formatDate(r.payment_date)}</td>
                                            <td>{r.customer_name ?? "—"}</td>
                                            <td>{r.invoice_number ?? "—"}</td>
                                            <td>{r.payment_method_name ?? "—"}</td>
                                            <td className={styles.amountCol}>{formatCurrency(r.amount)}</td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${statusBadgeClass(r.status)}`}>
                                                    {STATUS_LABELS[r.status] || r.status}
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
                        ? "Επιβεβαίωση διαγραφής"
                        : editReceipt
                            ? isDraft ? "Επεξεργασία είσπραξης" : "Είσπραξη"
                            : "Νέα είσπραξη"
                }
                width="560px"
                footerLeftButton={footerLeft}
                footerRightButton={footerRight}
                footerActions={footerActions}
            >
                {editReceipt && deleteConfirmId != null ? (
                    <p style={{ margin: 0, color: "#374151" }}>
                        Θέλετε σίγουρα να διαγράψετε αυτή την είσπραξη;
                    </p>
                ) : editReceipt ? (
                    <>
                        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                            <span className={`${styles.statusBadge} ${statusBadgeClass(editReceipt.status)}`}>
                                {STATUS_LABELS[editReceipt.status] || editReceipt.status}
                            </span>
                            {editReceipt.invoice_number && editReceipt.sale_id && (
                                <span
                                    className={styles.relatedDocLink}
                                    onClick={() => {
                                        closePopup();
                                        navigate("/sales");
                                    }}
                                >
                                    {editReceipt.invoice_number}
                                </span>
                            )}
                        </div>

                        <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                            <label className={styles.formLabel}>Πελάτης</label>
                            <input type="text" className={`${styles.formInput} ${styles.formReadOnly}`} value={editReceipt.customer_name || "—"} readOnly />
                        </div>

                        {isDraft && (
                            <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                                <label className={styles.formLabel}>Σχετικό τιμολόγιο</label>
                                <input type="text" className={`${styles.formInput} ${styles.formReadOnly}`} value={editReceipt.invoice_number || `#${editReceipt.sale_id}`} readOnly />
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

                    </>
                ) : null}
            </SidePopup>
        </div>
    );
}
