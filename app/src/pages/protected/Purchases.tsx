import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, ArrowRight, Package, FileDown, Banknote, RotateCcw, XCircle, Link2 } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/contexts/AuthContext";
import {
    usePurchases,
    usePurchase,
    usePurchaseMutations,
    type CreatePurchaseParams,
    type UpdatePurchaseParams,
    type PurchaseItemInput,
    type Purchase,
} from "@/hooks/usePurchases";
import { useProducts, type ProductVariant } from "@/hooks/useProducts";
import { useVendors, useVendorMutations } from "@/hooks/useVendors";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import VendorSearchSelect from "@/components/VendorSearchSelect";
import SidePopup from "@/components/reusable/SidePopup";
import Button from "@/components/reusable/Button";
import LoadingSpinner from "@/components/LoadingSpinner";
import DocTypeBadge from "@/components/DocTypeBadge";
import StatusBadge from "@/components/StatusBadge";
import { PURCHASE_DOC_TYPES, PURCHASE_NEW_DOC_OPTIONS, getPurchaseStatusLabel, type PurchaseDocType } from "@/config/documentTypes";
import { getPurchaseButtons, PURCHASE_ACTION_ICON } from "@/config/documentActions";
import { getPoCancelBlockMessageFromLinked, getPoCloseBlockMessageFromLinked } from "@/config/parentCancelGuards";
import type { FooterButton } from "@/components/reusable/SidePopup";
import { axiosPrivate } from "@/api/axios";
import styles from "./Purchases.module.css";

const PURCHASE_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    FileDown,
    Trash2,
    Banknote,
    RotateCcw,
    ArrowRight,
    Package,
    XCircle,
    Link2,
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
    unpaid: "Απλήρωτο",
    partial: "Μερική",
    paid: "Πληρωμένο",
    overdue: "Εκπροθεσμο",
};

const PURCHASE_STATUSES: { value: string; label: string }[] = [
    { value: "draft", label: "Πρόχειρο" },
    { value: "ordered", label: "Παραγγελία" },
    { value: "received", label: "Έλαβα" },
    { value: "completed", label: "Ολοκλήρωση" },
    { value: "invoiced", label: "Τιμολογήθηκε" },
    { value: "cancelled", label: "Ακυρώθηκε" },
];

type LineItemRow = {
    id: string;
    productId: number | "";
    variantId: number | "";
    quantity: string;
    costPriceWithoutVat: string;
    vatRate: number;
    vatExempt: boolean;
    productVatRate: number;
    priceWithVatWhenExempt?: number; // Preserved when exempt so the display doesn't change
    /** PO purchase_items.id when this GRN line fulfills a PO line */
    poLineId?: number | null;
    /** True when the line was added on the GRN and is not on the PO */
    isExtra?: boolean;
};

/** First PO line id for this product+variant that is not already linked on another form row. */
function findFreePoLineIdForVariant(
    poItems: Array<{ id: number; product_id: number; product_variant_id: number }> | undefined,
    productId: number,
    variantId: number,
    rows: LineItemRow[],
    excludeRowId: string
): number | null {
    if (!poItems?.length) return null;
    const candidates = poItems.filter((pi) => pi.product_id === productId && pi.product_variant_id === variantId);
    for (const pi of candidates) {
        const taken = rows.some((r) => r.id !== excludeRowId && r.poLineId === pi.id);
        if (!taken) return pi.id;
    }
    return null;
}

/** PATCH body items from a loaded purchase (list or detail). */
function purchaseItemsToPatchPayload(p: Purchase): PurchaseItemInput[] {
    return (p.purchase_items ?? []).map((it) => ({
        product_id: it.product_id,
        product_variant_id: it.product_variant_id,
        quantity: it.quantity,
        cost_price: it.cost_price,
        vat_rate: it.vat_rate ?? 0,
        vat_exempt: it.vat_exempt ?? false,
        ...(it.po_line_id != null && typeof it.po_line_id === "number" ? { po_line_id: it.po_line_id } : {}),
        ...(it.is_extra === true ? { is_extra: true as const } : {}),
    }));
}

function getPurchaseApiErrorMessage(e: unknown): string {
    if (e instanceof Error && e.message) return e.message;
    const ax = e as { response?: { data?: { message?: string } } };
    if (ax.response?.data?.message && typeof ax.response.data.message === "string") return ax.response.data.message;
    return "Σφάλμα";
}

/** invoice_number is already full (e.g. GRN-2026-0013); avoid GRN-GRN-2026-0013 when joining with document_type */
function purchaseDocDisplayLabel(
    documentType: string | null | undefined,
    invoiceNumber: string | null | undefined,
    fallbackId: number
): string {
    const num = (invoiceNumber ?? "").trim();
    if (!num) return `#${fallbackId}`;
    if (/^[A-Za-z]{2,4}-\d{4}-\d+/i.test(num)) return num;
    const dt = (documentType || "").toUpperCase();
    return dt ? `${dt}-${num}` : num;
}

function formatDate(iso: string | null) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("el-GR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
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

export default function Purchases() {
    const { activeStore, showToast } = useAuth();
    const [searchFilter, setSearchFilter] = useState("");
    const [vendorFilter, setVendorFilter] = useState<string>("");
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [documentTypeFilter, setDocumentTypeFilter] = useState<string>("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [popupOpen, setPopupOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [deleteNegativeStockConfirm, setDeleteNegativeStockConfirm] = useState<
        Array<{ product_name: string; variant_name: string; required: number; available: number }> | null
    >(null);
    const [variantDropdownRowId, setVariantDropdownRowId] = useState<string | null>(null);
    const [variantSearchByRow, setVariantSearchByRow] = useState<Record<string, string>>({});
    const searchDebounced = useDebounce(searchFilter.trim(), 300);

    const { purchases, isLoading, isFetching } = usePurchases({
        storeId: activeStore?.id ?? undefined,
        vendorId: vendorFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: searchDebounced || undefined,
        documentType: documentTypeFilter || undefined,
        status: statusFilter || undefined,
    });

    const { purchase: editPurchase, isLoading: editLoading } = usePurchase(editId);
    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const hasOpenedFromNav = useRef(false);
    const { products } = useProducts();
    const { vendors } = useVendors();
    const { paymentMethods } = usePaymentMethods();
    const mutations = usePurchaseMutations();
    const vendorMutations = useVendorMutations();
    const [showQuickCreateVendor, setShowQuickCreateVendor] = useState(false);
    const [qcVendorName, setQcVendorName] = useState("");
    const [qcVendorContactName, setQcVendorContactName] = useState("");
    const [qcVendorPhone, setQcVendorPhone] = useState("");
    const [qcVendorEmail, setQcVendorEmail] = useState("");
    const [qcVendorErrors, setQcVendorErrors] = useState<Record<string, string>>({});

    const [formVendorId, setFormVendorId] = useState<string>("");
    const [formPaymentMethodId, setFormPaymentMethodId] = useState<string>("");
    const [formStatus, setFormStatus] = useState<string>("draft");
    const [formDocumentType, setFormDocumentType] = useState<PurchaseDocType>("PUR");
    const [formInvoiceNumber, setFormInvoiceNumber] = useState("");
    const [formInvoiceDate, setFormInvoiceDate] = useState("");
    const [formPaymentTerms, setFormPaymentTerms] = useState<string>("immediate");
    const [formNotes, setFormNotes] = useState("");
    const [formItems, setFormItems] = useState<LineItemRow[]>([
        { id: "0", productId: "", variantId: "", quantity: "", costPriceWithoutVat: "", vatRate: 0, vatExempt: false, productVatRate: 0 },
    ]);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [showPartialReturnPanel, setShowPartialReturnPanel] = useState(false);
    const [partialReturnQuantities, setPartialReturnQuantities] = useState<Record<number, number>>({});
    const [negativeStockConfirm, setNegativeStockConfirm] = useState<{
        insufficientItems: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
        pendingParams: { id: number } & UpdatePurchaseParams;
    } | null>(null);

    const resetForm = useCallback(() => {
        setFormVendorId("");
        setFormPaymentMethodId("");
        setFormStatus("draft");
        setFormDocumentType("PUR");
        setFormInvoiceNumber("");
        setFormInvoiceDate(new Date().toISOString().slice(0, 10));
        setFormPaymentTerms("immediate");
        setFormNotes("");
        setFormItems([{ id: "0", productId: "", variantId: "", quantity: "", costPriceWithoutVat: "", vatRate: 0, vatExempt: false, productVatRate: 0 }]);
        setFormErrors({});
        setVariantDropdownRowId(null);
        setVariantSearchByRow({});
    }, []);

    const [newDocDropdownOpen, setNewDocDropdownOpen] = useState(false);
    const newDocDropdownRef = useRef<HTMLDivElement>(null);
    const [purchasePdfLoadingId, setPurchasePdfLoadingId] = useState<number | null>(null);

    const openCreate = useCallback(
        (docType?: PurchaseDocType) => {
            // Clear deep-link state first so the effect below does not re-apply openPurchaseId after editId becomes null
            navigate(location.pathname, { replace: true, state: {} });
            setEditId(null);
            setDeleteConfirmId(null);
            setDeleteNegativeStockConfirm(null);
            setShowQuickCreateVendor(false);
            setShowPartialReturnPanel(false);
            setNegativeStockConfirm(null);
            setPartialReturnQuantities({});
            resetForm();
            setFormStatus("draft");
            if (docType) setFormDocumentType(docType);
            setPopupOpen(true);
            setNewDocDropdownOpen(false);
        },
        [resetForm, navigate, location.pathname]
    );

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (newDocDropdownRef.current && !newDocDropdownRef.current.contains(e.target as Node)) setNewDocDropdownOpen(false);
        };
        document.addEventListener("click", handler);
        return () => document.removeEventListener("click", handler);
    }, []);

    const openEdit = useCallback((p: Purchase) => {
        setEditId(p.id);
        setFormVendorId(p.vendor_id ?? "");
        setFormPaymentMethodId(p.payment_method_id);
        setFormStatus(p.status || "draft");
        setFormDocumentType((p.document_type as PurchaseDocType) || "PUR");
        setFormInvoiceNumber(p.invoice_number ?? "");
        setFormInvoiceDate(p.invoice_date ? p.invoice_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
        setFormPaymentTerms((p.payment_terms as string) || "immediate");
        setFormNotes(p.notes ?? "");
        setFormItems(
            p.purchase_items?.length
                ? p.purchase_items.map((it) => {
                      const prod = products.find((x) => x.id === it.product_id);
                      const productVatRate = prod?.vat_exempt ? 0 : (prod?.vat_rate?.rate ?? it.vat_rate ?? 0);
                      const exempt = it.vat_exempt ?? false;
                      return {
                          id: `item-${it.id}`,
                          productId: it.product_id,
                          variantId: it.product_variant_id,
                          quantity: String(it.quantity),
                          costPriceWithoutVat: String(Number(it.cost_price).toFixed(2)),
                          vatRate: it.vat_rate ?? 0,
                          vatExempt: exempt,
                          productVatRate: exempt ? productVatRate : (it.vat_rate ?? 0),
                          priceWithVatWhenExempt: exempt ? Number(it.cost_price) : undefined,
                          poLineId: it.po_line_id ?? null,
                          isExtra: it.is_extra === true,
                      };
                  })
                : [{ id: "0", productId: "", variantId: "", quantity: "", costPriceWithoutVat: "", vatRate: 0, vatExempt: false, productVatRate: 0 }]
        );
        setFormErrors({});
        setVariantDropdownRowId(null);
        setVariantSearchByRow({});
        setPopupOpen(true);
    }, [products]);

    // List GET omits po_line_id/is_extra in some caches; detail GET always has them. Merge so GRN meta (Παραγγελία / Ήδη παραλήφθηκαν) stays after reopen.
    useEffect(() => {
        if (!editId || !editPurchase || editPurchase.id !== editId) return;
        const items = editPurchase.purchase_items || [];
        if (items.length === 0) return;
        setFormItems((prev) => {
            let changed = false;
            const next = prev.map((row) => {
                const m = /^item-(\d+)$/.exec(row.id);
                if (!m) return row;
                const dbId = parseInt(m[1], 10);
                const it = items.find((x) => x.id === dbId);
                if (!it) return row;
                const poLineId = it.po_line_id ?? null;
                const isExtra = it.is_extra === true;
                if (row.poLineId !== poLineId || row.isExtra !== isExtra) {
                    changed = true;
                    return { ...row, poLineId, isExtra };
                }
                return row;
            });
            return changed ? next : prev;
        });
    }, [editId, editPurchase]);

    const closePopup = useCallback(() => {
        setPopupOpen(false);
        setEditId(null);
        setDeleteConfirmId(null);
        setDeleteNegativeStockConfirm(null);
        setShowQuickCreateVendor(false);
        setQcVendorName("");
        setQcVendorContactName("");
        setQcVendorPhone("");
        setQcVendorEmail("");
        setQcVendorErrors({});
        resetForm();
        navigate(location.pathname, { replace: true, state: {} });
    }, [resetForm, navigate, location.pathname]);

    const openPartialReturn = useCallback((p: Purchase) => {
        setDeleteConfirmId(null);
        setDeleteNegativeStockConfirm(null);
        openEdit(p);
        setShowPartialReturnPanel(true);
        const init: Record<number, number> = {};
        for (const it of p.purchase_items || []) {
            init[it.id] = it.quantity;
        }
        setPartialReturnQuantities(init);
    }, [openEdit]);

    useEffect(() => {
        const openId = (location.state as { openPurchaseId?: number })?.openPurchaseId;
        if (typeof openId === "number" && !editId) {
            setEditId(openId);
            setPopupOpen(true);
        }
    }, [location.state]);

    useEffect(() => {
        if (
            editPurchase &&
            editId &&
            editId === editPurchase.id &&
            popupOpen &&
            (location.state as { openPurchaseId?: number })?.openPurchaseId === editId &&
            !hasOpenedFromNav.current
        ) {
            hasOpenedFromNav.current = true;
            openEdit(editPurchase);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [editPurchase, editId, popupOpen, location.state, location.pathname, openEdit, navigate]);

    // When vendor changes in create mode, load vendor payment_terms for PUR (edit keeps purchase's terms)
    const validPaymentTerms = ["immediate", "15", "30", "60", "90"];
    useEffect(() => {
        if (formDocumentType !== "PUR" || editId != null) return;
        const v = vendors.find((x) => x.id === formVendorId);
        const pt = v?.payment_terms && validPaymentTerms.includes(String(v.payment_terms).toLowerCase())
            ? String(v.payment_terms).toLowerCase()
            : "immediate";
        setFormPaymentTerms(pt);
    }, [formVendorId, formDocumentType, vendors, editId]);

    const formDueDate = useMemo(() => {
        if (formDocumentType !== "PUR") return null;
        const invStr = formInvoiceDate?.trim() || new Date().toISOString().slice(0, 10);
        const days = formPaymentTerms === "immediate" ? 0 : parseInt(formPaymentTerms, 10) || 0;
        if (days <= 0) return null;
        const d = new Date(invStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }, [formDocumentType, formInvoiceDate, formPaymentTerms]);

    const isGrnFromPo =
        !!editId &&
        !!editPurchase &&
        editPurchase.id === editId &&
        (editPurchase.document_type || "").toUpperCase() === "GRN" &&
        !!editPurchase.converted_from_id &&
        (editPurchase.status || "").toLowerCase() === "draft";

    const isPurFromGrn =
        !!editId &&
        !!editPurchase &&
        editPurchase.id === editId &&
        (editPurchase.document_type || "").toUpperCase() === "PUR" &&
        !!editPurchase.converted_from_id;

    const addItemRow = () => {
        setFormItems((prev) => [
            ...prev,
            isGrnFromPo
                ? {
                      id: `row-${Date.now()}`,
                      productId: "",
                      variantId: "",
                      quantity: "",
                      costPriceWithoutVat: "",
                      vatRate: 0,
                      vatExempt: false,
                      productVatRate: 0,
                      isExtra: true,
                  }
                : { id: `row-${Date.now()}`, productId: "", variantId: "", quantity: "", costPriceWithoutVat: "", vatRate: 0, vatExempt: false, productVatRate: 0 },
        ]);
    };

    const removeItemRow = (id: string) => {
        setFormItems((prev) => {
            const next = prev.filter((r) => r.id !== id);
            return next.length === 0
                ? [
                      isGrnFromPo
                          ? {
                                id: `empty-${Date.now()}`,
                                productId: "",
                                variantId: "",
                                quantity: "",
                                costPriceWithoutVat: "",
                                vatRate: 0,
                                vatExempt: false,
                                productVatRate: 0,
                                isExtra: true,
                            }
                          : {
                                id: `empty-${Date.now()}`,
                                productId: "",
                                variantId: "",
                                quantity: "",
                                costPriceWithoutVat: "",
                                vatRate: 0,
                                vatExempt: false,
                                productVatRate: 0,
                            },
                  ]
                : next;
        });
    };

    const updateItemRow = (id: string, field: keyof LineItemRow, value: string | number | boolean) => {
        setFormItems((prev) =>
            prev.map((r) => {
                if (r.id !== id) return r;
                const next = { ...r, [field]: value } as LineItemRow;
                if (field === "productId") {
                    next.variantId = "";
                    next.costPriceWithoutVat = "";
                    next.vatRate = 0;
                    next.vatExempt = false;
                    next.productVatRate = 0;
                    next.priceWithVatWhenExempt = undefined;
                    if (isGrnFromPo) {
                        next.poLineId = null;
                        next.isExtra = true;
                    }
                }
                if (field === "vatExempt") {
                    const exempt = value === true;
                    next.vatRate = exempt ? 0 : (r.productVatRate || r.vatRate || 0);
                    if (exempt) {
                        const without = Number(r.costPriceWithoutVat) || 0;
                        const rate = r.vatRate ?? 0;
                        next.priceWithVatWhenExempt = Math.round(without * (1 + rate) * 100) / 100;
                    } else {
                        next.priceWithVatWhenExempt = undefined;
                    }
                }
                return next;
            })
        );
    };

    const setPriceFromWithVat = (rowId: string, withVat: number) => {
        setFormItems((prev) =>
            prev.map((r) => {
                if (r.id !== rowId) return r;
                const rate = r.vatExempt ? 0 : (r.vatRate ?? 0);
                const withoutVat = rate <= 0 ? withVat : withVat / (1 + rate);
                return { ...r, costPriceWithoutVat: (Math.round(withoutVat * 100) / 100).toFixed(2) };
            })
        );
    };

    const getCostPriceWithVat = (row: LineItemRow): number => {
        const without = Number(row.costPriceWithoutVat) || 0;
        const rate = row.vatExempt ? 0 : (row.vatRate ?? 0);
        return Math.round(without * (1 + rate) * 100) / 100;
    };

    const flattenedVariants = useMemo(() => {
        const out: { productId: number; productName: string; product: { id: number; vat_rate?: { rate: number } | null; vat_exempt?: boolean }; variant: ProductVariant; label: string }[] = [];
        for (const p of products) {
            for (const v of p.variants) {
                out.push({
                    productId: p.id,
                    productName: p.name,
                    product: p,
                    variant: v,
                    label: `${p.name} — ${v.name}${v.sku ? ` (${v.sku})` : ""}`,
                });
            }
        }
        return out;
    }, [products]);

    const selectVariantForRow = (rowId: string, fv: { productId: number; product: { vat_rate?: { rate: number } | null; vat_exempt?: boolean }; variant: ProductVariant }) => {
        const vatExempt = fv.product.vat_exempt === true;
        const productVatRate = fv.product.vat_rate?.rate ?? 0;
        const vatRate = vatExempt ? 0 : productVatRate;
        const costWithout = fv.variant.cost_price != null ? fv.variant.cost_price : 0;
        setFormItems((prev) =>
            prev.map((r) => {
                if (r.id !== rowId) return r;
                const base = {
                    productId: fv.productId,
                    variantId: fv.variant.id,
                    costPriceWithoutVat: costWithout > 0 ? (Math.round(costWithout * 100) / 100).toFixed(2) : "",
                    vatRate,
                    vatExempt,
                    productVatRate,
                    priceWithVatWhenExempt: undefined,
                };
                if (!isGrnFromPo) {
                    return { ...r, ...base };
                }
                // Same rule as lockPoLine: linked PO line — keep po_line / is_extra; variant change is blocked in UI
                const lockPoLine = r.poLineId != null && !r.isExtra;
                if (lockPoLine) {
                    return { ...r, ...base };
                }
                const freeId = findFreePoLineIdForVariant(
                    editPurchase?.source_purchase?.purchase_items,
                    fv.productId,
                    fv.variant.id,
                    prev,
                    rowId
                );
                if (freeId != null) {
                    return { ...r, ...base, poLineId: freeId, isExtra: false };
                }
                return { ...r, ...base, poLineId: null, isExtra: true };
            })
        );
        setVariantDropdownRowId(null);
        setVariantSearchByRow((prev) => ({ ...prev, [rowId]: "" }));
    };

    const getFilteredVariantsForRow = (rowId: string) => {
        const search = (variantSearchByRow[rowId] ?? "").trim().toLowerCase();
        const base = !search
            ? flattenedVariants
            : flattenedVariants.filter(
                  (fv) =>
                      fv.label.toLowerCase().includes(search) ||
                      fv.variant.sku?.toLowerCase().includes(search)
              );
        if (!isGrnFromPo) return base;
        return base.filter((fv) => {
            const takenElsewhere = formItems.some(
                (r) =>
                    r.id !== rowId &&
                    r.productId !== "" &&
                    r.variantId !== "" &&
                    Number(r.productId) === fv.productId &&
                    Number(r.variantId) === fv.variant.id
            );
            return !takenElsewhere;
        });
    };

    const getSelectedVariantLabel = (row: LineItemRow) => {
        if (!row.productId || !row.variantId) return "";
        const p = products.find((x) => x.id === Number(row.productId));
        const v = p?.variants.find((x) => x.id === Number(row.variantId));
        if (!p || !v) return "";
        return `${p.name} — ${v.name}${v.sku ? ` (${v.sku})` : ""}`;
    };

    const getLineTotalCost = (row: LineItemRow): number => {
        const q = Number(row.quantity) || 0;
        const p = Number(row.costPriceWithoutVat) || 0;
        if (!row.productId || !row.variantId || q <= 0) return 0;
        return Math.round(q * p * 100) / 100;
    };

    const getLineVatAmount = (row: LineItemRow): number => {
        const lineTotal = getLineTotalCost(row);
        const rate = row.vatExempt ? 0 : (row.vatRate ?? 0);
        return Math.round(lineTotal * rate * 100) / 100;
    };

    const { subtotal, vatTotal, totalAmount } = useMemo(() => {
        let st = 0;
        let vt = 0;
        for (const r of formItems) {
            st += getLineTotalCost(r);
            vt += getLineVatAmount(r);
        }
        st = Math.round(st * 100) / 100;
        vt = Math.round(vt * 100) / 100;
        return {
            subtotal: st,
            vatTotal: vt,
            totalAmount: Math.round((st + vt) * 100) / 100,
        };
    }, [formItems]);

    const validateForm = (): boolean => {
        const err: Record<string, string> = {};
        if (!activeStore?.id) err.store_id = "Επιλέξτε κατάστημα από την πλευρική μπάρα";
        if (!formPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        const validItems = formItems.filter(
            (r) => r.productId !== "" && r.variantId !== "" && Number(r.quantity) > 0 && Number(r.costPriceWithoutVat) >= 0
        );
        if (validItems.length === 0) err.items = "Προσθέστε τουλάχιστον ένα είδος με ποσότητα και τιμή αγοράς";
        setFormErrors(err);
        return Object.keys(err).length === 0;
    };

    useEffect(() => {
        const validItems = formItems.filter(
            (r) => r.productId !== "" && r.variantId !== "" && Number(r.quantity) > 0 && Number(r.costPriceWithoutVat) >= 0
        );
        if (validItems.length === 0) return;
        setFormErrors((prev) => {
            if (!prev.items) return prev;
            const next = { ...prev };
            delete next.items;
            return next;
        });
    }, [formItems]);

    const buildItems = (): PurchaseItemInput[] => {
        const validItems = formItems.filter(
            (r) => r.productId !== "" && r.variantId !== "" && Number(r.quantity) > 0 && Number(r.costPriceWithoutVat) >= 0
        );
        return validItems.map((r) => {
            const vatExempt = r.vatExempt === true;
            const vatRate = vatExempt ? 0 : (r.vatRate ?? 0);
            return {
                product_id: Number(r.productId),
                product_variant_id: Number(r.variantId),
                quantity: Number(r.quantity),
                cost_price: Number(r.costPriceWithoutVat),
                vat_rate: vatRate,
                vat_exempt: vatExempt,
                ...(r.poLineId != null && typeof r.poLineId === "number" ? { po_line_id: r.poLineId } : {}),
                ...(r.isExtra ? { is_extra: true as const } : {}),
            };
        });
    };

    const handleSave = async (statusOverride?: string) => {
        if (!validateForm()) return;

        const statusToSend = statusOverride ?? formStatus;
        const items = buildItems();
        const todayIso = new Date().toISOString().slice(0, 10);
        const invoiceDate = formInvoiceDate.trim() || todayIso;

        try {
            if (editId) {
                const params: UpdatePurchaseParams = {
                    vendor_id: formVendorId || null,
                    payment_method_id: formPaymentMethodId,
                    invoice_number: formInvoiceNumber.trim() || null,
                    invoice_date: invoiceDate,
                    document_type: formDocumentType,
                    status: statusToSend,
                    notes: formNotes.trim() || null,
                    items,
                    ...(formDocumentType === "PUR" && { payment_terms: formPaymentTerms }),
                };
                await mutations.updatePurchase.mutateAsync({ id: editId, ...params });
                showToast({ message: "Η αγορά ενημερώθηκε επιτυχώς", type: "success" });
            } else {
                const params: CreatePurchaseParams = {
                    store_id: activeStore!.id,
                    vendor_id: formVendorId || null,
                    payment_method_id: formPaymentMethodId,
                    invoice_number: formInvoiceNumber.trim() || null,
                    invoice_date: invoiceDate,
                    document_type: formDocumentType,
                    status: statusToSend,
                    notes: formNotes.trim() || null,
                    items,
                    ...(formDocumentType === "PUR" && { payment_terms: formPaymentTerms }),
                };
                await mutations.createPurchase.mutateAsync(params);
                showToast({ message: "Η αγορά δημιουργήθηκε επιτυχώς", type: "success" });
            }
            closePopup();
        } catch (e: unknown) {
            const err = e as Error & { requires_negative_stock_confirmation?: boolean; insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }> };
            if (editId && err.requires_negative_stock_confirmation && err.insufficientItems?.length) {
                const params: UpdatePurchaseParams = {
                    vendor_id: formVendorId || null,
                    payment_method_id: formPaymentMethodId,
                    invoice_number: formInvoiceNumber.trim() || null,
                    invoice_date: invoiceDate,
                    document_type: formDocumentType,
                    status: statusToSend,
                    notes: formNotes.trim() || null,
                    items,
                    ...(formDocumentType === "PUR" && { payment_terms: formPaymentTerms }),
                };
                setDeleteConfirmId(null);
                setDeleteNegativeStockConfirm(null);
                setNegativeStockConfirm({ insufficientItems: err.insufficientItems, pendingParams: { id: editId, ...params } });
                return;
            }
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleConfirmNegativeStock = async () => {
        if (!negativeStockConfirm) return;
        const params = { ...negativeStockConfirm.pendingParams, confirm_negative_stock: true };
        setNegativeStockConfirm(null);
        try {
            await mutations.updatePurchase.mutateAsync(params);
            showToast({ message: "Η αγορά ενημερώθηκε επιτυχώς", type: "success" });
            closePopup();
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await mutations.deletePurchase.mutateAsync({ id });
            showToast({ message: "Η αγορά διαγράφηκε επιτυχώς", type: "success" });
            setDeleteConfirmId(null);
            setDeleteNegativeStockConfirm(null);
            closePopup();
        } catch (e: unknown) {
            const err = e as Error & { requires_negative_stock_confirmation?: boolean; insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }> };
            if (err.requires_negative_stock_confirmation && err.insufficientItems?.length) {
                setDeleteNegativeStockConfirm(err.insufficientItems);
                return;
            }
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleDeleteConfirm = async (id: number) => {
        try {
            await mutations.deletePurchase.mutateAsync({ id, confirm_negative_stock: true });
            showToast({ message: "Η αγορά διαγράφηκε επιτυχώς", type: "success" });
            setDeleteConfirmId(null);
            setDeleteNegativeStockConfirm(null);
            closePopup();
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleSaveVendorQuickCreate = async () => {
        const err: Record<string, string> = {};
        if (!qcVendorName.trim()) err.name = "Το όνομα προμηθευτή είναι υποχρεωτικό";
        setQcVendorErrors(err);
        if (Object.keys(err).length > 0) return;

        try {
            const vendor = await vendorMutations.createVendor.mutateAsync({
                name: qcVendorName.trim(),
                contact_name: qcVendorContactName.trim() || undefined,
                phone: qcVendorPhone.trim() || undefined,
                email: qcVendorEmail.trim() || undefined,
            });
            setFormVendorId(String(vendor.id));
            setShowQuickCreateVendor(false);
            setQcVendorName("");
            setQcVendorContactName("");
            setQcVendorPhone("");
            setQcVendorEmail("");
            setQcVendorErrors({});
            showToast({ message: "Ο προμηθευτής δημιουργήθηκε επιτυχώς", type: "success" });
        } catch (e: unknown) {
            const errMsg = e as Error;
            showToast({ message: errMsg.message || "Σφάλμα", type: "error" });
        }
    };

    const showPurchasesLoading = isLoading && purchases.length === 0;

    const isCompletedReceivedReadOnly = !!(
        editId &&
        editPurchase &&
        editPurchase.id === editId &&
        (() => {
            const dt = (editPurchase.document_type || "").toUpperCase();
            const st = (editPurchase.status || "").toLowerCase();
            if (dt === "PUR") return st === "received" || st === "completed";
            // Δελτίο παραλαβής: μετά την οριστικοποίηση (π.χ. Προς Τιμολόγηση) τα είδη είναι μόνο για προβολή
            if (dt === "GRN") return st !== "draft";
            if (dt === "DBN") return st === "completed";
            return false;
        })()
    );
    const isPoReadOnly =
        !!editId &&
        !!editPurchase &&
        editPurchase.id === editId &&
        (editPurchase.document_type || "").toUpperCase() === "PO" &&
        (editPurchase.status || "").toLowerCase() !== "draft";
    const isFormReadOnly = isCompletedReceivedReadOnly || isPoReadOnly;

    const handleDownloadPurchasePdf = useCallback(
        async (p: Purchase) => {
            const st = (p.status || "").toLowerCase();
            if (st === "draft") {
                showToast({ message: "Δεν υπάρχει PDF για πρόχειρα έγγραφα", type: "error" });
                return;
            }
            setPurchasePdfLoadingId(p.id);
            try {
                const res = await axiosPrivate.get(`/api/shared/company/purchases/${p.id}/pdf`, {
                    responseType: "blob",
                });
                const blob = res.data as Blob;
                if (res.status !== 200) {
                    const text = await blob.text();
                    let msg = "Σφάλμα κατά τη λήψη PDF";
                    try {
                        const errData = JSON.parse(text);
                        msg = errData.message || msg;
                    } catch {
                        /* ignore */
                    }
                    showToast({ message: msg, type: "error" });
                    return;
                }
                const prefix =
                    (p.document_type || "PUR").toUpperCase() === "PO"
                        ? "paraggelia"
                        : (p.document_type || "").toUpperCase() === "GRN"
                          ? "paralavi"
                          : (p.document_type || "").toUpperCase() === "DBN"
                            ? "pistotiko"
                            : "agora";
                const filename = `${prefix}-${p.invoice_number ?? p.id}.pdf`;
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (e) {
                const err = e as { response?: { data?: { message?: string } } };
                const msg = err.response?.data?.message || (e as Error).message || "Σφάλμα κατά τη λήψη PDF";
                showToast({ message: msg, type: "error" });
            } finally {
                setPurchasePdfLoadingId(null);
            }
        },
        [showToast]
    );

    const inMainForm =
        !showPartialReturnPanel &&
        !showQuickCreateVendor &&
        !negativeStockConfirm &&
        deleteConfirmId === null;
    const docType = (editId && editPurchase?.id === editId ? editPurchase?.document_type : formDocumentType) || "PUR";
    const docStatus = (editId && editPurchase?.id === editId ? editPurchase?.status : formStatus) || "draft";
    const hasPayments = (editPurchase?.payments?.filter(p => p.status !== "reversed").length ?? 0) > 0;
    const hasLinkedInvoice = (docType === "GRN" && !!editPurchase?.converted_to) || false;

    const purchaseFooterActions = useMemo((): FooterButton[] => {
        if (!inMainForm) return [];
        if (editId && editLoading) return [];
        const effectiveDocType = (editId && editPurchase?.id === editId ? editPurchase?.document_type : formDocumentType) || "PUR";
        const effectiveStatus = (editId && editPurchase?.id === editId ? editPurchase?.status : formStatus) || "draft";
        const buttons = getPurchaseButtons(
            effectiveDocType,
            effectiveStatus,
            editPurchase?.payment_status ?? null,
            hasPayments,
            hasLinkedInvoice
        );
        return buttons
            .filter((b) => !b.disabled || b.key === "reverse")
            .map((btn) => {
                const base: FooterButton = { label: btn.label, onClick: () => {}, variant: "outline", tooltip: btn.tooltip ?? undefined, disabled: btn.disabled };
                if (btn.key === "record_payment") {
                    base.onClick = async () => {
                        if (!editId || !editPurchase || !activeStore?.id) return;
                        try {
                            const defaultPm = paymentMethods.find((pm) => pm.is_active)?.id ?? paymentMethods[0]?.id;
                            const res = await axiosPrivate.post("/api/shared/company/payments", {
                                store_id: activeStore.id,
                                purchase_id: editId,
                                vendor_id: editPurchase.vendor_id,
                                payment_method_id: defaultPm,
                            });
                            if (res.data.success && res.data.data?.id) {
                                await Promise.all([
                                    queryClient.invalidateQueries({ queryKey: ["payments"] }),
                                    queryClient.invalidateQueries({ queryKey: ["purchases"] }),
                                    queryClient.invalidateQueries({ queryKey: ["purchase"] }),
                                ]);
                                closePopup();
                                navigate(`/payments?open=${res.data.data.id}`);
                            }
                        } catch (e) {
                            showToast({ message: (e as Error).message || "Σφάλμα δημιουργίας πληρωμής", type: "error" });
                        }
                    };
                    base.variant = "primary";
                } else if (btn.key === "create_invoice" && effectiveDocType === "GRN" && editId) {
                    base.variant = "primary";
                    base.onClick = async () => {
                        try {
                            const { purchase: created, reused_existing_draft: reusedDraft } = await mutations.convertFromGrn.mutateAsync(editId);
                            showToast({
                                message: reusedDraft
                                    ? "Υπήρχε ήδη πρόχειρο Τιμολόγιο Αγοράς — ανοίγει το υπάρχον."
                                    : "Δημιουργήθηκε πρόχειρο Τιμολόγιο Αγοράς",
                                type: reusedDraft ? "info" : "success",
                            });
                            openEdit(created as unknown as Purchase);
                        } catch (e) {
                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                        }
                    };
                    base.loading = mutations.convertFromGrn.isPending;
                } else if (btn.key === "create_grn" && effectiveDocType === "PO" && editId) {
                    base.variant = "primary";
                    base.onClick = async () => {
                        try {
                            const { purchase: created, reused_existing_draft: reusedDraft } = await mutations.createGrnFromPo.mutateAsync(editId);
                            showToast({
                                message: reusedDraft
                                    ? "Υπήρχε ήδη πρόχειρο δελτίο παραλαβής — ανοίγει το υπάρχον."
                                    : "Δημιουργήθηκε Δελτίο Παραλαβής",
                                type: reusedDraft ? "info" : "success",
                            });
                            openEdit(created as unknown as Purchase);
                        } catch (e) {
                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                        }
                    };
                    base.loading = mutations.createGrnFromPo.isPending;
                } else if (btn.key === "create_credit_note" && editPurchase) {
                    base.onClick = () => openPartialReturn(editPurchase);
                    base.variant = "primary";
                } else if (btn.key === "delete" && editId) {
                    const poDeleteBlock =
                        effectiveDocType === "PO" && effectiveStatus === "draft"
                            ? getPoCancelBlockMessageFromLinked(editPurchase?.linked_documents)
                            : null;
                    base.disabled = !!poDeleteBlock;
                    base.tooltip = poDeleteBlock ?? undefined;
                    base.onClick = () => {
                        if (poDeleteBlock) return;
                        setShowQuickCreateVendor(false);

                        setShowPartialReturnPanel(false);
                        setNegativeStockConfirm(null);
                        setDeleteConfirmId(editId);
                    };
                    base.variant = "danger";
                } else if (btn.key === "save" || btn.key === "finalize") {
                    base.onClick = () => {
                        if (btn.key === "finalize") {
                            let nextStatus = formStatus;
                            if (effectiveDocType === "PO") nextStatus = "sent";
                            else if (effectiveDocType === "GRN") nextStatus = "pending_invoice";
                            else if (effectiveDocType === "PUR" || effectiveDocType === "DBN") nextStatus = "completed";
                            void handleSave(nextStatus);
                        } else {
                            void handleSave();
                        }
                    };
                    base.variant = "primary";
                } else if (btn.key === "cancel_order" && effectiveDocType === "PO" && editId) {
                    const poCancelBlock =
                        editPurchase?.id === editId ? getPoCancelBlockMessageFromLinked(editPurchase?.linked_documents) : null;
                    base.variant = "outline";
                    base.disabled = !!poCancelBlock;
                    base.tooltip = poCancelBlock ?? undefined;
                    base.onClick = async () => {
                        if (poCancelBlock) return;
                        try {
                            await mutations.updatePurchase.mutateAsync({ id: editId, status: "cancelled", payment_method_id: formPaymentMethodId, items: buildItems() });
                            showToast({ message: "Η παραγγελία ακυρώθηκε", type: "success" });
                            closePopup();
                        } catch (e) {
                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                        }
                    };
                    base.loading = mutations.updatePurchase.isPending;
                } else if (btn.key === "close_order" && effectiveDocType === "PO" && editId) {
                    const poCloseBlock =
                        editPurchase?.id === editId ? getPoCloseBlockMessageFromLinked(editPurchase?.linked_documents) : null;
                    base.variant = "primary";
                    base.disabled = !!poCloseBlock;
                    base.tooltip = poCloseBlock ?? undefined;
                    base.onClick = async () => {
                        if (poCloseBlock) return;
                        try {
                            await mutations.updatePurchase.mutateAsync({
                                id: editId,
                                status: "closed",
                                payment_method_id: formPaymentMethodId,
                                items: buildItems(),
                            });
                            showToast({ message: "Η παραγγελία έκλεισε", type: "success" });
                            closePopup();
                        } catch (e) {
                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                        }
                    };
                    base.loading = mutations.updatePurchase.isPending;
                } else if (btn.key === "reverse" && editId && effectiveDocType === "GRN") {
                    base.variant = "outline";
                    if (hasLinkedInvoice) {
                        base.disabled = true;
                        base.tooltip = "Υπάρχει συνδεδεμένο Τιμολόγιο Αγοράς. Διαγράψτε πρώτα το τιμολόγιο.";
                    }
                    base.onClick = async () => {
                        if (hasLinkedInvoice) return;
                        try {
                            await mutations.updatePurchase.mutateAsync({
                                id: editId,
                                status: "reversed",
                                payment_method_id: formPaymentMethodId,
                                items: buildItems(),
                            });
                            showToast({ message: "Το δελτίο παραλαβής αντιλογίστηκε", type: "success" });
                            closePopup();
                        } catch (e) {
                            showToast({ message: getPurchaseApiErrorMessage(e), type: "error" });
                        }
                    };
                    base.loading = mutations.updatePurchase.isPending;
                } else if (btn.key === "reverse" && editId && effectiveDocType === "PUR") {
                    base.variant = "outline";
                    if (btn.disabled) {
                        base.disabled = true;
                        base.tooltip = btn.tooltip ?? undefined;
                    }
                    base.onClick = async () => {
                        if (btn.disabled) return;
                        try {
                            await mutations.updatePurchase.mutateAsync({
                                id: editId,
                                status: "reversed",
                                payment_method_id: formPaymentMethodId,
                                items: buildItems(),
                            });
                            showToast({ message: "Το τιμολόγιο αντιλογίστηκε", type: "success" });
                            closePopup();
                        } catch (e) {
                            showToast({ message: getPurchaseApiErrorMessage(e), type: "error" });
                        }
                    };
                    base.loading = mutations.updatePurchase.isPending;
                } else if (btn.key === "reverse" && editId && effectiveDocType === "DBN") {
                    base.variant = "outline";
                    base.onClick = async () => {
                        try {
                            await mutations.updatePurchase.mutateAsync({
                                id: editId,
                                status: "reversed",
                                payment_method_id: formPaymentMethodId,
                                items: buildItems(),
                            });
                            showToast({ message: "Το πιστωτικό αντιλογίστηκε", type: "success" });
                            closePopup();
                        } catch (e) {
                            showToast({ message: getPurchaseApiErrorMessage(e), type: "error" });
                        }
                    };
                    base.loading = mutations.updatePurchase.isPending;
                } else if (btn.key === "pdf" && editPurchase) {
                    base.onClick = () => handleDownloadPurchasePdf(editPurchase);
                    base.loading = purchasePdfLoadingId === editId;
                } else if (["apply", "refund"].includes(btn.key)) {
                    base.onClick = () => {};
                    base.disabled = true;
                    base.tooltip = "Αυτή η λειτουργία δεν είναι ακόμα διαθέσιμη";
                } else {
                    return null;
                }
                return base;
            })
            .filter((b): b is FooterButton => b !== null);
    }, [
        inMainForm,
        editId,
        editLoading,
        formDocumentType,
        formStatus,
        docType,
        docStatus,
        hasPayments,
        hasLinkedInvoice,
        editPurchase,
        editPurchase?.linked_documents,
        handleDownloadPurchasePdf,
        purchasePdfLoadingId,
        mutations.updatePurchase,
        mutations.createGrnFromPo,
        mutations.convertFromGrn,
        formPaymentMethodId,
        closePopup,
        openPartialReturn,
        showToast,
        handleSave,
    ]);

    const [pendingConvertedId, setPendingConvertedId] = useState<number | null>(null);

    const handleOpenConvertedDoc = useCallback(() => {
        if (!editPurchase?.converted_to) return;
        setShowPartialReturnPanel(false);

        setPendingConvertedId(editPurchase.converted_to.id);
        setEditId(editPurchase.converted_to.id);
    }, [editPurchase?.converted_to]);

    const handleOpenReturnFromDoc = useCallback(() => {
        if (!editPurchase?.return_from) return;
        setShowPartialReturnPanel(false);

        setPendingConvertedId(editPurchase.return_from.id);
        setEditId(editPurchase.return_from.id);
    }, [editPurchase?.return_from]);

    const handleOpenSourcePoDoc = useCallback(() => {
        const pid = editPurchase?.source_purchase?.id;
        if (pid == null) return;
        setShowPartialReturnPanel(false);

        setPendingConvertedId(pid);
        setEditId(pid);
    }, [editPurchase?.source_purchase?.id]);

    const handleOpenSourceGrnDoc = useCallback(() => {
        const gid = editPurchase?.source_grn?.id;
        if (gid == null) return;
        setShowPartialReturnPanel(false);

        setPendingConvertedId(gid);
        setEditId(gid);
    }, [editPurchase?.source_grn?.id]);

    const handleOpenSourcePoFromPur = useCallback(() => {
        const pid = editPurchase?.source_po?.id;
        if (pid == null) return;
        setShowPartialReturnPanel(false);

        setPendingConvertedId(pid);
        setEditId(pid);
    }, [editPurchase?.source_po?.id]);

    useEffect(() => {
        if (pendingConvertedId && editPurchase?.id === pendingConvertedId) {
            openEdit(editPurchase);
            setPendingConvertedId(null);
        }
    }, [pendingConvertedId, editPurchase, openEdit]);


    const handlePartialReturnSubmit = async () => {
        if (!editId || !editPurchase || editPurchase.id !== editId) return;
        const items = (editPurchase.purchase_items || [])
            .filter((it) => (partialReturnQuantities[it.id] ?? 0) > 0)
            .map((it) => ({ purchase_item_id: it.id, quantity: partialReturnQuantities[it.id]! }));
        if (items.length === 0) {
            showToast({ message: "Επιλέξτε ποσότητα επιστροφής για τουλάχιστον μία γραμμή", type: "error" });
            return;
        }
        try {
            const created = await mutations.partialReturn.mutateAsync({ id: editId, items });
            showToast({ message: "Το πιστωτικό δημιουργήθηκε σε πρόχειρη κατάσταση", type: "success" });
            setShowPartialReturnPanel(false);
            setPartialReturnQuantities({});
            if (created?.id) {
                setPendingConvertedId(created.id);
                setEditId(created.id);
            }
        } catch (e: unknown) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };


    return (
        <div className={styles.wrapper}>
            <div className={styles.headerRow}>
                <h1 className={styles.title}>Αγορές</h1>
                <p className={styles.subtitle}>Διαχείριση αγορών</p>
            </div>

            <div className={styles.listToolbar}>
                <div className={styles.filtersRow}>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Αναζήτηση</label>
                        <div className={styles.searchWrapper}>
                            <Search size={16} className={styles.searchIcon} />
                            <input
                                type="text"
                                className={styles.filterInput}
                                placeholder="Αριθμός τιμολογίου..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Προμηθευτής</label>
                        <select
                            className={styles.filterSelect}
                            value={vendorFilter}
                            onChange={(e) => setVendorFilter(e.target.value)}
                        >
                            <option value="">Όλοι</option>
                            {vendors.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name}
                                </option>
                            ))}
                        </select>
                    </div>
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
                        <label className={styles.filterLabel}>Τύπος</label>
                        <select
                            className={styles.filterSelect}
                            value={documentTypeFilter}
                            onChange={(e) => setDocumentTypeFilter(e.target.value)}
                        >
                            <option value="">Όλοι</option>
                            {PURCHASE_DOC_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Κατάσταση</label>
                        <select
                            className={styles.filterSelect}
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="">Όλες</option>
                            {PURCHASE_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className={styles.addBtn} ref={newDocDropdownRef}>
                    <div className={styles.dropdownWrapper}>
                        <Button
                            variant="primary"
                            onClick={() => setNewDocDropdownOpen((v) => !v)}
                            disabled={!activeStore?.id}
                            title={!activeStore?.id ? "Επιλέξτε κατάστημα από την πλευρική μπάρα" : undefined}
                        >
                            <Plus size={16} />
                            Νέο Παραστατικό ▾
                        </Button>
                        {newDocDropdownOpen && (
                            <div className={styles.dropdownMenu}>
                                {PURCHASE_NEW_DOC_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        className={styles.dropdownItem}
                                        onClick={() => openCreate(opt.value as PurchaseDocType)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Λίστα αγορών</h3>
                {!activeStore?.id ? (
                    <p className={styles.sectionHint}>
                        Επιλέξτε κατάστημα από την πλευρική μπάρα για να δείτε και να δημιουργήσετε αγορές.
                    </p>
                ) : showPurchasesLoading ? (
                    <div className={styles.listLoading}>
                        <LoadingSpinner />
                    </div>
                ) : purchases.length === 0 ? (
                    <p className={styles.sectionHint}>Δεν υπάρχουν αγορές. Κάντε κλικ στο «Νέα αγορά».</p>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Αρ. Τιμολόγιου</th>
                                    <th>Προμηθευτής</th>
                                    <th>Ημερομηνία</th>
                                    <th>Σύνολο</th>
                                    <th>Τύπος</th>
                                    <th>Κατάσταση</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {purchases.map((p) => (
                                    <tr key={p.id}>
                                        <td>{p.invoice_number ?? `#${p.id}`}</td>
                                        <td>{p.vendor?.name ?? "—"}</td>
                                        <td>{formatDate(p.invoice_date || p.created_at)}</td>
                                        <td>{formatCurrency(p.total_amount)}</td>
                                        <td><DocTypeBadge value={p.document_type || "PUR"} variant="purchase" /></td>
                                        <td><StatusBadge status={p.status} variant="purchase" /></td>
                                        <td>
                                            <div className={styles.cellActions}>
                                                {(() => {
                                                    const doc = (p.document_type || "PUR").toUpperCase();
                                                    const st = (p.status || "").toLowerCase();
                                                    const hasPayments = p.has_payments || (p.payments?.filter(pay => pay.status !== "reversed").length ?? 0) > 0;
                                                    const hasLinkedInvoice = doc === "GRN" && !!p.converted_to;
                                                    const poCancelBlockList =
                                                        doc === "PO" ? getPoCancelBlockMessageFromLinked(p.linked_documents) : null;
                                                    const poCloseBlockList =
                                                        doc === "PO" ? getPoCloseBlockMessageFromLinked(p.linked_documents) : null;
                                                    const listButtons = getPurchaseButtons(doc, st, p.payment_status ?? null, hasPayments, hasLinkedInvoice)
                                                        .filter((b) => (!b.disabled || b.key === "reverse") && b.key !== "save" && b.key !== "finalize");

                                                    return (
                                                        <>
                                                            {listButtons.map((btn) => {
                                                                const iconName = PURCHASE_ACTION_ICON[btn.key];
                                                                const Icon = iconName ? PURCHASE_ICON_MAP[iconName] : null;
                                                                if (!Icon) return null;

                                                                const btnClass = btn.key === "delete" ? styles.deleteBtn : btn.key === "pdf" ? styles.pdfBtn : (btn.key === "record_payment" || btn.key === "create_credit_note") ? styles.mailSendBtn : styles.editBtn;
                                                                const handler = btn.key === "delete" ? () => {
                                                                        setShowQuickCreateVendor(false);
                                                
                                                                        setShowPartialReturnPanel(false);
                                                                        setNegativeStockConfirm(null);
                                                                        setDeleteNegativeStockConfirm(null);
                                                                        openEdit(p);
                                                                        setDeleteConfirmId(p.id);
                                                                    }
                                                                    : btn.key === "create_grn" && doc === "PO" ? async () => {
                                                                        try {
                                                                            const { purchase: created, reused_existing_draft: reusedDraft } =
                                                                                await mutations.createGrnFromPo.mutateAsync(p.id);
                                                                            showToast({
                                                                                message: reusedDraft
                                                                                    ? "Υπήρχε ήδη πρόχειρο δελτίο παραλαβής — ανοίγει το υπάρχον."
                                                                                    : "Δημιουργήθηκε Δελτίο Παραλαβής",
                                                                                type: reusedDraft ? "info" : "success",
                                                                            });
                                                                            openEdit(created as unknown as Purchase);
                                                                        } catch (e) {
                                                                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                                                                        }
                                                                    }
                                                                    : btn.key === "create_invoice" && doc === "GRN" ? async () => {
                                                                        try {
                                                                            const { purchase: created, reused_existing_draft: reusedDraft } =
                                                                                await mutations.convertFromGrn.mutateAsync(p.id);
                                                                            showToast({
                                                                                message: reusedDraft
                                                                                    ? "Υπήρχε ήδη πρόχειρο Τιμολόγιο Αγοράς — ανοίγει το υπάρχον."
                                                                                    : "Δημιουργήθηκε πρόχειρο Τιμολόγιο Αγοράς",
                                                                                type: reusedDraft ? "info" : "success",
                                                                            });
                                                                            if (editId === p.id) { setEditId(null); setPopupOpen(false); }
                                                                            openEdit(created as unknown as Purchase);
                                                                        } catch (e) {
                                                                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                                                                        }
                                                                    }
                                                                    : btn.key === "record_payment" ? async () => {
                                                                          if (!activeStore?.id) return;
                                                                          try {
                                                                              const defaultPm = paymentMethods.find((pm) => pm.is_active)?.id ?? paymentMethods[0]?.id;
                                                                              const res = await axiosPrivate.post("/api/shared/company/payments", {
                                                                                  store_id: activeStore.id,
                                                                                  purchase_id: p.id,
                                                                                  vendor_id: p.vendor_id,
                                                                                  payment_method_id: defaultPm,
                                                                              });
                                                                              if (res.data.success && res.data.data?.id) {
                                                                                  await Promise.all([
                                                                                      queryClient.invalidateQueries({ queryKey: ["payments"] }),
                                                                                      queryClient.invalidateQueries({ queryKey: ["purchases"] }),
                                                                                      queryClient.invalidateQueries({ queryKey: ["purchase"] }),
                                                                                  ]);
                                                                                  if (editId === p.id) closePopup();
                                                                                  navigate(`/payments?open=${res.data.data.id}`);
                                                                              }
                                                                          } catch (e) {
                                                                              showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                                                                          }
                                                                      }
                                                                    : btn.key === "create_credit_note" ? () => openPartialReturn(p)
                                                                    : btn.key === "pdf" ? () => handleDownloadPurchasePdf(p)
                                                                    : btn.key === "cancel_order" && doc === "PO" ? async () => {
                                                                        try {
                                                                            const items = (p.purchase_items ?? []).map((it) => ({
                                                                                product_id: it.product_id,
                                                                                product_variant_id: it.product_variant_id,
                                                                                quantity: it.quantity,
                                                                                cost_price: it.cost_price,
                                                                                vat_rate: it.vat_rate,
                                                                                vat_exempt: it.vat_exempt,
                                                                            }));
                                                                            await mutations.updatePurchase.mutateAsync({
                                                                                id: p.id,
                                                                                status: "cancelled",
                                                                                payment_method_id: p.payment_method_id,
                                                                                items,
                                                                            });
                                                                            showToast({ message: "Η παραγγελία ακυρώθηκε", type: "success" });
                                                                            closePopup();
                                                                        } catch (e) {
                                                                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                                                                        }
                                                                    }
                                                                    : btn.key === "close_order" && doc === "PO" ? async () => {
                                                                        try {
                                                                            const items = (p.purchase_items ?? []).map((it) => ({
                                                                                product_id: it.product_id,
                                                                                product_variant_id: it.product_variant_id,
                                                                                quantity: it.quantity,
                                                                                cost_price: it.cost_price,
                                                                                vat_rate: it.vat_rate,
                                                                                vat_exempt: it.vat_exempt,
                                                                            }));
                                                                            await mutations.updatePurchase.mutateAsync({
                                                                                id: p.id,
                                                                                status: "closed",
                                                                                payment_method_id: p.payment_method_id,
                                                                                items,
                                                                            });
                                                                            showToast({ message: "Η παραγγελία έκλεισε", type: "success" });
                                                                            closePopup();
                                                                        } catch (e) {
                                                                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                                                                        }
                                                                    }
                                                                    : btn.key === "reverse" && doc === "GRN"
                                                                      ? async () => {
                                                                            try {
                                                                                await mutations.updatePurchase.mutateAsync({
                                                                                    id: p.id,
                                                                                    status: "reversed",
                                                                                    payment_method_id: p.payment_method_id,
                                                                                    items: purchaseItemsToPatchPayload(p),
                                                                                });
                                                                                showToast({
                                                                                    message: "Το δελτίο παραλαβής αντιλογίστηκε",
                                                                                    type: "success",
                                                                                });
                                                                                if (editId === p.id) closePopup();
                                                                            } catch (e) {
                                                                                showToast({ message: getPurchaseApiErrorMessage(e), type: "error" });
                                                                            }
                                                                        }
                                                                      : btn.key === "reverse" && doc === "PUR"
                                                                        ? async () => {
                                                                              try {
                                                                                  await mutations.updatePurchase.mutateAsync({
                                                                                      id: p.id,
                                                                                      status: "reversed",
                                                                                      payment_method_id: p.payment_method_id,
                                                                                      items: purchaseItemsToPatchPayload(p),
                                                                                  });
                                                                                  showToast({
                                                                                      message: "Το τιμολόγιο αντιλογίστηκε",
                                                                                      type: "success",
                                                                                  });
                                                                                  if (editId === p.id) closePopup();
                                                                              } catch (e) {
                                                                                  showToast({ message: getPurchaseApiErrorMessage(e), type: "error" });
                                                                              }
                                                                          }
                                                                        : btn.key === "reverse" && doc === "DBN"
                                                                          ? async () => {
                                                                                try {
                                                                                    await mutations.updatePurchase.mutateAsync({
                                                                                        id: p.id,
                                                                                        status: "reversed",
                                                                                        payment_method_id: p.payment_method_id,
                                                                                        items: purchaseItemsToPatchPayload(p),
                                                                                    });
                                                                                    showToast({
                                                                                        message: "Το πιστωτικό αντιλογίστηκε",
                                                                                        type: "success",
                                                                                    });
                                                                                    if (editId === p.id) closePopup();
                                                                                } catch (e) {
                                                                                    showToast({ message: getPurchaseApiErrorMessage(e), type: "error" });
                                                                                }
                                                                            }
                                                                          : null;

                                                                if (!handler && !["reverse", "apply", "refund"].includes(btn.key)) return null;

                                                                return (
                                                                    <button
                                                                        key={btn.key}
                                                                        type="button"
                                                                        className={btnClass}
                                                                        onClick={handler || (() => openEdit(p))}
                                                                        title={
                                                                            (btn.key === "cancel_order" || btn.key === "delete") &&
                                                                            poCancelBlockList
                                                                                ? poCancelBlockList
                                                                                : btn.key === "close_order" && poCloseBlockList
                                                                                    ? poCloseBlockList
                                                                                    : btn.key === "reverse" && hasLinkedInvoice
                                                                                        ? "Υπάρχει συνδεδεμένο Τιμολόγιο Αγοράς. Διαγράψτε πρώτα το τιμολόγιο."
                                                                                        : btn.key === "reverse" && btn.disabled
                                                                                            ? btn.tooltip || btn.label
                                                                                            : btn.tooltip || btn.label
                                                                        }
                                                                        disabled={
                                                                            btn.disabled ||
                                                                            (btn.key === "create_grn" && mutations.createGrnFromPo.isPending) ||
                                                                            (btn.key === "create_invoice" && mutations.convertFromGrn.isPending) ||
                                                                            (btn.key === "cancel_order" &&
                                                                                (!!poCancelBlockList || mutations.updatePurchase.isPending)) ||
                                                                            (btn.key === "delete" &&
                                                                                doc === "PO" &&
                                                                                (!!poCancelBlockList || mutations.deletePurchase.isPending)) ||
                                                                            (btn.key === "close_order" &&
                                                                                (!!poCloseBlockList || mutations.updatePurchase.isPending)) ||
                                                                            (btn.key === "reverse" &&
                                                                                (hasLinkedInvoice || mutations.updatePurchase.isPending)) ||
                                                                            (btn.key === "pdf" && purchasePdfLoadingId === p.id)
                                                                        }
                                                                    >
                                                                        <Icon size={16} />
                                                                    </button>
                                                                );
                                                            })}
                                                            <button type="button" className={styles.editBtn} onClick={() => openEdit(p)} title="Επεξεργασία">
                                                                <Pencil size={16} />
                                                            </button>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {isFetching && (
                            <div className={styles.tableOverlay}>
                                <LoadingSpinner />
                            </div>
                        )}
                    </div>
                )}
            </div>

            <SidePopup
                isOpen={popupOpen}
                onClose={closePopup}
                title={
                    deleteConfirmId !== null
                        ? "Επιβεβαίωση διαγραφής"
                        : negativeStockConfirm
                          ? "Επιβεβαίωση επεξεργασίας με αρνητικό απόθεμα"
                          : showPartialReturnPanel
                            ? "Επιστροφή Προϊόντων"
                            : showQuickCreateVendor
                                ? "Νέος Προμηθευτής"
                                : editId
                                  ? "Επεξεργασία αγοράς"
                                  : "Νέα αγορά"
                }
                width="1000px"
                footerLeftButton={
                    deleteConfirmId !== null
                        ? {
                              label: "← Πίσω",
                              onClick: () => {
                                  setDeleteConfirmId(null);
                                  setDeleteNegativeStockConfirm(null);
                              },
                              variant: "outline",
                          }
                        : negativeStockConfirm
                          ? { label: "Ακύρωση", onClick: () => setNegativeStockConfirm(null), variant: "outline" }
                          : showPartialReturnPanel
                            ? { label: "← Πίσω", onClick: () => { setShowPartialReturnPanel(false); setPartialReturnQuantities({}); }, variant: "outline" }
                            : showQuickCreateVendor
                                ? { label: "← Πίσω", onClick: () => { setShowQuickCreateVendor(false); setQcVendorErrors({}); }, variant: "outline" }
                                : { label: "Κλείσιμο", onClick: closePopup, variant: "outline" }
                }
                footerRightButton={
                    deleteConfirmId !== null
                        ? deleteNegativeStockConfirm
                            ? {
                                  label: "Συνεχίζω",
                                  onClick: () => handleDeleteConfirm(deleteConfirmId!),
                                  variant: "danger",
                                  loading: mutations.deletePurchase.isPending,
                              }
                            : {
                                  label: "Διαγραφή",
                                  onClick: () => handleDelete(deleteConfirmId!),
                                  variant: "danger",
                                  loading: mutations.deletePurchase.isPending,
                              }
                        : negativeStockConfirm
                          ? {
                                label: "Συνεχίζω",
                                onClick: handleConfirmNegativeStock,
                                variant: "primary",
                                loading: mutations.updatePurchase.isPending,
                            }
                          : showPartialReturnPanel
                            ? {
                                  label: "Υποβολή",
                                  onClick: handlePartialReturnSubmit,
                                  variant: "primary",
                                  loading: mutations.partialReturn.isPending,
                              }
                            : showQuickCreateVendor
                                ? {
                                      label: "Αποθήκευση",
                                      onClick: handleSaveVendorQuickCreate,
                                      variant: "primary",
                                      loading: vendorMutations.createVendor.isPending,
                                  }
                                : purchaseFooterActions.length > 0
                                  ? undefined
                                  : isFormReadOnly && formStatus !== "cancelled"
                                    ? undefined
                                    : {
                                          label: "Αποθήκευση",
                                          onClick: handleSave,
                                          variant: "primary",
                                          loading:
                                              mutations.createPurchase.isPending ||
                                              mutations.updatePurchase.isPending ||
                                              (!!editId && editLoading),
                                      }
                }
                footerActions={purchaseFooterActions.length > 0 ? purchaseFooterActions : undefined}
                contentLoading={!!editId && editLoading && inMainForm}
            >
                {editPurchase && editId === editPurchase.id && (editPurchase.document_type || "PUR").toUpperCase() === "DBN" && editPurchase.return_from && (
                    <div className={styles.formRow} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
                        <div className={styles.formGroup}>
                            <span className={styles.formLabel}>Αναφορά</span>
                            <button
                                type="button"
                                className={styles.convertedToLink}
                                onClick={handleOpenReturnFromDoc}
                            >
                                Επιστροφή από [
                                {purchaseDocDisplayLabel(
                                    editPurchase.return_from.document_type,
                                    editPurchase.return_from.invoice_number,
                                    editPurchase.return_from.id,
                                )}
                                ]
                            </button>
                        </div>
                    </div>
                )}
                {editPurchase && editId === editPurchase.id && ["PUR", "GRN"].includes((editPurchase.document_type || "PUR").toUpperCase()) && editPurchase.status === "cancelled" && editPurchase.converted_to && (
                    <div className={styles.formRow} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
                        <div className={styles.formGroup}>
                            <span className={styles.formLabel}>Αναφορά</span>
                            <button
                                type="button"
                                className={styles.convertedToLink}
                                onClick={handleOpenConvertedDoc}
                            >
                                Ακυρώθηκε →{" "}
                                {purchaseDocDisplayLabel(
                                    editPurchase.converted_to.document_type,
                                    editPurchase.converted_to.invoice_number,
                                    editPurchase.converted_to.id
                                )}
                            </button>
                        </div>
                    </div>
                )}
                {editPurchase && editId === editPurchase.id && (editPurchase.document_type || "").toUpperCase() === "PO" && (editPurchase.linked_documents?.length ?? 0) > 0 && (
                    <div className={styles.formRow} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
                        <div className={styles.formGroup} style={{ flex: 1 }}>
                            <span className={styles.formLabel}>Σχετικά έγγραφα</span>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                                {editPurchase.linked_documents!.map((doc) => (
                                    <button
                                        key={doc.id}
                                        type="button"
                                        className={styles.convertedToLink}
                                        onClick={() => {
                                            setShowPartialReturnPanel(false);
                    
                                            setPendingConvertedId(doc.id);
                                            setEditId(doc.id);
                                        }}
                                    >
                                        {purchaseDocDisplayLabel(doc.document_type, doc.invoice_number, doc.id)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {editPurchase &&
                    editId === editPurchase.id &&
                    (editPurchase.document_type || "").toUpperCase() === "GRN" &&
                    (editPurchase.source_purchase || editPurchase.converted_to) && (
                        <div className={styles.formRow} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
                            <div className={styles.formGroup} style={{ flex: 1 }}>
                                <span className={styles.formLabel}>Σχετικά έγγραφα</span>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                                    {editPurchase.source_purchase && (
                                        <button type="button" className={styles.convertedToLink} onClick={handleOpenSourcePoDoc}>
                                            {purchaseDocDisplayLabel(
                                                "PO",
                                                editPurchase.source_purchase.invoice_number,
                                                editPurchase.source_purchase.id
                                            )}
                                        </button>
                                    )}
                                    {editPurchase.converted_to && editPurchase.status !== "cancelled" && (
                                        <button type="button" className={styles.convertedToLink} onClick={handleOpenConvertedDoc}>
                                            {purchaseDocDisplayLabel(
                                                editPurchase.converted_to.document_type,
                                                editPurchase.converted_to.invoice_number,
                                                editPurchase.converted_to.id
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                {editPurchase &&
                    editId === editPurchase.id &&
                    (editPurchase.document_type || "").toUpperCase() === "PUR" &&
                    (editPurchase.source_grn || editPurchase.source_po || (editPurchase.linked_documents?.length ?? 0) > 0 || (editPurchase.payments?.length ?? 0) > 0) && (
                        <div className={styles.formRow} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
                            <div className={styles.formGroup} style={{ flex: 1 }}>
                                <span className={styles.formLabel}>Σχετικά έγγραφα</span>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                                    {editPurchase.source_po && (
                                        <button type="button" className={styles.convertedToLink} onClick={handleOpenSourcePoFromPur}>
                                            {purchaseDocDisplayLabel(
                                                editPurchase.source_po.document_type,
                                                editPurchase.source_po.invoice_number,
                                                editPurchase.source_po.id
                                            )}
                                        </button>
                                    )}
                                    {editPurchase.source_grn && (
                                        <button type="button" className={styles.convertedToLink} onClick={handleOpenSourceGrnDoc}>
                                            {purchaseDocDisplayLabel(
                                                editPurchase.source_grn.document_type,
                                                editPurchase.source_grn.invoice_number,
                                                editPurchase.source_grn.id
                                            )}
                                        </button>
                                    )}
                                    {editPurchase.linked_documents?.filter(d => (d.document_type || "").toUpperCase() === "DBN").map(doc => (
                                        <button
                                            key={doc.id}
                                            type="button"
                                            className={styles.convertedToLink}
                                            onClick={() => setEditId(doc.id)}
                                        >
                                            {purchaseDocDisplayLabel(doc.document_type, doc.invoice_number, doc.id)}
                                        </button>
                                    ))}
                                    {editPurchase.payments?.map(pay => (
                                        <button
                                            key={pay.id}
                                            type="button"
                                            className={styles.convertedToLink}
                                            onClick={() => {
                                                closePopup();
                                                navigate(`/payments?open=${pay.id}`);
                                            }}
                                        >
                                            {`PAY-${String(pay.id).padStart(4, "0")}`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                <div className={styles.slidingWrapper}>
                    <div
                        className={styles.slidingPanels}
                        style={{
                            transform:
                                showQuickCreateVendor ||
                                negativeStockConfirm ||
                                showPartialReturnPanel ||
                                deleteConfirmId !== null
                                    ? "translateX(-50%)"
                                    : undefined,
                        }}
                    >
                        <div className={styles.slidingPanel}>
                            {formErrors.store_id && (
                                <div className={styles.formError} style={{ marginBottom: 12 }}>
                                    {formErrors.store_id}
                                </div>
                            )}

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Κατάσταση</label>
                                    <div className={styles.statusReadOnly}>
                                        {getPurchaseStatusLabel(editId && editPurchase?.id === editId ? (editPurchase?.status ?? formStatus) : formStatus)}
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Προμηθευτής</label>
                                    <VendorSearchSelect
                                        value={formVendorId}
                                        onChange={(id) => {
                                            setFormVendorId(id);
                                            setShowQuickCreateVendor(false);
                                        }}
                                        onOpenQuickCreate={() => {
                                            setDeleteConfirmId(null);
                                            setDeleteNegativeStockConfirm(null);
                                            setShowQuickCreateVendor(true);
                                        }}
                                        placeholder="Επιλέξτε προμηθευτή (προαιρετικό)"
                                        disabled={isFormReadOnly || isGrnFromPo || isPurFromGrn}
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow} style={{ marginTop: 16 }}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Τύπος παραστατικού</label>
                                    <div className={styles.statusReadOnly}>
                                        {PURCHASE_DOC_TYPES.find((t) => t.value === formDocumentType)?.label ?? formDocumentType}
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>
                                        {docType === "PO" ? "Αριθμός παραγγελίας" : "Αριθμός παραστατικού"}
                                    </label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formInvoiceNumber}
                                        onChange={(e) => setFormInvoiceNumber(e.target.value)}
                                        placeholder={!editId ? "Αυτόματη αρίθμηση" : ""}
                                        disabled={((editId && editPurchase?.id === editId ? (editPurchase?.status || "").toLowerCase() : formStatus) !== "draft") || isFormReadOnly}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Ημερομηνία παραστατικού</label>
                                    <input
                                        type="date"
                                        className={styles.formInput}
                                        value={formInvoiceDate}
                                        onChange={(e) => setFormInvoiceDate(e.target.value)}
                                        disabled={isFormReadOnly}
                                    />
                                </div>
                            </div>

                            {formDocumentType === "PUR" && (
                                <div className={styles.formRow} style={{ marginTop: 16 }}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Όρος πληρωμής</label>
                                        <select
                                            className={styles.formSelect}
                                            value={formPaymentTerms}
                                            onChange={(e) => setFormPaymentTerms(e.target.value)}
                                            disabled={isFormReadOnly}
                                        >
                                            <option value="immediate">Αμέσως</option>
                                            <option value="15">15 ημέρες</option>
                                            <option value="30">30 ημέρες</option>
                                            <option value="60">60 ημέρες</option>
                                            <option value="90">90 ημέρες</option>
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Ημερομηνία λήξης</label>
                                        <input
                                            type="date"
                                            className={styles.formInput}
                                            value={formDueDate ?? ""}
                                            readOnly
                                            disabled
                                            style={{ backgroundColor: "var(--color-bg-muted, #f0f0f0)", cursor: "not-allowed" }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className={styles.formGroup} style={{ marginTop: 16 }}>
                                <label className={styles.formLabel}>Τρόπος πληρωμής *</label>
                                <select
                                    className={styles.formSelect}
                                    value={formPaymentMethodId}
                                    onChange={(e) => setFormPaymentMethodId(e.target.value)}
                                    disabled={isFormReadOnly || isGrnFromPo}
                                >
                                    <option value="">Επιλέξτε τρόπο πληρωμής</option>
                                    {paymentMethods
                                        .filter((pm) => pm.is_active)
                                        .map((pm) => (
                                            <option key={pm.id} value={pm.id}>
                                                {pm.name}
                                            </option>
                                        ))}
                                </select>
                                {formErrors.payment_method_id && (
                                    <span className={styles.formError}>{formErrors.payment_method_id}</span>
                                )}
                            </div>

                            <div className={styles.itemsSection}>
                                <div className={styles.itemsHeader}>
                                    <h4 className={styles.itemsTitle}>
                                        {docType === "GRN" ? "Παραλαβή ειδών" : docType === "PO" ? "Είδη παραγγελίας" : "Είδη"}
                                    </h4>
                                    <button type="button" className={styles.addItemBtn} onClick={addItemRow} disabled={isFormReadOnly || isPurFromGrn}>
                                        <Plus size={14} />
                                        {isGrnFromPo ? "Προσθήκη επιπλέον είδους (εκτός παραγγελίας)" : "Προσθήκη γραμμής"}
                                    </button>
                                </div>
                                {formItems.map((row) => {
                                    const lockPoLine = isGrnFromPo && row.poLineId != null && !row.isExtra;
                                    const poOrdered =
                                        row.poLineId != null && editPurchase?.source_purchase?.purchase_items
                                            ? editPurchase.source_purchase.purchase_items.find((pi) => pi.id === row.poLineId)
                                            : undefined;
                                    const orderedQty = poOrdered != null ? Number(poOrdered.quantity) : null;
                                    const recBefore =
                                        row.poLineId != null && editPurchase?.po_line_received_totals
                                            ? Number(
                                                  editPurchase.po_line_received_totals[String(row.poLineId)] ??
                                                      editPurchase.po_line_received_totals[row.poLineId] ??
                                                      0
                                              )
                                            : 0;
                                    const recv = Number(row.quantity) || 0;
                                    const overRecv =
                                        orderedQty != null && row.poLineId != null && recBefore + recv > orderedQty
                                            ? recBefore + recv - orderedQty
                                            : 0;
                                    const useOrderLineLayout = true;
                                    const qtyColumnClass = useOrderLineLayout ? styles.formGroupQtyGrn : "";
                                    const qtyLabel = docType === "GRN" ? "Παραληφθείσα ποσότητα" : "Ποσότητα";
                                    return (
                                    <div
                                        key={row.id}
                                        className={`${styles.itemRow} ${useOrderLineLayout ? styles.itemRowGrn : ""} ${isFormReadOnly ? styles.itemRowReadOnly : ""}`}
                                    >
                                <div className={`${styles.formGroup} ${styles.formGroupRelative}`}>
                                    <label className={styles.formLabel}>Παραλλαγή προϊόντος</label>
                                    <div className={styles.variantInputWrap}>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            placeholder="Αναζήτηση προϊόντος ή παραλλαγής..."
                                            disabled={isFormReadOnly || lockPoLine || isPurFromGrn}
                                            value={
                                                variantDropdownRowId === row.id
                                                    ? variantSearchByRow[row.id] ?? ""
                                                    : getSelectedVariantLabel(row)
                                            }
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setVariantSearchByRow((prev) => ({ ...prev, [row.id]: val }));
                                                if (val.trim() === "" && row.variantId) {
                                                    updateItemRow(row.id, "productId", "");
                                                }
                                            }}
                                            onFocus={() => {
                                                if (lockPoLine) return;
                                                setVariantDropdownRowId(row.id);
                                                if (row.variantId && (variantSearchByRow[row.id] ?? "") === "") {
                                                    setVariantSearchByRow((prev) => ({
                                                        ...prev,
                                                        [row.id]: getSelectedVariantLabel(row),
                                                    }));
                                                }
                                            }}
                                            onBlur={() => setTimeout(() => setVariantDropdownRowId(null), 150)}
                                        />
                                        {variantDropdownRowId === row.id && !lockPoLine && !isFormReadOnly && (
                                            <div
                                                className={styles.variantDropdown}
                                                onMouseDown={(e) => e.preventDefault()}
                                            >
                                                {getFilteredVariantsForRow(row.id).length === 0 ? (
                                                    <div className={styles.variantDropdownEmpty}>
                                                        Δεν βρέθηκαν παραλλαγές
                                                    </div>
                                                ) : (
                                                    getFilteredVariantsForRow(row.id).map((fv) => (
                                                        <button
                                                            key={`${fv.productId}-${fv.variant.id}`}
                                                            type="button"
                                                            className={styles.variantDropdownItem}
                                                            onClick={() =>
                                                                selectVariantForRow(row.id, fv)
                                                            }
                                                        >
                                                            {fv.label}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {row.isExtra && (
                                        <span className={styles.grnExtraBadge}>
                                            Επιπλέον (εκτός παραγγελίας)
                                        </span>
                                    )}
                                </div>
                                <div className={`${styles.formGroup} ${qtyColumnClass}`}>
                                    <label className={styles.formLabel}>{qtyLabel}</label>
                                    <input
                                        type="number"
                                        className={styles.formInput}
                                        min={1}
                                        placeholder="Ποσότ."
                                        value={row.quantity}
                                        onChange={(e) => updateItemRow(row.id, "quantity", e.target.value)}
                                        disabled={isFormReadOnly || isPurFromGrn}
                                    />
                                    {isGrnFromPo && row.poLineId != null && !row.isExtra && orderedQty != null && (
                                        <div className={styles.grnQtyMeta} title={`Παραγγελία: ${orderedQty} · Ήδη παραλήφθηκαν: ${recBefore}`}>
                                            Παραγγελία: {orderedQty} · Ήδη παραλήφθηκαν: {recBefore}
                                        </div>
                                    )}
                                    {overRecv > 0 && (
                                        <div className={styles.grnQtyOver}>
                                            Υπερ-παραλαβή: +{overRecv.toFixed(overRecv % 1 === 0 ? 0 : 2)} τεμ.
                                        </div>
                                    )}
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Τιμή χωρίς ΦΠΑ</label>
                                    <input
                                        type="number"
                                        className={styles.formInput}
                                        min={0}
                                        step={0.01}
                                        placeholder="0.00"
                                        value={row.costPriceWithoutVat}
                                        onChange={(e) => updateItemRow(row.id, "costPriceWithoutVat", e.target.value)}
                                        onBlur={(e) => {
                                            const v = parseFloat(e.target.value);
                                            if (!isNaN(v) && v >= 0) {
                                                updateItemRow(row.id, "costPriceWithoutVat", (Math.round(v * 100) / 100).toFixed(2));
                                            }
                                        }}
                                        disabled={isFormReadOnly || lockPoLine}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Τιμή με ΦΠΑ</label>
                                    <input
                                        type="number"
                                        className={styles.formInput}
                                        min={0}
                                        step={0.01}
                                        placeholder="0.00"
                                        value={
                                            row.variantId
                                                ? (row.vatExempt && row.priceWithVatWhenExempt != null
                                                      ? row.priceWithVatWhenExempt
                                                      : getCostPriceWithVat(row)
                                                  ).toFixed(2)
                                                : ""
                                        }
                                        onChange={(e) => {
                                            const withVat = parseFloat(e.target.value);
                                            if (!isNaN(withVat) && withVat >= 0) {
                                                setPriceFromWithVat(row.id, withVat);
                                            }
                                        }}
                                        disabled={row.vatExempt || isFormReadOnly || lockPoLine}
                                    />
                                </div>
                                <div className={styles.checkboxGroup}>
                                    <label className={styles.formLabel}>Απαλλαγή ΦΠΑ</label>
                                    <div className={styles.checkboxWrapper}>
                                        <input
                                            type="checkbox"
                                            checked={row.vatExempt}
                                            onChange={(e) => updateItemRow(row.id, "vatExempt", e.target.checked)}
                                            disabled={isFormReadOnly || lockPoLine}
                                        />
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Σύνολο</label>
                                    <div className={styles.lineTotalReadOnly}>
                                        {formatCurrency(getLineTotalCost(row))}
                                    </div>
                                </div>
                                <div className={styles.removeItemCell}>
                                    <button
                                        type="button"
                                        className={styles.removeItemBtn}
                                        onClick={() => removeItemRow(row.id)}
                                        title="Αφαίρεση"
                                        disabled={isFormReadOnly || isPurFromGrn}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                    </div>
                                    </div>
                                    );
                                })}
                                {formErrors.items && <span className={styles.formError}>{formErrors.items}</span>}

                                <div className={styles.totalsRow}>
                                    <div className={styles.totalsBox}>
                                        <div className={styles.totalLabel}>Υποσύνολο</div>
                                        <div className={styles.totalValue}>{formatCurrency(subtotal)}</div>
                                    </div>
                                    <div className={styles.totalsBox}>
                                        <div className={styles.totalLabel}>ΦΠΑ</div>
                                        <div className={styles.totalValue}>{formatCurrency(vatTotal)}</div>
                                    </div>
                                    <div className={styles.totalsBox}>
                                        <div className={styles.totalLabel}>Σύνολο</div>
                                        <div className={styles.totalValue}>{formatCurrency(totalAmount)}</div>
                                    </div>
                                </div>
                            </div>

                            {formDocumentType === "PUR" && (editPurchase?.status || "").toLowerCase() === "completed" && editPurchase && editId === editPurchase.id && (
                                <div className={styles.paymentSection} style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
                                    <div className={styles.formRow} style={{ flexWrap: "wrap", gap: 12 }}>
                                        <span>
                                            Κατάσταση πληρωμής:{" "}
                                            <span className={styles[`paymentStatus_${(editPurchase.payment_status || "unpaid")}`] ?? styles.paymentStatus_unpaid}>
                                                {PAYMENT_STATUS_LABELS[editPurchase.payment_status as keyof typeof PAYMENT_STATUS_LABELS] ?? editPurchase.payment_status ?? "—"}
                                            </span>
                                        </span>
                                        {(editPurchase.amount_due ?? 0) > 0 && (
                                            <>
                                                <span>Υπόλοιπο: {formatCurrency(editPurchase.amount_due ?? 0)}</span>
                                                {editPurchase.due_date && <span>Προθεσμία: {formatDate(editPurchase.due_date)}</span>}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className={styles.formGroup} style={{ marginTop: 16 }}>
                                <label className={styles.formLabel}>Σημειώσεις</label>
                                <textarea
                                    className={styles.formInput}
                                    value={formNotes}
                                    onChange={(e) => setFormNotes(e.target.value)}
                                    placeholder="Προαιρετικές σημειώσεις"
                                    rows={2}
                                    disabled={isFormReadOnly}
                                />
                            </div>
                        </div>

                        <div className={styles.slidingPanel}>
                            {deleteConfirmId !== null ? (
                                <div className={styles.quickCreateForm}>
                                    {deleteNegativeStockConfirm ? (
                                        <>
                                            <p style={{ marginBottom: 12 }}>
                                                Τα ακόλουθα προϊόντα θα έχουν αρνητικό απόθεμα. Θέλετε να συνεχίσετε;
                                            </p>
                                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                                {deleteNegativeStockConfirm.map((it, i) => (
                                                    <li key={i} style={{ marginBottom: 4 }}>
                                                        <strong>{it.product_name}</strong> ({it.variant_name}): απαιτείται {it.required}, διαθέσιμα {it.available}
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    ) : (
                                        <p className={styles.deleteConfirmText}>
                                            Θέλετε να διαγράψετε αυτή την αγορά; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
                                        </p>
                                    )}
                                </div>
                            ) : negativeStockConfirm ? (
                                <div className={styles.quickCreateForm}>
                                    <p style={{ marginBottom: 12 }}>
                                        Τα ακόλουθα προϊόντα θα έχουν αρνητικό απόθεμα. Θέλετε να συνεχίσετε;
                                    </p>
                                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                                        {negativeStockConfirm.insufficientItems.map((it, i) => (
                                            <li key={i} style={{ marginBottom: 4 }}>
                                                <strong>{it.product_name}</strong> ({it.variant_name}): απαιτείται {it.required}, διαθέσιμα {it.available}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : showPartialReturnPanel ? (
                                <div className={styles.quickCreateForm}>
                                    <p style={{ marginBottom: 16 }}>Επιλέξτε ποσότητα επιστροφής για κάθε γραμμή:</p>
                                    {(editPurchase?.purchase_items || []).map((it) => {
                                        const prod = products.find((p) => p.id === it.product_id);
                                        const variant = prod?.variants?.find((v) => v.id === it.product_variant_id);
                                        const label = prod && variant ? `${prod.name} — ${variant.name}` : `#${it.id}`;
                                        const maxQty = it.quantity;
                                        const qty = partialReturnQuantities[it.id] ?? 0;
                                        return (
                                            <div key={it.id} className={styles.formRow} style={{ marginBottom: 12, alignItems: "center" }}>
                                                <div style={{ flex: 2 }}>{label}</div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={maxQty}
                                                        value={qty}
                                                        onChange={(e) => {
                                                            const v = Math.min(maxQty, Math.max(1, parseInt(e.target.value, 10) || 1));
                                                            setPartialReturnQuantities((prev) => ({ ...prev, [it.id]: v }));
                                                        }}
                                                        className={styles.formInput}
                                                        style={{ width: 80 }}
                                                    />
                                                    <span>/ {maxQty}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className={styles.quickCreateForm}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Όνομα προμηθευτή *</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={qcVendorName}
                                        onChange={(e) => { setQcVendorName(e.target.value); setQcVendorErrors((prev) => ({ ...prev, name: "" })); }}
                                        placeholder="π.χ. Εταιρεία ΑΕ"
                                    />
                                    {qcVendorErrors.name && (
                                        <span className={styles.formError}>{qcVendorErrors.name}</span>
                                    )}
                                </div>
                                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                                    <label className={styles.formLabel}>Όνομα επικοινωνίας</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={qcVendorContactName}
                                        onChange={(e) => setQcVendorContactName(e.target.value)}
                                        placeholder="π.χ. Γιώργος Παπαδόπουλος"
                                    />
                                </div>
                                <div className={styles.formRow} style={{ marginTop: 16 }}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Τηλέφωνο</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={qcVendorPhone}
                                            onChange={(e) => setQcVendorPhone(e.target.value)}
                                            placeholder="π.χ. 6945001122"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Email</label>
                                        <input
                                            type="email"
                                            className={styles.formInput}
                                            value={qcVendorEmail}
                                            onChange={(e) => setQcVendorEmail(e.target.value)}
                                            placeholder="π.χ. email@example.com"
                                        />
                                    </div>
                                </div>
                            </div>
                                )}
                        </div>
                    </div>
                </div>
            </SidePopup>
        </div>
    );
}
