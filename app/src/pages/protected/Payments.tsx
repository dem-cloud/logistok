import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePayments, type Payment } from "@/hooks/usePayments";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { usePurchases, type Purchase } from "@/hooks/usePurchases";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Info, ChevronLeft, ChevronRight, Banknote } from "lucide-react";
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

// Converts an ISO yyyy-mm-dd date into the Greek dd/mm/yyyy display format
// used by the custom "text" presentation of the filter date inputs.
function formatDateDMY(iso: string) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

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
    const { activeStore, activeCompany, showToast } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    // Hidden native <input type="date"> refs — we keep a nice-looking text
    // input on top and trigger the picker via showPicker() so the displayed
    // format is always dd/mm/yyyy and the placeholder stays in Greek.
    const dateFromRef = useRef<HTMLInputElement | null>(null);
    const dateToRef = useRef<HTMLInputElement | null>(null);
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(20);

    const [editPayment, setEditPayment] = useState<Payment | null>(null);
    const [popupOpen, setPopupOpen] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    const [formAmount, setFormAmount] = useState("");
    const [formPaymentMethodId, setFormPaymentMethodId] = useState("");
    const [formPaymentDate, setFormPaymentDate] = useState("");
    const [formNotes, setFormNotes] = useState("");
    // In "new payment" mode the user picks which invoice this payment belongs to.
    // Kept as the id in string form because <select value> is a string.
    const [formPurchaseId, setFormPurchaseId] = useState<string>("");
    /** Ignores stale responses if the user switches purchases quickly. */
    const purchasePickSeq = useRef(0);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    /** Which draft popup footer action is in flight (save vs finalize share the same mutations). */
    const [draftFooterAction, setDraftFooterAction] = useState<null | "save" | "finalize">(null);
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

    // Client-side pagination — the API already returns the filtered set and
    // we just slice it. Resets on filter change or when the current page falls
    // past the last available page after the data set shrinks.
    const totalPages = Math.max(1, Math.ceil(payments.length / pageSize));
    useEffect(() => {
        setPage(1);
    }, [dateFrom, dateTo, paymentMethodFilter, storeId, pageSize]);
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);
    const paginatedPayments = useMemo(
        () => payments.slice((page - 1) * pageSize, page * pageSize),
        [payments, page, pageSize]
    );
    const rangeStart = payments.length === 0 ? 0 : (page - 1) * pageSize + 1;
    const rangeEnd = Math.min(page * pageSize, payments.length);

    const populateForm = useCallback((p: Payment | null) => {
        if (p) {
            setFormAmount(String(p.amount ?? ""));
            setFormPaymentMethodId(p.payment_method_id ?? "");
            setFormPaymentDate(p.payment_date ? new Date(p.payment_date).toISOString().slice(0, 10) : "");
            setFormNotes(p.notes ?? "");
            setFormPurchaseId(p.purchase_id != null ? String(p.purchase_id) : "");
        } else {
            setFormAmount("");
            setFormPaymentMethodId(paymentMethods.find((pm) => pm.is_active)?.id ?? "");
            setFormPaymentDate(new Date().toISOString().slice(0, 10));
            setFormNotes("");
            setFormPurchaseId("");
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

    // isNew: popup is opened for a brand-new payment not yet persisted.
    // We don't insert anything server-side until the user clicks
    // Αποθήκευση or Οριστικοποίηση, so closing the popup discards nothing.
    const isNew = editPayment == null;
    const isDraft = (editPayment?.status || "posted") === "draft";
    const isPosted = (editPayment?.status || "posted") === "posted";
    const isReversed = (editPayment?.status || "posted") === "reversed";
    // Form fields are editable for both draft and new; read-only once posted/reversed.
    const isReadOnly = !(isDraft || isNew);

    const selectedPurchase = useMemo(() => {
        const idStr = isNew ? formPurchaseId : (editPayment?.purchase_id != null ? String(editPayment.purchase_id) : "");
        if (!idStr) return null;
        return purchases.find((p) => String(p.id) === idStr) ?? null;
    }, [isNew, formPurchaseId, editPayment, purchases]);

    // Purchases list is cached; after other payments the row's amount_due can lag.
    // Fetch the selected document so Ποσό defaults to the current open balance.
    const handlePurchaseChange = useCallback(
        (newId: string) => {
            setFormPurchaseId(newId);
            setFormErrors((prev) => ({ ...prev, purchase_id: "" }));
            if (!newId.trim()) {
                setFormAmount("");
                return;
            }
            const seq = ++purchasePickSeq.current;
            void (async () => {
                try {
                    const res = await axiosPrivate.get(`/api/shared/company/purchases/${newId}`);
                    if (seq !== purchasePickSeq.current) return;
                    if (!res.data?.success || !res.data.data) return;
                    const fresh = res.data.data as Purchase;
                    const due = Math.round((Number(fresh.amount_due ?? fresh.total_amount) || 0) * 100) / 100;
                    setFormAmount(String(due));
                    if (activeCompany?.id) {
                        queryClient.invalidateQueries({ queryKey: ["purchases", activeCompany.id] });
                    }
                } catch {
                    if (seq !== purchasePickSeq.current) return;
                    const picked = purchasesWithBalance.find((p) => String(p.id) === newId);
                    setFormAmount(picked ? String(picked.amount_due ?? picked.total_amount ?? "") : "");
                }
            })();
        },
        [activeCompany?.id, queryClient, purchasesWithBalance]
    );
    // Shared validation for both Αποθήκευση and Οριστικοποίηση. In "new" mode
    // the user must also pick an invoice — the purchase_id is required server-side.
    const validateForm = (): { ok: boolean; amt: number } => {
        const err: Record<string, string> = {};
        const amt = parseFloat(formAmount) || 0;
        const capEps = 1e-6;
        if (isNew && !formPurchaseId) err.purchase_id = "Επιλέξτε αγορά";
        if (amt <= 0) err.amount = "Το ποσό πρέπει να είναι θετικό";
        if (!formPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        if (
            amt > 0 &&
            selectedPurchase &&
            ["PUR", "GRN"].includes((selectedPurchase.document_type || "PUR").toUpperCase())
        ) {
            const maxPay =
                Math.round((Number(selectedPurchase.amount_due ?? selectedPurchase.total_amount) || 0) * 100) / 100;
            if (amt > maxPay + capEps) {
                err.amount = `Το ποσό δεν μπορεί να υπερβαίνει το υπόλοιπο παραστατικού (${formatCurrency(maxPay)})`;
            }
        }
        setFormErrors(err);
        return { ok: Object.keys(err).length === 0, amt };
    };

    const handleSave = async () => {
        const { ok, amt } = validateForm();
        if (!ok) return;
        setDraftFooterAction("save");
        try {
            if (isNew) {
                const created = await createPayment.mutateAsync({
                    store_id: activeStore!.id,
                    purchase_id: Number(formPurchaseId),
                    amount: amt,
                    payment_method_id: formPaymentMethodId,
                    payment_date: formPaymentDate ? `${formPaymentDate}T12:00:00.000Z` : undefined,
                    notes: formNotes.trim() || null,
                });
                // After the backend creates the draft row we switch into edit mode
                // so subsequent Αποθήκευση / Οριστικοποίηση go through the PATCH path.
                setEditPayment(created);
                showToast({ message: "Η πληρωμή αποθηκεύτηκε", type: "success" });
                return;
            }
            if (!editPayment) return;
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
        } finally {
            setDraftFooterAction(null);
        }
    };

    const handleFinalize = async () => {
        const { ok, amt } = validateForm();
        if (!ok) return;
        setDraftFooterAction("finalize");
        try {
            // In "new" mode we need to POST first (there is no draft row yet),
            // then PATCH it to posted so the single finalize click behaves atomically
            // from the user's perspective.
            let target = editPayment;
            if (!target) {
                target = await createPayment.mutateAsync({
                    store_id: activeStore!.id,
                    purchase_id: Number(formPurchaseId),
                    amount: amt,
                    payment_method_id: formPaymentMethodId,
                    payment_date: formPaymentDate ? `${formPaymentDate}T12:00:00.000Z` : undefined,
                    notes: formNotes.trim() || null,
                });
            }
            const result = await updatePayment.mutateAsync({
                id: target.id,
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
        } finally {
            setDraftFooterAction(null);
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

    // Opens the popup in "new" mode without persisting anything. The draft row
    // is only inserted when the user clicks Αποθήκευση or Οριστικοποίηση (see
    // handleSave / handleFinalize), so closing the popup has no side effects.
    const handleNewPayment = () => {
        if (!activeStore?.id || purchasesWithBalance.length === 0) return;
        setEditPayment(null);
        populateForm(null);
        setPopupOpen(true);
    };

    // Opens the native date picker on the hidden <input type="date">. Falls
    // back to focusing it when the browser (older Firefox/Safari) doesn't
    // support HTMLInputElement.showPicker().
    const openDatePicker = (ref: React.RefObject<HTMLInputElement | null>) => {
        const el = ref.current;
        if (!el) return;
        try {
            if (typeof el.showPicker === "function") {
                el.showPicker();
                return;
            }
        } catch {
            // Some browsers throw if called outside a user gesture; swallow and focus instead.
        }
        el.focus();
        el.click();
    };

    const statusBadgeClass = (s: string) =>
        s === "draft" ? styles.statusDraft : s === "reversed" ? styles.statusReversed : styles.statusPosted;

    const footerLeft = deleteConfirmId != null
        ? { label: "Πίσω", onClick: () => setDeleteConfirmId(null), variant: "outline" as const }
        : { label: "Κλείσιμο", onClick: closePopup, variant: "outline" as const };

    const saveButtonLoading = draftFooterAction === "save";
    const finalizeButtonLoading = draftFooterAction === "finalize";

    const footerRight = deleteConfirmId != null
        ? { label: "Επιβεβαίωση Διαγραφής", onClick: handleDelete, variant: "danger" as const, loading: deletePayment.isPending }
        : (isDraft || isNew)
            ? {
                  label: "Οριστικοποίηση",
                  onClick: handleFinalize,
                  variant: "primary" as const,
                  loading: finalizeButtonLoading,
                  disabled: draftFooterAction === "save",
              }
            : isPosted
                ? { label: "Αντιλογισμός Συναλλαγής", onClick: handleReverse, variant: "outline" as const, loading: updatePayment.isPending }
                : undefined;

    const footerActions = (isDraft || isNew) && deleteConfirmId == null
        ? [
            {
                label: "Αποθήκευση",
                onClick: handleSave,
                variant: "outline" as const,
                loading: saveButtonLoading,
                disabled: draftFooterAction === "finalize",
            },
            // Διαγραφή is only meaningful once the row actually exists.
            ...(editPayment ? [{ label: "Διαγραφή", onClick: () => setDeleteConfirmId(editPayment.id), variant: "danger" as const }] : []),
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
                        <div className={styles.dateInputWrap} onClick={() => openDatePicker(dateFromRef)}>
                            <input
                                type="text"
                                className={styles.filterInput}
                                value={dateFrom ? formatDateDMY(dateFrom) : ""}
                                placeholder="Ημερομηνία από"
                                readOnly
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        openDatePicker(dateFromRef);
                                    }
                                }}
                            />
                            <input
                                ref={dateFromRef}
                                type="date"
                                className={styles.hiddenDateInput}
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                tabIndex={-1}
                                aria-hidden="true"
                            />
                            {dateFrom && (
                                <button
                                    type="button"
                                    className={styles.dateClearBtn}
                                    aria-label="Καθαρισμός ημερομηνίας"
                                    onClick={(e) => { e.stopPropagation(); setDateFrom(""); }}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Έως</label>
                        <div className={styles.dateInputWrap} onClick={() => openDatePicker(dateToRef)}>
                            <input
                                type="text"
                                className={styles.filterInput}
                                value={dateTo ? formatDateDMY(dateTo) : ""}
                                placeholder="Ημερομηνία έως"
                                readOnly
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        openDatePicker(dateToRef);
                                    }
                                }}
                            />
                            <input
                                ref={dateToRef}
                                type="date"
                                className={styles.hiddenDateInput}
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                tabIndex={-1}
                                aria-hidden="true"
                            />
                            {dateTo && (
                                <button
                                    type="button"
                                    className={styles.dateClearBtn}
                                    aria-label="Καθαρισμός ημερομηνίας"
                                    onClick={(e) => { e.stopPropagation(); setDateTo(""); }}
                                >
                                    ×
                                </button>
                            )}
                        </div>
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
                    <Button variant="primary" onClick={handleNewPayment} disabled={!activeStore?.id || purchasesWithBalance.length === 0}>
                        <Plus size={16} />
                        Νέα πληρωμή
                    </Button>
                </div>
            </div>

            <div className={styles.section}>
                {isLoading && payments.length === 0 ? (
                    <div className={styles.listLoading}><LoadingSpinner /></div>
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
                                    {paginatedPayments.length === 0 ? (
                                        <tr className={styles.tableEmptyRow}>
                                            <td colSpan={6}>
                                                <div className={styles.tableEmptyState}>
                                                    <div className={styles.tableEmptyIcon} aria-hidden>
                                                        <Banknote size={32} strokeWidth={1.35} />
                                                    </div>
                                                    <p className={styles.tableEmptyTitle}>Δεν υπάρχουν πληρωμές</p>
                                                    <p className={styles.tableEmptyHint}>
                                                        Ο κατάλογος είναι κενός ή δεν ταιριάζει με τα φίλτρα. Χρησιμοποιήστε «Νέα πληρωμή» όταν υπάρχει ανοιχτό υπόλοιπο αγοράς.
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedPayments.map((p: Payment) => (
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
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {payments.length > 0 && (
                        <div className={styles.pagination}>
                            <div className={styles.paginationInfo}>
                                Εμφάνιση <strong>{rangeStart}</strong>–<strong>{rangeEnd}</strong> από <strong>{payments.length}</strong>
                            </div>
                            <div className={styles.paginationControls}>
                                <label className={styles.pageSizeLabel}>
                                    Γραμμές
                                    <select
                                        className={styles.pageSizeSelect}
                                        value={pageSize}
                                        onChange={(e) => setPageSize(Number(e.target.value))}
                                    >
                                        {PAGE_SIZE_OPTIONS.map((n) => (
                                            <option key={n} value={n}>{n}</option>
                                        ))}
                                    </select>
                                </label>
                                <div className={styles.pageNav}>
                                    <button
                                        type="button"
                                        className={styles.pageBtn}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page <= 1}
                                        aria-label="Προηγούμενη σελίδα"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <span className={styles.pageIndicator}>
                                        Σελίδα <strong>{page}</strong> / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.pageBtn}
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={page >= totalPages}
                                        aria-label="Επόμενη σελίδα"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        )}
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
                {(editPayment || isNew) ? (
                    <div className={styles.slidingWrapper}>
                        <div
                            className={styles.slidingPanels}
                            style={{ transform: deleteConfirmId != null ? "translateX(-50%)" : undefined }}
                        >
                            <div className={styles.slidingPanel}>
                                {editPayment && (
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
                                )}
                                {/* Purchase picker: editable only in "new" mode. In edit/view modes
                                    we always surface the supplier and the linked invoice number. */}
                                {isNew ? (
                                    <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                                        <label className={styles.formLabel}>Σχετική αγορά *</label>
                                        <select
                                            className={styles.formSelect}
                                            value={formPurchaseId}
                                            onChange={(e) => handlePurchaseChange(e.target.value)}
                                        >
                                            <option value="">Επιλέξτε αγορά</option>
                                            {purchasesWithBalance.map((p) => {
                                                const label = [
                                                    p.invoice_number || `#${p.id}`,
                                                    p.vendor?.name,
                                                    `Υπόλοιπο: ${formatCurrency(p.amount_due ?? 0)}`,
                                                ].filter(Boolean).join(" — ");
                                                return (
                                                    <option key={p.id} value={String(p.id)}>{label}</option>
                                                );
                                            })}
                                        </select>
                                        {formErrors.purchase_id && <span className={styles.formError}>{formErrors.purchase_id}</span>}
                                    </div>
                                ) : null}

                                <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                                    <label className={styles.formLabel}>Προμηθευτής</label>
                                    <input
                                        type="text"
                                        className={`${styles.formInput} ${styles.formReadOnly}`}
                                        value={editPayment?.vendor_name || selectedPurchase?.vendor?.name || "—"}
                                        readOnly
                                    />
                                </div>

                                {!isNew && isDraft && editPayment && (
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
