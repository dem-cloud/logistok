import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useReceipts, type Receipt } from "@/hooks/useReceipts";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useSales } from "@/hooks/useSales";
import { useQueryClient } from "@tanstack/react-query";
import { axiosPrivate } from "@/api/axios";
import { Plus } from "lucide-react";
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

export default function Receipts() {
    const { activeStore, showToast } = useAuth();
    const queryClient = useQueryClient();
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("");

    const [showNewReceipt, setShowNewReceipt] = useState(false);
    const [newReceiptSaleId, setNewReceiptSaleId] = useState<string>("");
    const [newReceiptAmount, setNewReceiptAmount] = useState("");
    const [newReceiptPaymentMethodId, setNewReceiptPaymentMethodId] = useState("");
    const [newReceiptDate, setNewReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [newReceiptNotes, setNewReceiptNotes] = useState("");
    const [newReceiptErrors, setNewReceiptErrors] = useState<Record<string, string>>({});
    const [newReceiptSaving, setNewReceiptSaving] = useState(false);

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

    const { receipts, isLoading, isFetching, refetch: refetchReceipts } = useReceipts(filters);
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

    const totalAmount = receipts.reduce((sum, r) => sum + (r.amount ?? 0), 0);

    const handleOpenNewReceipt = () => {
        setNewReceiptSaleId("");
        setNewReceiptAmount("");
        setNewReceiptPaymentMethodId(paymentMethods.find((pm) => pm.is_active)?.id ?? "");
        setNewReceiptDate(new Date().toISOString().slice(0, 10));
        setNewReceiptNotes("");
        setNewReceiptErrors({});
        setShowNewReceipt(true);
    };

    const handleSubmitNewReceipt = async () => {
        if (!activeStore?.id) return;
        const err: Record<string, string> = {};
        if (!newReceiptSaleId) err.sale_id = "Επιλέξτε τιμολόγιο";
        const amt = parseFloat(newReceiptAmount) || 0;
        if (amt <= 0) err.amount = "Το ποσό πρέπει να είναι θετικό";
        if (!newReceiptPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        const sale = salesWithBalance.find((s) => String(s.id) === newReceiptSaleId);
        if (sale && amt > (sale.amount_due ?? 0)) err.amount = `Μέγιστο ποσό: ${(sale.amount_due ?? 0).toFixed(2)} €`;
        setNewReceiptErrors(err);
        if (Object.keys(err).length > 0) return;

        setNewReceiptSaving(true);
        try {
            await axiosPrivate.post("/api/shared/company/receipts", {
                store_id: activeStore.id,
                sale_id: parseInt(newReceiptSaleId, 10),
                amount: amt,
                payment_method_id: newReceiptPaymentMethodId,
                payment_date: newReceiptDate ? `${newReceiptDate}T12:00:00.000Z` : undefined,
                notes: newReceiptNotes.trim() || null,
            });
            showToast({ message: "Η εισπραξη καταχωρήθηκε επιτυχώς", type: "success" });
            queryClient.invalidateQueries({ queryKey: ["receipts"] });
            refetchReceipts();
            setShowNewReceipt(false);
        } catch (e: unknown) {
            const ax = e as { response?: { data?: { message?: string } } };
            showToast({ message: ax.response?.data?.message || "Σφάλμα", type: "error" });
        } finally {
            setNewReceiptSaving(false);
        }
    };

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
                    <Button variant="primary" onClick={handleOpenNewReceipt} disabled={!activeStore?.id}>
                        <Plus size={16} />
                        Νέα εισπραξη
                    </Button>
                </div>
            </div>

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Λίστα εισπράξεων</h3>
                {isLoading && receipts.length === 0 ? (
                    <div className={styles.listLoading}>
                        <LoadingSpinner />
                    </div>
                ) : receipts.length === 0 ? (
                    <p className={styles.sectionHint}>
                        Δεν βρέθηκαν εισπράξεις για τα επιλεγμένα κριτήρια.
                    </p>
                ) : (
                    <div className={styles.listWrapper}>
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Ημερομηνία</th>
                                        <th>Πελάτης</th>
                                        <th>Τιμολόγιο</th>
                                        <th>Τρόπος</th>
                                        <th className={styles.amountCol}>Ποσό</th>
                                        <th>Είδος</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {receipts.map((r: Receipt) => (
                                        <tr key={r.id}>
                                            <td>{formatDate(r.payment_date)}</td>
                                            <td>{r.customer_name ?? "—"}</td>
                                            <td>{r.invoice_number ?? "—"}</td>
                                            <td>{r.payment_method_name ?? "—"}</td>
                                            <td className={styles.amountCol}>{formatCurrency(r.amount)}</td>
                                            <td>
                                                {r.is_auto ? (
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
                isOpen={showNewReceipt}
                onClose={() => setShowNewReceipt(false)}
                title="Νέα εισπραξη"
                width="480px"
                footerLeftButton={{ label: "Κλείσιμο", onClick: () => setShowNewReceipt(false), variant: "outline" }}
                footerRightButton={{
                    label: "Αποθήκευση",
                    onClick: handleSubmitNewReceipt,
                    variant: "primary",
                    loading: newReceiptSaving,
                    disabled: salesWithBalance.length === 0,
                }}
            >
                {salesWithBalance.length === 0 ? (
                    <p className={styles.sectionHint}>
                        Δεν υπάρχουν τιμολόγια με υπόλοιπο για καταχώρηση εισπράξεων. Δημιουργήστε πρώτα ολοκληρωμένο τιμολόγιο στην ενότητα Πωλήσεις.
                    </p>
                ) : (
                <>
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Τιμολόγιο *</label>
                    <select
                        className={styles.formSelect}
                        value={newReceiptSaleId}
                        onChange={(e) => {
                            setNewReceiptSaleId(e.target.value);
                            const sale = salesWithBalance.find((s) => String(s.id) === e.target.value);
                            setNewReceiptAmount(sale ? String(sale.amount_due ?? "") : "");
                            setNewReceiptErrors((prev) => ({ ...prev, sale_id: "" }));
                        }}
                    >
                        <option value="">Επιλέξτε τιμολόγιο</option>
                        {salesWithBalance.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.invoice_number ?? `#${s.id}`} — {s.customer?.full_name ?? "Περαστικός"} (Υπόλοιπο: {formatCurrency(s.amount_due ?? 0)})
                            </option>
                        ))}
                    </select>
                    {newReceiptErrors.sale_id && <span className={styles.formError}>{newReceiptErrors.sale_id}</span>}
                </div>
                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                    <label className={styles.formLabel}>Ποσό *</label>
                    <input
                        type="number"
                        className={styles.formInput}
                        min={0}
                        step={0.01}
                        value={newReceiptAmount}
                        onChange={(e) => {
                            setNewReceiptAmount(e.target.value);
                            setNewReceiptErrors((prev) => ({ ...prev, amount: "" }));
                        }}
                        placeholder="0.00"
                    />
                    {newReceiptErrors.amount && <span className={styles.formError}>{newReceiptErrors.amount}</span>}
                </div>
                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                    <label className={styles.formLabel}>Τρόπος πληρωμής *</label>
                    <select
                        className={styles.formSelect}
                        value={newReceiptPaymentMethodId}
                        onChange={(e) => {
                            setNewReceiptPaymentMethodId(e.target.value);
                            setNewReceiptErrors((prev) => ({ ...prev, payment_method_id: "" }));
                        }}
                    >
                        <option value="">Επιλέξτε</option>
                        {paymentMethods.filter((pm) => pm.is_active).map((pm) => (
                            <option key={pm.id} value={pm.id}>{pm.name}</option>
                        ))}
                    </select>
                    {newReceiptErrors.payment_method_id && <span className={styles.formError}>{newReceiptErrors.payment_method_id}</span>}
                </div>
                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                    <label className={styles.formLabel}>Ημερομηνία</label>
                    <input
                        type="date"
                        className={styles.formInput}
                        value={newReceiptDate}
                        onChange={(e) => setNewReceiptDate(e.target.value)}
                    />
                </div>
                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                    <label className={styles.formLabel}>Σημειώσεις</label>
                    <input
                        type="text"
                        className={styles.formInput}
                        value={newReceiptNotes}
                        onChange={(e) => setNewReceiptNotes(e.target.value)}
                        placeholder="Προαιρετικό"
                    />
                </div>
                </>
                )}
            </SidePopup>
        </div>
    );
}
