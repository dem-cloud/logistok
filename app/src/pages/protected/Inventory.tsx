import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, ArrowRightLeft, Search, ClipboardList, Trash2 } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/contexts/AuthContext";
import {
    useStoreProducts,
    useStockMovements,
    useInventoryMutations,
    useStockCount,
    type StoreProduct,
    type AdjustParams,
    type TransferLine,
} from "@/hooks/useInventory";
import { useProducts, type ProductVariant } from "@/hooks/useProducts";
import SidePopup from "@/components/reusable/SidePopup";
import Button from "@/components/reusable/Button";
import LoadingSpinner from "@/components/LoadingSpinner";
import styles from "./Inventory.module.css";

const LOW_STOCK_THRESHOLD = 5;

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
    in: "Είσοδος",
    out: "Έξοδος",
    adjustment: "Προσαρμογή",
    sale: "Πώληση",
    purchase: "Αγορά",
    transfer: "Μεταφορά",
    transfer_in: "Μεταφορά (είσοδος)",
    transfer_out: "Μεταφορά (έξοδος)",
    refund: "Επιστροφή",
    return: "Επιστροφή",
};

const SOURCE_LABELS: Record<string, string> = {
    manual: "Χειροκίνητη",
    sale: "Πώληση",
    purchase: "Αγορά",
    sale_reversal: "Αντιστροφή πώλησης",
    transfer: "Μεταφορά",
    adjustment: "Προσαρμογή",
    stock_count: "Απογραφή",
};

function renderRelatedDocument(
    docType: string | null,
    docId: string | number | null,
    docLinkClass: string
) {
    const id = docId != null ? String(docId) : null;
    if (docType === "purchase" && id) {
        return (
            <Link to="/purchases" state={{ openPurchaseId: Number(id) }} className={docLinkClass}>
                Αγορά #{id}
            </Link>
        );
    }
    if (docType === "sale" && id) {
        return (
            <Link to="/sales" state={{ openSaleId: Number(id) }} className={docLinkClass}>
                Πώληση #{id}
            </Link>
        );
    }
    if (docType === "transfer") {
        return id ? `Μεταφορά #${id}` : "Μεταφορά";
    }
    if (docType === "adjustment" || docType == null) {
        return "Χειροκίνητη Προσαρμογή";
    }
    return id ? `${docType} #${id}` : docType;
}

type ProductVariantOption = {
    product_id: number;
    product_variant_id: number;
    productName: string;
    variantName: string;
    sku: string | null;
    label: string;
};

function buildProductVariantOptions(
    products: { id: number; name: string; variants: ProductVariant[] }[]
): ProductVariantOption[] {
    const out: ProductVariantOption[] = [];
    for (const p of products) {
        for (const v of p.variants) {
            out.push({
                product_id: p.id,
                product_variant_id: v.id,
                productName: p.name,
                variantName: v.name,
                sku: v.sku,
                label: v.sku ? `${p.name} — ${v.name} (${v.sku})` : `${p.name} — ${v.name}`,
            });
        }
    }
    return out;
}

function filterProductVariantOptions(
    options: ProductVariantOption[],
    search: string
): ProductVariantOption[] {
    if (!search.trim()) return options;
    const term = search.trim().toLowerCase();
    return options.filter(
        (o) =>
            o.productName.toLowerCase().includes(term) ||
            o.variantName.toLowerCase().includes(term) ||
            (o.sku?.toLowerCase().includes(term) ?? false) ||
            o.label.toLowerCase().includes(term)
    );
}

function formatDate(iso: string | null) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("el-GR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
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

type Tab = "stock" | "movements";

export default function Inventory() {
    const { activeStore, activeCompany, showToast } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>("stock");
    const [searchFilter, setSearchFilter] = useState("");
    const searchDebounced = useDebounce(searchFilter.trim(), 300);
    const [adjustPopupOpen, setAdjustPopupOpen] = useState(false);
    const [editingPriceRow, setEditingPriceRow] = useState<StoreProduct | null>(null);
    const [editingPriceValue, setEditingPriceValue] = useState("");
    const priceInputRef = useRef<HTMLInputElement>(null);

    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [movementTypeFilter, setMovementTypeFilter] = useState("");

    const { storeProducts, isLoading: storeProductsLoading, isFetching: storeProductsFetching } = useStoreProducts({
        storeId: activeStore?.id ?? undefined,
        search: searchDebounced || undefined,
    });

    const { movements, isLoading: movementsLoading, isFetching: movementsFetching } = useStockMovements(
        activeStore?.id ?? undefined,
        {
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            movementType: movementTypeFilter || undefined,
        }
    );

    const { products } = useProducts();
    const mutations = useInventoryMutations();

    const [adjProductId, setAdjProductId] = useState<number | "">("");
    const [adjVariantId, setAdjVariantId] = useState<number | "">("");
    const [adjSearchQuery, setAdjSearchQuery] = useState("");
    const [adjSearchFocused, setAdjSearchFocused] = useState(false);
    const [adjPhysicalQuantity, setAdjPhysicalQuantity] = useState("");
    const [adjErrors, setAdjErrors] = useState<Record<string, string>>({});

    const [adjNegativeStockConfirm, setAdjNegativeStockConfirm] = useState<
        Array<{ product_name: string; variant_name: string; required: number; available: number }> | null
    >(null);
    // Ενδοδιακίνηση (multi-line transfer)
    const [endoSourceStoreId, setEndoSourceStoreId] = useState<string>("");
    const [endoDestStoreId, setEndoDestStoreId] = useState<string>("");
    type EndoLine = { id: string; product_id: number; product_variant_id: number; quantity: string; label: string };
    const [endoLines, setEndoLines] = useState<EndoLine[]>([]);
    const [endoLineSearchQuery, setEndoLineSearchQuery] = useState("");
    const [endoLineSearchFocused, setEndoLineSearchFocused] = useState(false);
    const [endoPopupOpen, setEndoPopupOpen] = useState(false);
    const [endoErrors, setEndoErrors] = useState<Record<string, string>>({});

    // Απογραφή (Stock Count)
    const [stockCountPopupOpen, setStockCountPopupOpen] = useState(false);
    const [stockCountSessionId, setStockCountSessionId] = useState<number | null>(null);
    const [stockCountDraft, setStockCountDraft] = useState<Record<number, number | null>>({});

    const productVariantOptions = useMemo(() => buildProductVariantOptions(products), [products]);
    const adjSearchResults = useMemo(
        () => filterProductVariantOptions(productVariantOptions, adjSearchQuery),
        [productVariantOptions, adjSearchQuery]
    );
    const adjSelectedLabel = useMemo(() => {
        if (adjProductId === "" || adjVariantId === "") return "";
        const o = productVariantOptions.find(
            (x) => x.product_id === adjProductId && x.product_variant_id === adjVariantId
        );
        return o?.label ?? "";
    }, [productVariantOptions, adjProductId, adjVariantId]);

    const resetAdjustForm = useCallback(() => {
        setAdjProductId("");
        setAdjVariantId("");
        setAdjSearchQuery("");
        setAdjPhysicalQuantity("");
        setAdjErrors({});
    }, []);

    const openAdjust = useCallback(() => {
        resetAdjustForm();
        setAdjustPopupOpen(true);
    }, [resetAdjustForm]);

    const closeAdjust = useCallback(() => {
        setAdjustPopupOpen(false);
        setAdjNegativeStockConfirm(null);
        resetAdjustForm();
    }, [resetAdjustForm]);

    const allStores = activeCompany?.stores ?? [];
    const openEndo = useCallback(() => {
        setEndoSourceStoreId(activeStore?.id ?? "");
        setEndoDestStoreId(allStores.find((s) => s.id !== activeStore?.id)?.id ?? "");
        setEndoLines([]);
        setEndoLineSearchQuery("");
        setEndoErrors({});
        setEndoPopupOpen(true);
    }, [activeStore?.id, allStores]);

    const closeEndo = useCallback(() => {
        setEndoPopupOpen(false);
    }, []);

    const addEndoLine = useCallback(
        (o: ProductVariantOption) => {
            const existing = endoLines.find(
                (l) => l.product_id === o.product_id && l.product_variant_id === o.product_variant_id
            );
            if (existing) return;
            setEndoLines((prev) => [
                ...prev,
                {
                    id: `line-${Date.now()}`,
                    product_id: o.product_id,
                    product_variant_id: o.product_variant_id,
                    quantity: "1",
                    label: o.label,
                },
            ]);
            setEndoLineSearchQuery("");
            setEndoLineSearchFocused(false);
        },
        [endoLines]
    );

    const removeEndoLine = useCallback((id: string) => {
        setEndoLines((prev) => prev.filter((l) => l.id !== id));
    }, []);

    const updateEndoLineQty = useCallback((id: string, qty: string) => {
        setEndoLines((prev) => prev.map((l) => (l.id === id ? { ...l, quantity: qty } : l)));
    }, []);

    const endoSearchResults = useMemo(
        () => filterProductVariantOptions(productVariantOptions, endoLineSearchQuery),
        [productVariantOptions, endoLineSearchQuery]
    );

    const openStockCount = useCallback(() => {
        setStockCountSessionId(null);
        setStockCountPopupOpen(true);
    }, []);

    const closeStockCount = useCallback(() => {
        setStockCountPopupOpen(false);
        setStockCountSessionId(null);
        setStockCountDraft({});
    }, []);

    const startStockCount = useCallback(async () => {
        if (!activeStore?.id) return;
        try {
            const session = await mutations.createStockCount.mutateAsync(activeStore.id);
            setStockCountSessionId(session.id);
            showToast({ message: "Η απογραφή ξεκίνησε", type: "success" });
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    }, [activeStore?.id, mutations, showToast]);

    const { session: stockCountSession } = useStockCount(stockCountSessionId);

    const handleEndoSubmit = useCallback(async () => {
        const err: Record<string, string> = {};
        if (!endoSourceStoreId || !endoDestStoreId) err.stores = "Επιλέξτε προέλευση και προορισμό";
        if (endoSourceStoreId === endoDestStoreId) err.stores = "Προέλευση και προορισμός πρέπει να διαφέρουν";
        if (endoLines.length === 0) err.lines = "Προσθέστε τουλάχιστον μία γραμμή";
        const validLines: TransferLine[] = [];
        for (const l of endoLines) {
            const q = Number(l.quantity);
            if (isNaN(q) || q <= 0) {
                err.lines = err.lines || "Όλες οι ποσότητες πρέπει να είναι θετικές";
                break;
            }
            validLines.push({
                product_id: l.product_id,
                product_variant_id: l.product_variant_id,
                quantity: q,
            });
        }
        setEndoErrors(err);
        if (Object.keys(err).length > 0) return;

        try {
            await mutations.createTransfer.mutateAsync({
                source_store_id: endoSourceStoreId,
                dest_store_id: endoDestStoreId,
                lines: validLines,
                status: "posted",
            });
            showToast({ message: "Η ενδοδιακίνηση ολοκληρώθηκε", type: "success" });
            closeEndo();
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : "Σφάλμα";
            showToast({ message: errMsg, type: "error" });
        }
    }, [
        endoSourceStoreId,
        endoDestStoreId,
        endoLines,
        mutations.createTransfer,
        closeEndo,
        showToast,
    ]);

    const handleStockCountFinalize = useCallback(async () => {
        if (!stockCountSessionId) return;
        try {
            const draftLines = Object.entries(stockCountDraft)
                .filter(([, v]) => v !== undefined)
                .map(([id, val]) => ({ id: Number(id), counted_quantity: val }));
            if (draftLines.length > 0) {
                await mutations.updateStockCountLines.mutateAsync({
                    sessionId: stockCountSessionId,
                    lines: draftLines,
                });
            }
            await mutations.finalizeStockCount.mutateAsync(stockCountSessionId);
            showToast({ message: "Η απογραφή ολοκληρώθηκε", type: "success" });
            setStockCountDraft({});
            closeStockCount();
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    }, [
        stockCountSessionId,
        stockCountDraft,
        mutations.updateStockCountLines,
        mutations.finalizeStockCount,
        closeStockCount,
        showToast,
    ]);

    const handleStockCountLineChange = useCallback(
        (lineId: number, value: number | null) => {
            setStockCountDraft((prev) => ({ ...prev, [lineId]: value }));
        },
        []
    );

    const handleStockCountLineBlur = useCallback(
        async (lineId: number) => {
            const value = stockCountDraft[lineId];
            if (value === undefined) return;
            if (!stockCountSessionId) return;
            setStockCountDraft((prev) => {
                const next = { ...prev };
                delete next[lineId];
                return next;
            });
            try {
                await mutations.updateStockCountLines.mutateAsync({
                    sessionId: stockCountSessionId,
                    lines: [{ id: lineId, counted_quantity: value }],
                });
            } catch (e: unknown) {
                const err = e as Error;
                showToast({ message: err.message || "Σφάλμα", type: "error" });
            }
        },
        [stockCountSessionId, stockCountDraft, mutations.updateStockCountLines, showToast]
    );

    const handleAdjSelectOption = useCallback((o: ProductVariantOption, storeProducts: StoreProduct[]) => {
        setAdjProductId(o.product_id);
        setAdjVariantId(o.product_variant_id);
        setAdjSearchQuery("");
        setAdjSearchFocused(false);
        const sp = storeProducts.find(
            (s) => s.product_id === o.product_id && s.product_variant_id === o.product_variant_id
        );
        setAdjPhysicalQuantity(sp != null ? String(sp.stock_quantity) : "0");
    }, []);

    const startEditingPrice = useCallback((row: StoreProduct) => {
        setEditingPriceRow(row);
        setEditingPriceValue(row.store_sale_price != null ? String(row.store_sale_price) : "");
    }, []);

    useEffect(() => {
        if (editingPriceRow) {
            priceInputRef.current?.focus();
        }
    }, [editingPriceRow]);

    const saveInlinePrice = useCallback(async () => {
        if (!editingPriceRow || !activeStore?.id) return;
        const val = editingPriceValue.trim() === "" ? null : Number(editingPriceValue);
        if (val !== null && (isNaN(val) || val < 0)) {
            setEditingPriceRow(null);
            setEditingPriceValue("");
            return;
        }
        const rowToSave = editingPriceRow;
        setEditingPriceRow(null);
        setEditingPriceValue("");
        try {
            await mutations.updateStoreSalePrice.mutateAsync({
                store_id: activeStore.id,
                product_id: rowToSave.product_id,
                product_variant_id: rowToSave.product_variant_id,
                store_product_id: rowToSave.id,
                store_sale_price: val,
            });
            showToast({ message: "Η τιμή ενημερώθηκε", type: "success" });
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    }, [editingPriceRow, editingPriceValue, activeStore?.id, mutations, showToast]);

    const validateAdjust = (): boolean => {
        const err: Record<string, string> = {};
        if (!activeStore?.id) err.store = "Επιλέξτε κατάστημα από την πλευρική μπάρα";
        if (adjProductId === "" || adjVariantId === "") err.product = "Επιλέξτε προϊόν από την αναζήτηση";
        const q = Number(adjPhysicalQuantity);
        if (isNaN(q) || q < 0) err.quantity = "Η ποσότητα πρέπει να είναι ≥ 0";
        setAdjErrors(err);
        return Object.keys(err).length === 0;
    };

    const handleAdjust = async () => {
        if (!validateAdjust() || !activeStore?.id) return;

        const params: AdjustParams = {
            store_id: activeStore.id,
            product_id: Number(adjProductId),
            product_variant_id: Number(adjVariantId),
            physical_quantity: Number(adjPhysicalQuantity),
        };

        try {
            await mutations.addAdjustment.mutateAsync(params);
            showToast({ message: "Η προσαρμογή αποθέματος ολοκληρώθηκε", type: "success" });
            closeAdjust();
        } catch (e: unknown) {
            const err = e as Error & { requires_negative_stock_confirmation?: boolean; insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }> };
            if (err.requires_negative_stock_confirmation && err.insufficientItems?.length) {
                setAdjNegativeStockConfirm(err.insufficientItems);
                return;
            }
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleAdjustConfirm = async () => {
        if (!activeStore?.id) return;
        const params: AdjustParams = {
            store_id: activeStore.id,
            product_id: Number(adjProductId),
            product_variant_id: Number(adjVariantId),
            physical_quantity: Number(adjPhysicalQuantity),
            confirm_negative_stock: true,
        };
        try {
            await mutations.addAdjustment.mutateAsync(params);
            showToast({ message: "Η προσαρμογή αποθέματος ολοκληρώθηκε", type: "success" });
            closeAdjust();
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const showStockLoading = activeTab === "stock" && storeProductsLoading && storeProducts.length === 0;
    const showMovementsLoading = activeTab === "movements" && movementsLoading && movements.length === 0;

    return (
        <div className={styles.wrapper}>
            <div className={styles.headerRow}>
                <h1 className={styles.title}>Απόθεμα</h1>
                <p className={styles.subtitle}>Διαχείριση αποθεμάτων και κινήσεων ανά κατάστημα</p>
            </div>

            <div className={styles.tabs}>
                <button
                    type="button"
                    className={`${styles.tab} ${activeTab === "stock" ? styles.tabActive : ""}`}
                    onClick={() => setActiveTab("stock")}
                >
                    Απόθεμα
                </button>
                <button
                    type="button"
                    className={`${styles.tab} ${activeTab === "movements" ? styles.tabActive : ""}`}
                    onClick={() => setActiveTab("movements")}
                >
                    Κινήσεις
                </button>
            </div>

            {activeTab === "stock" && (
                <>
                    <div className={styles.listToolbar}>
                        <div className={styles.filtersRow}>
                            <div className={styles.filterGroup}>
                                <label className={styles.filterLabel}>Αναζήτηση</label>
                                <div className={styles.searchWrapper}>
                                    <Search size={16} className={styles.searchIcon} />
                                    <input
                                        type="text"
                                        className={styles.filterInput}
                                        value={searchFilter}
                                        onChange={(e) => setSearchFilter(e.target.value)}
                                        placeholder="Προϊόν, παραλλαγή, SKU..."
                                    />
                                </div>
                            </div>
                        </div>
                        <div className={styles.actionsRow}>
                            <Button
                                variant="outline"
                                onClick={openEndo}
                                disabled={!activeStore?.id || allStores.length < 2}
                                title={
                                    allStores.length < 2
                                        ? "Χρειάζεται τουλάχιστον δύο καταστήματα για ενδοδιακίνηση"
                                        : undefined
                                }
                            >
                                <ArrowRightLeft size={16} />
                                Ενδοδιακίνηση
                            </Button>
                            <Button
                                variant="outline"
                                onClick={openStockCount}
                                disabled={!activeStore?.id}
                                title={!activeStore?.id ? "Επιλέξτε κατάστημα από την πλευρική μπάρα" : undefined}
                            >
                                <ClipboardList size={16} />
                                Απογραφή
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => openAdjust()}
                                disabled={!activeStore?.id}
                                title={!activeStore?.id ? "Επιλέξτε κατάστημα από την πλευρική μπάρα" : undefined}
                            >
                                <Plus size={16} />
                                Προσαρμογή
                            </Button>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>Λίστα αποθεμάτων</h3>
                        {!activeStore?.id ? (
                            <p className={styles.sectionHint}>
                                Επιλέξτε κατάστημα από την πλευρική μπάρα για να δείτε και να διαχειριστείτε το απόθεμα.
                            </p>
                        ) : showStockLoading ? (
                            <div className={styles.listLoading}>
                                <LoadingSpinner />
                            </div>
                        ) : storeProducts.length === 0 ? (
                            <p className={styles.sectionHint}>
                                Δεν βρέθηκαν προϊόντα. Προσθέστε προϊόντα ή κάντε αγορά για να εμφανιστούν εδώ.
                            </p>
                        ) : (
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Προϊόν</th>
                                            <th>Παραλλαγή</th>
                                            <th>SKU</th>
                                            <th>Απόθεμα</th>
                                            <th>Μονάδα</th>
                                            <th>Τιμή πώλησης</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {storeProducts.map((sp) => {
                                            const rowKey = sp.id ?? `v-${sp.product_variant_id}`;
                                            const isLowStock = sp.stock_quantity < LOW_STOCK_THRESHOLD && sp.stock_quantity > 0;
                                            const isOutOfStock = sp.stock_quantity === 0;
                                            const isEditing = editingPriceRow?.product_variant_id === sp.product_variant_id &&
                                                editingPriceRow?.product_id === sp.product_id;
                                            return (
                                                <tr
                                                    key={rowKey}
                                                    className={
                                                        isLowStock ? styles.rowLowStock : isOutOfStock ? styles.rowOutOfStock : ""
                                                    }
                                                >
                                                    <td>{sp.product?.name ?? "—"}</td>
                                                    <td>{sp.variant?.name ?? "—"}</td>
                                                    <td>{sp.variant?.sku ?? "—"}</td>
                                                    <td>{sp.stock_quantity}</td>
                                                    <td>{sp.unit?.symbol ?? "—"}</td>
                                                    <td
                                                        className={styles.priceCell}
                                                        onClick={() => !isEditing && startEditingPrice(sp)}
                                                    >
                                                        {isEditing ? (
                                                            <input
                                                                ref={priceInputRef}
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                className={styles.inlinePriceInput}
                                                                value={editingPriceValue}
                                                                onChange={(e) => setEditingPriceValue(e.target.value)}
                                                                onBlur={saveInlinePrice}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") {
                                                                        e.preventDefault();
                                                                        saveInlinePrice();
                                                                    }
                                                                    if (e.key === "Escape") {
                                                                        setEditingPriceRow(null);
                                                                        setEditingPriceValue("");
                                                                    }
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        ) : (
                                                            <span className={styles.priceDisplay}>
                                                                {sp.store_sale_price != null
                                                                    ? formatCurrency(sp.store_sale_price)
                                                                    : "—"}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {storeProductsFetching && (
                                    <div className={styles.tableOverlay}>
                                        <LoadingSpinner />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === "movements" && (
                <>
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
                                <label className={styles.filterLabel}>Τύπος κίνησης</label>
                                <select
                                    className={styles.filterSelect}
                                    value={movementTypeFilter}
                                    onChange={(e) => setMovementTypeFilter(e.target.value)}
                                >
                                    <option value="">Όλα</option>
                                    <option value="in">Είσοδος</option>
                                    <option value="out">Έξοδος</option>
                                    <option value="adjustment">Προσαρμογή</option>
                                    <option value="sale">Πώληση</option>
                                    <option value="transfer">Μεταφορά</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>Κινήσεις αποθήκης</h3>
                        {!activeStore?.id ? (
                            <p className={styles.sectionHint}>
                                Επιλέξτε κατάστημα από την πλευρική μπάρα για να δείτε τις κινήσεις.
                            </p>
                        ) : showMovementsLoading ? (
                            <div className={styles.listLoading}>
                                <LoadingSpinner />
                            </div>
                        ) : movements.length === 0 ? (
                            <p className={styles.sectionHint}>Δεν υπάρχουν κινήσεις για τα επιλεγμένα φίλτρα.</p>
                        ) : (
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Ημερομηνία</th>
                                            <th>Προϊόν</th>
                                            <th>Παραλλαγή</th>
                                            <th>Τύπος</th>
                                            <th>Ποσότητα</th>
                                            <th>Πηγή</th>
                                            <th>Σχετικό έγγραφο</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movements.map((m) => (
                                            <tr key={m.id}>
                                                <td>{formatDate(m.created_at)}</td>
                                                <td>{m.product_name ?? "—"}</td>
                                                <td>{m.variant_name ?? "—"}</td>
                                                <td>{MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type}</td>
                                                <td>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                                                <td>{SOURCE_LABELS[m.source] ?? m.source}</td>
                                                <td>
                                                    {renderRelatedDocument(
                                                        m.related_document_type,
                                                        m.related_document_id,
                                                        styles.docLink
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {movementsFetching && (
                                    <div className={styles.tableOverlay}>
                                        <LoadingSpinner />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            <SidePopup
                isOpen={adjustPopupOpen}
                onClose={closeAdjust}
                title={adjNegativeStockConfirm ? "Επιβεβαίωση προσαρμογής με αρνητικό απόθεμα" : "Προσαρμογή αποθέματος"}
                width="480px"
                footerLeftButton={{
                    label: adjNegativeStockConfirm ? "← Πίσω" : "Κλείσιμο",
                    onClick: adjNegativeStockConfirm ? () => setAdjNegativeStockConfirm(null) : closeAdjust,
                    variant: "outline",
                }}
                footerRightButton={
                    adjNegativeStockConfirm
                        ? {
                              label: "Συνεχίζω",
                              onClick: handleAdjustConfirm,
                              variant: "primary",
                              loading: mutations.addAdjustment.isPending,
                          }
                        : {
                              label: "Αποθήκευση",
                              onClick: handleAdjust,
                              variant: "primary",
                              loading: mutations.addAdjustment.isPending,
                          }
                }
            >
                <div className={styles.slidingWrapper}>
                    <div
                        className={styles.slidingPanels}
                        style={{ transform: adjNegativeStockConfirm ? "translateX(-50%)" : undefined }}
                    >
                        <div className={styles.slidingPanel}>
                    {adjErrors.store && (
                        <div className={styles.formError} style={{ marginBottom: 12 }}>
                            {adjErrors.store}
                        </div>
                    )}
                    <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                        <label className={styles.formLabel}>Προϊόν / Παραλλαγή *</label>
                        <div className={styles.productSearchWrapper}>
                            <input
                                type="text"
                                className={styles.formInput}
                                value={adjSearchFocused ? adjSearchQuery : adjSelectedLabel}
                                onChange={(e) => {
                                    setAdjSearchQuery(e.target.value);
                                    setAdjSearchFocused(true);
                                    if (!e.target.value) {
                                        setAdjProductId("");
                                        setAdjVariantId("");
                                    }
                                }}
                                onFocus={() => {
                                    setAdjSearchFocused(true);
                                    if (adjProductId !== "" && adjVariantId !== "" && !adjSearchQuery) {
                                        setAdjSearchQuery(adjSelectedLabel);
                                    }
                                }}
                                onBlur={() => setTimeout(() => setAdjSearchFocused(false), 150)}
                                placeholder="Αναζήτηση προϊόντος ή παραλλαγής..."
                            />
                            {adjSearchFocused && (
                                <div
                                    className={styles.searchResultsList}
                                    onMouseDown={(e) => e.preventDefault()}
                                >
                                    {adjSearchResults.length === 0 ? (
                                        <div className={styles.searchResultsEmpty}>
                                            Δεν βρέθηκαν παραλλαγές
                                        </div>
                                    ) : (
                                        adjSearchResults.slice(0, 8).map((o) => (
                                            <button
                                                key={`${o.product_id}-${o.product_variant_id}`}
                                                type="button"
                                                className={styles.searchResultItem}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    handleAdjSelectOption(o, storeProducts);
                                                }}
                                            >
                                                {o.label}
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                        {adjErrors.product && (
                            <span className={styles.formError}>{adjErrors.product}</span>
                        )}
                    </div>
                    <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                        <label className={styles.formLabel}>
                            Φυσική ποσότητα * (ποσότητα που μετράτε πραγματικά)
                        </label>
                        <input
                            type="number"
                            className={styles.formInput}
                            min={0}
                            value={adjPhysicalQuantity}
                            onChange={(e) => setAdjPhysicalQuantity(e.target.value)}
                            placeholder="π.χ. 10"
                        />
                        {adjErrors.quantity && <span className={styles.formError}>{adjErrors.quantity}</span>}
                    </div>
                        </div>
                        <div className={styles.slidingPanel}>
                            {adjNegativeStockConfirm && (
                                <div>
                                    <p style={{ marginBottom: 12 }}>
                                        Τα ακόλουθα προϊόντα θα έχουν αρνητικό απόθεμα. Θέλετε να συνεχίσετε;
                                    </p>
                                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                                        {adjNegativeStockConfirm.map((it, i) => (
                                            <li key={i} style={{ marginBottom: 4 }}>
                                                <strong>{it.product_name}</strong> ({it.variant_name}): απαιτείται {it.required}, διαθέσιμα {it.available}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </SidePopup>

            <SidePopup
                isOpen={endoPopupOpen}
                onClose={closeEndo}
                title="Ενδοδιακίνηση"
                width="560px"
                footerLeftButton={{ label: "Κλείσιμο", onClick: closeEndo, variant: "outline" }}
                footerRightButton={{
                    label: "Οριστικοποίηση",
                    onClick: handleEndoSubmit,
                    variant: "primary",
                    loading: mutations.createTransfer.isPending,
                }}
            >
                <div>
                    {(endoErrors.stores || endoErrors.lines) && (
                        <div className={styles.formError} style={{ marginBottom: 12 }}>
                            {endoErrors.stores || endoErrors.lines}
                        </div>
                    )}
                    <div className={styles.formRow} style={{ marginBottom: 16 }}>
                        <div className={styles.formGroup} style={{ flex: 1 }}>
                            <label className={styles.formLabel}>Από *</label>
                            <select
                                className={styles.formSelect}
                                value={endoSourceStoreId}
                                onChange={(e) => setEndoSourceStoreId(e.target.value)}
                            >
                                <option value="">Επιλέξτε προέλευση</option>
                                {allStores.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formGroup} style={{ flex: 1 }}>
                            <label className={styles.formLabel}>Προς *</label>
                            <select
                                className={styles.formSelect}
                                value={endoDestStoreId}
                                onChange={(e) => setEndoDestStoreId(e.target.value)}
                            >
                                <option value="">Επιλέξτε προορισμό</option>
                                {allStores.filter((s) => s.id !== endoSourceStoreId).map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className={styles.formGroup} style={{ marginBottom: 12 }}>
                        <label className={styles.formLabel}>Προσθήκη γραμμής</label>
                        <div className={styles.productSearchWrapper}>
                            <input
                                type="text"
                                className={styles.formInput}
                                value={endoLineSearchQuery}
                                onChange={(e) => {
                                    setEndoLineSearchQuery(e.target.value);
                                    setEndoLineSearchFocused(true);
                                }}
                                onFocus={() => setEndoLineSearchFocused(true)}
                                onBlur={() => setTimeout(() => setEndoLineSearchFocused(false), 150)}
                                placeholder="Αναζήτηση προϊόντος ή παραλλαγής..."
                            />
                            {endoLineSearchFocused && (
                                <div className={styles.searchResultsList} onMouseDown={(e) => e.preventDefault()}>
                                    {endoSearchResults.length === 0 ? (
                                        <div className={styles.searchResultsEmpty}>Δεν βρέθηκαν παραλλαγές</div>
                                    ) : (
                                        endoSearchResults.slice(0, 8).map((o) => (
                                            <button
                                                key={`${o.product_id}-${o.product_variant_id}`}
                                                type="button"
                                                className={styles.searchResultItem}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    addEndoLine(o);
                                                }}
                                            >
                                                {o.label}
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    {endoLines.length > 0 && (
                        <div className={styles.endoLinesTable}>
                            <div className={styles.endoLinesHeader}>
                                <span>Προϊόν</span>
                                <span>Ποσότητα</span>
                                <span style={{ width: 36 }} />
                            </div>
                            {endoLines.map((l) => (
                                <div key={l.id} className={styles.endoLineRow}>
                                    <span className={styles.endoLineLabel}>{l.label}</span>
                                    <input
                                        type="number"
                                        className={styles.endoQtyInput}
                                        min={1}
                                        value={l.quantity}
                                        onChange={(e) => updateEndoLineQty(l.id, e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className={styles.removeEndoLineBtn}
                                        onClick={() => removeEndoLine(l.id)}
                                        title="Αφαίρεση"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </SidePopup>

            <SidePopup
                isOpen={stockCountPopupOpen}
                onClose={closeStockCount}
                title="Απογραφή"
                width="640px"
                footerLeftButton={{ label: "Κλείσιμο", onClick: closeStockCount, variant: "outline" }}
                footerRightButton={
                    stockCountSessionId
                        ? {
                              label: "Οριστικοποίηση Απογραφής",
                              onClick: handleStockCountFinalize,
                              variant: "primary",
                              loading: mutations.finalizeStockCount.isPending,
                          }
                        : undefined
                }
            >
                <div>
                    {!stockCountSessionId ? (
                        <div>
                            <p className={styles.sectionHint} style={{ marginBottom: 16 }}>
                                Δημιουργήστε ένα session απογραφής για το επιλεγμένο κατάστημα. Θα εμφανιστούν όλα τα προϊόντα με το τρέχον σύστημα αποθεμάτων. Εισάγετε την πραγματικά μετρημένη ποσότητα κάθε προϊόντος.
                            </p>
                            <Button
                                variant="primary"
                                onClick={startStockCount}
                                disabled={!activeStore?.id || mutations.createStockCount.isPending}
                            >
                                Έναρξη Απογραφής ({activeStore?.name ?? "—"})
                            </Button>
                        </div>
                    ) : stockCountSession?.status === "draft" ? (
                        <div>
                            <p className={styles.formHint} style={{ marginBottom: 12 }}>
                                Κατάστημα: {allStores.find((s) => s.id === stockCountSession.store_id)?.name ?? stockCountSession.store_id}
                            </p>
                            <div className={styles.stockCountTable}>
                                <div className={styles.stockCountHeader}>
                                    <span>Προϊόν / Παραλλαγή</span>
                                    <span>Σύστημα</span>
                                    <span>Μετρημένο</span>
                                </div>
                                {products.length > 0 &&
                                    (stockCountSession.stock_count_lines ?? []).map((line) => {
                                        const prod = products.find((p) => p.id === line.product_id);
                                        const variant = prod?.variants?.find((v) => v.id === line.product_variant_id);
                                        const label = prod && variant ? `${prod.name} — ${variant.name}` : `#${line.product_variant_id}`;
                                        return (
                                            <div key={line.id} className={styles.stockCountRow}>
                                                <span>{label}</span>
                                                <span>{line.system_quantity}</span>
                                                <input
                                                    type="number"
                                                    className={styles.formInput}
                                                    min={0}
                                                    step="0.001"
                                                    value={
                                                        stockCountDraft[line.id] !== undefined
                                                            ? stockCountDraft[line.id] ?? ""
                                                            : line.counted_quantity ?? ""
                                                    }
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        handleStockCountLineChange(
                                                            line.id,
                                                            v === "" ? null : Number(v)
                                                        );
                                                    }}
                                                    onBlur={() => handleStockCountLineBlur(line.id)}
                                                    placeholder="—"
                                                />
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    ) : (
                        <p className={styles.sectionHint}>Η απογραφή ολοκληρώθηκε.</p>
                    )}
                </div>
            </SidePopup>

        </div>
    );
}
