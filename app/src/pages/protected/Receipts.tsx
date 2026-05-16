import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useReceipts, type Receipt } from "@/hooks/useReceipts";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useSales, type Sale } from "@/hooks/useSales";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Info, ChevronLeft, ChevronRight, Receipt as ReceiptIcon } from "lucide-react";
import { axiosPrivate } from "@/api/axios";
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

export default function Receipts() {
    const { activeStore, activeCompany, showToast } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    // Hidden native <input type="date"> refs — see openDatePicker below.
    const dateFromRef = useRef<HTMLInputElement | null>(null);
    const dateToRef = useRef<HTMLInputElement | null>(null);
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(20);

    const [editReceipt, setEditReceipt] = useState<Receipt | null>(null);
    const [popupOpen, setPopupOpen] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    const [formAmount, setFormAmount] = useState("");
    const [formPaymentMethodId, setFormPaymentMethodId] = useState("");
    const [formPaymentDate, setFormPaymentDate] = useState("");
    const [formNotes, setFormNotes] = useState("");
    // In "new receipt" mode the user picks which sales invoice this receipt
    // belongs to. Kept as a string because <select value> is string-typed.
    const [formSaleId, setFormSaleId] = useState<string>("");
    /** Ignores stale responses if the user switches invoices quickly. */
    const salePickSeq = useRef(0);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    /** Which draft popup footer action is in flight (save vs finalize use the same mutations). */
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

    const { receipts, isLoading, isFetching, createReceipt, updateReceipt, deleteReceipt } = useReceipts(filters);
    const { paymentMethods } = usePaymentMethods();
    const { sales } = useSales({
        storeId: storeId || undefined,
        status: "completed",
        documentType: "INV",
    });

    // Sales invoices eligible for a manual receipt: completed INVs that still
    // have a remaining balance (amount_due > 0).
    const salesWithBalance = useMemo(
        () => sales.filter((s) => ((s.invoice_type || "").toUpperCase() === "INV") && ((s.amount_due ?? 0) > 0)),
        [sales]
    );

    // The sales list query is cached; after a receipt posts, `amount_due` in
    // that cache can lag. Load the selected invoice by id so the amount field
    // defaults to the current open balance (e.g. 1.47 after a 2 € receipt on 3.47).
    const handleSaleInvoiceChange = useCallback(
        (newId: string) => {
            setFormSaleId(newId);
            setFormErrors((prev) => ({ ...prev, sale_id: "" }));
            if (!newId.trim()) {
                setFormAmount("");
                return;
            }
            const seq = ++salePickSeq.current;
            void (async () => {
                try {
                    const res = await axiosPrivate.get(`/api/shared/company/sales/${newId}`);
                    if (seq !== salePickSeq.current) return;
                    if (!res.data?.success || !res.data.data) return;
                    const fresh = res.data.data as Sale;
                    const due = Math.round((Number(fresh.amount_due ?? fresh.total_amount) || 0) * 100) / 100;
                    setFormAmount(String(due));
                    if (activeCompany?.id) {
                        queryClient.invalidateQueries({ queryKey: ["sales", activeCompany.id] });
                    }
                } catch {
                    if (seq !== salePickSeq.current) return;
                    const picked = salesWithBalance.find((s) => String(s.id) === newId);
                    setFormAmount(picked ? String(picked.amount_due ?? picked.total_amount ?? "") : "");
                }
            })();
        },
        [activeCompany?.id, queryClient, salesWithBalance]
    );

    const totalAmount = receipts
        .filter((r) => r.status === "posted")
        .reduce((sum, r) => sum + (r.amount ?? 0), 0);

    // Client-side pagination — resets on filter/page-size change and clamps
    // back to the last valid page when the data set shrinks.
    const totalPages = Math.max(1, Math.ceil(receipts.length / pageSize));
    useEffect(() => {
        setPage(1);
    }, [dateFrom, dateTo, paymentMethodFilter, storeId, pageSize]);
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);
    const paginatedReceipts = useMemo(
        () => receipts.slice((page - 1) * pageSize, page * pageSize),
        [receipts, page, pageSize]
    );
    const rangeStart = receipts.length === 0 ? 0 : (page - 1) * pageSize + 1;
    const rangeEnd = Math.min(page * pageSize, receipts.length);

    const populateForm = useCallback((r: Receipt | null) => {
        if (r) {
            setFormAmount(String(r.amount ?? ""));
            setFormPaymentMethodId(r.payment_method_id ?? "");
            setFormPaymentDate(r.payment_date ? new Date(r.payment_date).toISOString().slice(0, 10) : "");
            setFormNotes(r.notes ?? "");
            setFormSaleId(r.sale_id != null ? String(r.sale_id) : "");
        } else {
            setFormAmount("");
            setFormPaymentMethodId(paymentMethods.find((pm) => pm.is_active)?.id ?? "");
            setFormPaymentDate(new Date().toISOString().slice(0, 10));
            setFormNotes("");
            setFormSaleId("");
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
        if (!openId) return;
        if (isLoading || isFetching) return;
        const found = receipts.find((r) => String(r.id) === openId);
        if (found) {
            openReceipt(found);
            const params = new URLSearchParams(searchParams);
            params.delete("open");
            setSearchParams(params, { replace: true });
        }
    }, [searchParams, receipts, isLoading, isFetching, openReceipt, setSearchParams]);

    // isNew: popup is opened for a brand-new receipt not yet persisted. We
    // don't insert anything server-side until the user clicks Αποθήκευση or
    // Οριστικοποίηση, so closing the popup discards nothing.
    const isNew = editReceipt == null;
    const isDraft = (editReceipt?.status || "posted") === "draft";
    const isPosted = (editReceipt?.status || "posted") === "posted";
    const isReadOnly = !(isDraft || isNew);

    const selectedSale = useMemo(() => {
        const idStr = isNew
            ? formSaleId
            : (editReceipt?.sale_id != null ? String(editReceipt.sale_id) : "");
        if (!idStr) return null;
        return sales.find((s) => String(s.id) === idStr) ?? null;
    }, [isNew, formSaleId, editReceipt, sales]);

    // A receipt may be linked to a CN (supplier refund) when it was opened
    // from the Πιστωτικό Αγοράς "Καταχώρηση Είσπραξης" button. In that case
    // we present the supplier + CN number instead of the customer + INV.
    const isPurchaseReceipt = !isNew && !!editReceipt?.purchase_id;

    const validateForm = (): { ok: boolean; amt: number } => {
        const err: Record<string, string> = {};
        const amt = parseFloat(formAmount) || 0;
        const capEps = 1e-6;
        if (isNew && !formSaleId) err.sale_id = "Επιλέξτε τιμολόγιο";
        if (amt <= 0) err.amount = "Το ποσό πρέπει να είναι θετικό";
        if (!formPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        if (amt > 0 && selectedSale && (isNew ? !!formSaleId : !!editReceipt?.sale_id)) {
            const maxSale =
                Math.round((Number(selectedSale.amount_due ?? selectedSale.total_amount) || 0) * 100) / 100;
            if (amt > maxSale + capEps) {
                err.amount = `Το ποσό δεν μπορεί να υπερβαίνει το υπόλοιπο τιμολογίου (${formatCurrency(maxSale)})`;
            }
        }
        if (
            amt > 0 &&
            !isNew &&
            editReceipt?.purchase_id != null &&
            editReceipt.cn_refund_remaining != null &&
            Number.isFinite(editReceipt.cn_refund_remaining)
        ) {
            const maxCn = Math.round(Number(editReceipt.cn_refund_remaining) * 100) / 100;
            if (amt > maxCn + capEps) {
                err.amount = `Το ποσό δεν μπορεί να υπερβαίνει το διαθέσιμο υπόλοιπο είσπραξης (${formatCurrency(maxCn)})`;
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
                const created = await createReceipt.mutateAsync({
                    store_id: activeStore!.id,
                    sale_id: Number(formSaleId),
                    amount: amt,
                    payment_method_id: formPaymentMethodId,
                    payment_date: formPaymentDate ? `${formPaymentDate}T12:00:00.000Z` : undefined,
                    notes: formNotes.trim() || null,
                });
                setEditReceipt(created);
                showToast({ message: "Η είσπραξη αποθηκεύτηκε", type: "success" });
                return;
            }
            if (!editReceipt) return;
            const result = await updateReceipt.mutateAsync({
                id: editReceipt.id,
                amount: amt,
                payment_method_id: formPaymentMethodId,
                payment_date: formPaymentDate ? `${formPaymentDate}T12:00:00.000Z` : undefined,
                notes: formNotes.trim() || null,
            });
            setEditReceipt((prev) =>
                prev?.purchase_id === result.purchase_id &&
                prev?.id === result.id &&
                prev.cn_refund_remaining != null &&
                Number.isFinite(prev.cn_refund_remaining)
                    ? { ...result, cn_refund_remaining: prev.cn_refund_remaining }
                    : result
            );
            showToast({ message: "Η είσπραξη αποθηκεύτηκε", type: "success" });
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
            let target = editReceipt;
            if (!target) {
                target = await createReceipt.mutateAsync({
                    store_id: activeStore!.id,
                    sale_id: Number(formSaleId),
                    amount: amt,
                    payment_method_id: formPaymentMethodId,
                    payment_date: formPaymentDate ? `${formPaymentDate}T12:00:00.000Z` : undefined,
                    notes: formNotes.trim() || null,
                });
            }
            const result = await updateReceipt.mutateAsync({
                id: target.id,
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
        } finally {
            setDraftFooterAction(null);
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

    const handleDownloadPdf = useCallback(async () => {
        if (!editReceipt) return;
        setPdfLoading(true);
        try {
            const res = await axiosPrivate.get(`/api/shared/company/receipts/${editReceipt.id}/pdf`, {
                responseType: "blob",
            });
            const blob = res.data as Blob;
            const filename = `eispraxi-REC-${String(editReceipt.id).padStart(4, "0")}.pdf`;
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
    }, [editReceipt, showToast]);

    // Opens the popup in "new" mode without persisting anything — the draft
    // row is only inserted when the user clicks Αποθήκευση or Οριστικοποίηση.
    // We keep the button enabled even when no invoices are available so the
    // user can see the explanatory hint inside the popup (instead of silently
    // disabling the whole action).
    const handleNewReceipt = () => {
        if (!activeStore?.id) return;
        setEditReceipt(null);
        populateForm(null);
        setPopupOpen(true);
    };

    // Opens the native date picker on the hidden <input type="date">. Falls
    // back to focusing it when the browser doesn't support showPicker().
    const openDatePicker = (ref: React.RefObject<HTMLInputElement | null>) => {
        const el = ref.current;
        if (!el) return;
        try {
            if (typeof el.showPicker === "function") {
                el.showPicker();
                return;
            }
        } catch {
            // Some browsers throw when called outside a user gesture.
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
        ? { label: "Επιβεβαίωση Διαγραφής", onClick: handleDelete, variant: "danger" as const, loading: deleteReceipt.isPending }
        : (isDraft || isNew)
            ? {
                  label: "Οριστικοποίηση",
                  onClick: handleFinalize,
                  variant: "primary" as const,
                  loading: finalizeButtonLoading,
                  disabled: draftFooterAction === "save",
              }
            : isPosted
                ? { label: "Αντιλογισμός Συναλλαγής", onClick: handleReverse, variant: "outline" as const, loading: updateReceipt.isPending }
                : undefined;

    // Footer actions differ per state:
    //   draft/new: Αποθήκευση + (Διαγραφή when a draft row already exists)
    //   posted/reversed: Λήψη PDF — the only meaningful extra action
    const footerActions = deleteConfirmId != null
        ? undefined
        : (isDraft || isNew)
            ? [
                {
                    label: "Αποθήκευση",
                    onClick: handleSave,
                    variant: "outline" as const,
                    loading: saveButtonLoading,
                    disabled: draftFooterAction === "finalize",
                },
                ...(editReceipt ? [{ label: "Διαγραφή", onClick: () => setDeleteConfirmId(editReceipt.id), variant: "danger" as const }] : []),
              ]
            : editReceipt && (isPosted || editReceipt.status === "reversed")
                ? [{ label: "Λήψη PDF", onClick: handleDownloadPdf, variant: "outline" as const, loading: pdfLoading }]
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
                <p className={styles.subtitle}>Ιστορικό εισπράξεων από πωλήσεις και επιστροφές προμηθευτών</p>
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
                    <Button variant="primary" onClick={handleNewReceipt} disabled={!activeStore?.id}>
                        <Plus size={16} />
                        Νέα είσπραξη
                    </Button>
                </div>
            </div>

            <div className={styles.section}>
                {isLoading && receipts.length === 0 ? (
                    <div className={styles.listLoading}><LoadingSpinner /></div>
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
                                        <th>Πελάτης / Προμηθευτής</th>
                                        <th>Έγγραφο</th>
                                        <th>Τρόπος</th>
                                        <th className={styles.amountCol}>Ποσό</th>
                                        <th>Κατάσταση</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedReceipts.length === 0 ? (
                                        <tr className={styles.tableEmptyRow}>
                                            <td colSpan={6}>
                                                <div className={styles.tableEmptyState}>
                                                    <div className={styles.tableEmptyIcon} aria-hidden>
                                                        <ReceiptIcon size={32} strokeWidth={1.35} />
                                                    </div>
                                                    <p className={styles.tableEmptyTitle}>Δεν υπάρχουν εισπράξεις</p>
                                                    <p className={styles.tableEmptyHint}>
                                                        Ο κατάλογος είναι κενός ή δεν ταιριάζει με τα φίλτρα. Χρησιμοποιήστε «Νέα είσπραξη» για να καταχωρήσετε είσπραξη.
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedReceipts.map((r: Receipt) => (
                                            <tr key={r.id} onClick={() => openReceipt(r)}>
                                                <td>{formatDate(r.payment_date)}</td>
                                                <td>{r.customer_name ?? r.vendor_name ?? "—"}</td>
                                                <td>{r.invoice_number ?? "—"}</td>
                                                <td>{r.payment_method_name ?? "—"}</td>
                                                <td className={styles.amountCol}>{formatCurrency(r.amount)}</td>
                                                <td>
                                                    <span className={`${styles.statusBadge} ${statusBadgeClass(r.status)}`}>
                                                        {STATUS_LABELS[r.status] || r.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {receipts.length > 0 && (
                        <div className={styles.pagination}>
                            <div className={styles.paginationInfo}>
                                Εμφάνιση <strong>{rangeStart}</strong>–<strong>{rangeEnd}</strong> από <strong>{receipts.length}</strong>
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
                        ? "Διαγραφή είσπραξης"
                        : editReceipt
                            ? isDraft ? "Επεξεργασία είσπραξης" : "Είσπραξη"
                            : "Νέα είσπραξη"
                }
                width="560px"
                footerLeftButton={footerLeft}
                footerRightButton={footerRight}
                footerActions={footerActions}
            >
                {(editReceipt || isNew) ? (
                    <div className={styles.slidingWrapper}>
                        <div
                            className={styles.slidingPanels}
                            style={{ transform: deleteConfirmId != null ? "translateX(-50%)" : undefined }}
                        >
                            <div className={styles.slidingPanel}>
                                {editReceipt && (
                                    <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                                        <span className={`${styles.statusBadge} ${statusBadgeClass(editReceipt.status)}`}>
                                            {STATUS_LABELS[editReceipt.status] || editReceipt.status}
                                        </span>
                                        {editReceipt.invoice_number && (editReceipt.sale_id || editReceipt.purchase_id) && (
                                            <span
                                                className={styles.relatedDocLink}
                                                onClick={() => {
                                                    if (editReceipt.sale_id) {
                                                        closePopup();
                                                        navigate("/sales");
                                                    } else if (editReceipt.purchase_id) {
                                                        closePopup();
                                                        navigate("/purchases", { state: { openPurchaseId: editReceipt.purchase_id } });
                                                    }
                                                }}
                                            >
                                                {editReceipt.invoice_number}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Invoice picker: only in "new" mode. In edit/view we always
                                    show the linked customer and the invoice number. Purchase-
                                    linked receipts cannot be created from this picker — they
                                    are only produced via the CN button flow. */}
                                {isNew ? (
                                    <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                                        <label className={styles.formLabel}>Σχετικό τιμολόγιο *</label>
                                        {salesWithBalance.length === 0 ? (
                                            <div className={styles.sectionHint} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                                                <Info size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                                                <span>
                                                    Δεν υπάρχουν τιμολόγια πώλησης με ανοιχτό υπόλοιπο. Οριστικοποιήστε πρώτα ένα τιμολόγιο ή καταχωρήστε Είσπραξη από πιστωτικό αγοράς.
                                                </span>
                                            </div>
                                        ) : (
                                            <>
                                                <select
                                                    className={styles.formSelect}
                                                    value={formSaleId}
                                                    onChange={(e) => handleSaleInvoiceChange(e.target.value)}
                                                >
                                                    <option value="">Επιλέξτε τιμολόγιο</option>
                                                    {salesWithBalance.map((s) => {
                                                        const label = [
                                                            s.invoice_number || `#${s.id}`,
                                                            s.customer?.full_name,
                                                            `Υπόλοιπο: ${formatCurrency(s.amount_due ?? 0)}`,
                                                        ].filter(Boolean).join(" — ");
                                                        return (
                                                            <option key={s.id} value={String(s.id)}>{label}</option>
                                                        );
                                                    })}
                                                </select>
                                                {formErrors.sale_id && <span className={styles.formError}>{formErrors.sale_id}</span>}
                                            </>
                                        )}
                                    </div>
                                ) : null}

                                <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                                    <label className={styles.formLabel}>
                                        {isPurchaseReceipt ? "Προμηθευτής" : "Πελάτης"}
                                    </label>
                                    <input
                                        type="text"
                                        className={`${styles.formInput} ${styles.formReadOnly}`}
                                        value={
                                            isPurchaseReceipt
                                                ? (editReceipt?.vendor_name || "—")
                                                : (editReceipt?.customer_name || selectedSale?.customer?.full_name || "—")
                                        }
                                        readOnly
                                    />
                                </div>

                                {!isNew && isDraft && editReceipt && (
                                    <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                                        <label className={styles.formLabel}>
                                            {isPurchaseReceipt ? "Σχετικό πιστωτικό" : "Σχετικό τιμολόγιο"}
                                        </label>
                                        <input
                                            type="text"
                                            className={`${styles.formInput} ${styles.formReadOnly}`}
                                            value={
                                                editReceipt.invoice_number
                                                || (editReceipt.sale_id ? `#${editReceipt.sale_id}` : `#${editReceipt.purchase_id}`)
                                            }
                                            readOnly
                                        />
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
                                    Θέλετε σίγουρα να διαγράψετε αυτή την είσπραξη;
                                </p>
                            </div>
                        </div>
                    </div>
                ) : null}
            </SidePopup>
        </div>
    );
}
