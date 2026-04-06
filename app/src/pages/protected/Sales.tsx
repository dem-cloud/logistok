import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, FileDown, Mail, Repeat, Check, Banknote, RotateCcw, Package, XCircle, Link2, X, Receipt, FileText } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/contexts/AuthContext";
import {
    useSales,
    useSale,
    useSaleMutations,
    type CreateSaleParams,
    type UpdateSaleParams,
    type SaleItemInput,
    type Sale,
} from "@/hooks/useSales";
import { axiosPrivate } from "@/api/axios";
import { useProducts, type ProductVariant } from "@/hooks/useProducts";
import { useStoreProducts } from "@/hooks/useInventory";
import { useCustomers, useCustomerMutations } from "@/hooks/useCustomers";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import SidePopup from "@/components/reusable/SidePopup";
import Button from "@/components/reusable/Button";
import LoadingSpinner from "@/components/LoadingSpinner";
import DocTypeBadge from "@/components/DocTypeBadge";
import StatusBadge from "@/components/StatusBadge";
import { SALES_DOC_TYPES, SALES_NEW_DOC_OPTIONS, getSalesStatusLabel, type SalesDocType } from "@/config/documentTypes";
import { getSalesButtons, SALES_ACTION_ICON } from "@/config/documentActions";
import { getSoCancelBlockMessageFromLinked } from "@/config/parentCancelGuards";
import type { FooterButton } from "@/components/reusable/SidePopup";
import styles from "./Sales.module.css";

function saleItemsToPatchPayload(sale: Sale): SaleItemInput[] {
    return (sale.sale_items ?? []).map((it) => ({
        product_id: it.product_id,
        product_variant_id: it.product_variant_id,
        quantity: it.quantity,
        sale_price: it.sale_price,
        vat_rate: it.vat_rate,
        vat_exempt: it.vat_exempt,
    }));
}

const SALE_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    Mail,
    FileDown,
    Trash2,
    Check,
    Banknote,
    RotateCcw,
    Package,
    XCircle,
    Link2,
    X,
    Receipt,
    FileText,
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
    unpaid: "Απλήρωτο",
    partial: "Μερική",
    paid: "Πληρωμένο",
    overdue: "Εκπροθεσμο",
};

function normalizeDocType(v: string): SalesDocType {
    const u = (v || "").toUpperCase();
    if (u === "RECEIPT") return "REC";
    if (u === "INVOICE") return "INV";
    if (["QUO", "SO", "REC", "INV", "CRN", "DNO"].includes(u)) return u as SalesDocType;
    return "REC";
}

type LineItemRow = {
    id: string;
    productId: number | "";
    variantId: number | "";
    quantity: string;
    salePriceWithoutVat: string;
    vatRate: number;
    vatExempt: boolean;
    productVatRate: number;
    priceWithVatWhenExempt?: number;
};

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

export default function Sales() {
    const { activeStore, activeCompany, showToast } = useAuth();
    const [searchFilter, setSearchFilter] = useState("");
    const [customerFilter, setCustomerFilter] = useState<string>("");
    const [documentTypeFilter, setDocumentTypeFilter] = useState<string>("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [popupOpen, setPopupOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [deleteNegativeStockConfirm, setDeleteNegativeStockConfirm] = useState<
        Array<{ product_name: string; variant_name: string; required: number; available: number }> | null
    >(null);
    const [variantDropdownRowId, setVariantDropdownRowId] = useState<string | null>(null);
    const [variantSearchByRow, setVariantSearchByRow] = useState<Record<string, string>>({});
    const [convertDropdownSaleId, setConvertDropdownSaleId] = useState<number | null>(null);
    const convertDropdownRef = useRef<HTMLDivElement>(null);
    const openedWithStatusRef = useRef<string | null>(null);
    const searchDebounced = useDebounce(searchFilter.trim(), 300);

    const { sales, isLoading, isFetching } = useSales({
        storeId: activeStore?.id ?? undefined,
        customerId: customerFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: searchDebounced || undefined,
        documentType: documentTypeFilter || undefined,
        status: statusFilter || undefined,
    });

    const { sale: editSale, isLoading: editLoading } = useSale(editId);
    const { customers } = useCustomers();
    const { products } = useProducts();
    const { storeProducts } = useStoreProducts({ storeId: activeStore?.id ?? undefined });
    const { paymentMethods } = usePaymentMethods();
    const mutations = useSaleMutations();
    const customerMutations = useCustomerMutations();
    const queryClient = useQueryClient();

    const [showQuickCreateCustomer, setShowQuickCreateCustomer] = useState(false);
    const [qcCustomerFullName, setQcCustomerFullName] = useState("");
    const [qcCustomerPhone, setQcCustomerPhone] = useState("");
    const [qcCustomerEmail, setQcCustomerEmail] = useState("");
    const [qcCustomerTaxId, setQcCustomerTaxId] = useState("");
    const [qcCustomerErrors, setQcCustomerErrors] = useState<Record<string, string>>({});

    const [formInvoiceType, setFormInvoiceType] = useState<SalesDocType>("REC");
    const [formStatus, setFormStatus] = useState<string>("draft");
    const [formInvoiceDate, setFormInvoiceDate] = useState("");
    const [formExpiryDate, setFormExpiryDate] = useState("");
    const [formCustomerId, setFormCustomerId] = useState<string>("");
    const [formPaymentMethodId, setFormPaymentMethodId] = useState<string>("");
    const [formInvoiceNumber, setFormInvoiceNumber] = useState("");
    const [formNotes, setFormNotes] = useState("");
    const [formAmountPaid, setFormAmountPaid] = useState("");
    const [formItems, setFormItems] = useState<LineItemRow[]>([
        { id: "0", productId: "", variantId: "", quantity: "", salePriceWithoutVat: "", vatRate: 0, vatExempt: false, productVatRate: 0 },
    ]);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [negativeStockConfirm, setNegativeStockConfirm] = useState<{
        insufficientItems: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
        pendingParams: CreateSaleParams | ({ id: number } & UpdateSaleParams);
    } | null>(null);

    const [showSendEmailPanel, setShowSendEmailPanel] = useState(false);
    const [sendEmailAddress, setSendEmailAddress] = useState("");
    const [sendEmailUpdateCustomer, setSendEmailUpdateCustomer] = useState(false);
    const [sendEmailErrors, setSendEmailErrors] = useState<Record<string, string>>({});
    const [sendEmailSending, setSendEmailSending] = useState(false);
    const [showPartialReturnPanel, setShowPartialReturnPanel] = useState(false);
    const [partialReturnQuantities, setPartialReturnQuantities] = useState<Record<number, number>>({});
    const [pendingConvertedId, setPendingConvertedId] = useState<number | null>(null);
    const [formPaymentTerms, setFormPaymentTerms] = useState<"immediate" | "15" | "30" | "60" | "90">("immediate");
    const [showReceiptPanel, setShowReceiptPanel] = useState(false);
    const [receiptAmount, setReceiptAmount] = useState("");
    const [receiptPaymentMethodId, setReceiptPaymentMethodId] = useState("");
    const [receiptPaymentDate, setReceiptPaymentDate] = useState(new Date().toISOString().slice(0, 10));
    const [receiptNotes, setReceiptNotes] = useState("");
    const [receiptErrors, setReceiptErrors] = useState<Record<string, string>>({});
    const [receiptSaving, setReceiptSaving] = useState(false);

    const isQuoReadOnly = !!(
        formInvoiceType === "QUO" &&
        editId &&
        editSale &&
        editSale.id === editId &&
        ["converted", "expired", "cancelled"].includes((editSale.status || "").toLowerCase())
    );

    const isCompletedRecInvReadOnly = !!(
        editId &&
        editSale &&
        editSale.id === editId &&
        (formInvoiceType === "REC" || formInvoiceType === "INV") &&
        (editSale.status || "").toLowerCase() === "completed"
    );

    const isRecInvCancelledReadOnly = !!(
        editId &&
        editSale &&
        editSale.id === editId &&
        (formInvoiceType === "REC" || formInvoiceType === "INV") &&
        (editSale.status || "").toLowerCase() === "cancelled"
    );

    const isFormReadOnly = isQuoReadOnly || isCompletedRecInvReadOnly || isRecInvCancelledReadOnly;

    const storeProductsByVariant = useMemo(() => {
        const map: Record<string, number> = {};
        for (const sp of storeProducts) {
            if (sp.store_sale_price != null) {
                map[`${sp.product_id}-${sp.product_variant_id}`] = sp.store_sale_price;
            }
        }
        return map;
    }, [storeProducts]);

    const resetForm = useCallback(() => {
        setFormInvoiceType("REC");
        setFormStatus("draft");
        setFormInvoiceDate(new Date().toISOString().slice(0, 10));
        setFormExpiryDate("");
        setFormCustomerId("");
        setFormPaymentMethodId("");
        setFormInvoiceNumber("");
        setFormNotes("");
        setFormAmountPaid("");
        setFormItems([
            { id: "0", productId: "", variantId: "", quantity: "", salePriceWithoutVat: "", vatRate: 0, vatExempt: false, productVatRate: 0 },
        ]);
        setFormErrors({});
        setFormPaymentTerms("immediate");
        setVariantDropdownRowId(null);
        setVariantSearchByRow({});
    }, []);

    const [newDocDropdownOpen, setNewDocDropdownOpen] = useState(false);
    const newDocDropdownRef = useRef<HTMLDivElement>(null);

    const openCreate = useCallback((docType?: SalesDocType) => {
        setEditId(null);
        resetForm();
        if (docType) setFormInvoiceType(docType);
        setPopupOpen(true);
        setNewDocDropdownOpen(false);
    }, [resetForm]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (newDocDropdownRef.current && !newDocDropdownRef.current.contains(e.target as Node)) setNewDocDropdownOpen(false);
        };
        document.addEventListener("click", handler);
        return () => document.removeEventListener("click", handler);
    }, []);

    const openEdit = useCallback(
        (s: Sale) => {
            setEditId(s.id);
            openedWithStatusRef.current = s.status || "draft";
            setFormStatus(s.status || "draft");
            setFormInvoiceType(normalizeDocType(s.invoice_type));
            setFormInvoiceDate(s.invoice_date ? s.invoice_date.slice(0, 10) : "");
            setFormExpiryDate(s.expiry_date ? s.expiry_date.slice(0, 10) : "");
            const pt = (s as Sale & { payment_terms?: string }).payment_terms;
            setFormPaymentTerms(pt && ["15", "30", "60", "90"].includes(pt) ? (pt as "15" | "30" | "60" | "90") : "immediate");
            setFormCustomerId(s.customer_id ?? "");
            setFormPaymentMethodId(s.payment_method_id);
            setFormInvoiceNumber(s.invoice_number ?? "");
            setFormNotes(s.notes ?? "");
            setFormAmountPaid(s.amount_paid != null ? String(s.amount_paid) : "");
            setFormItems(
                s.sale_items?.length
                    ? s.sale_items.map((it) => {
                          const prod = products.find((x) => x.id === it.product_id);
                          const productVatRate = prod?.vat_exempt ? 0 : (prod?.vat_rate?.rate ?? it.vat_rate ?? 0);
                          const exempt = it.vat_exempt ?? false;
                          return {
                              id: `item-${it.id}`,
                              productId: it.product_id,
                              variantId: it.product_variant_id,
                              quantity: String(it.quantity),
                              salePriceWithoutVat: String(Number(it.sale_price).toFixed(2)),
                              vatRate: it.vat_rate ?? 0,
                              vatExempt: exempt,
                              productVatRate: exempt ? productVatRate : (it.vat_rate ?? 0),
                              priceWithVatWhenExempt: exempt ? Number(it.sale_price) : undefined,
                          };
                      })
                    : [{ id: "0", productId: "", variantId: "", quantity: "", salePriceWithoutVat: "", vatRate: 0, vatExempt: false, productVatRate: 0 }]
            );
            setFormErrors({});
            setVariantDropdownRowId(null);
            setVariantSearchByRow({});
            setPopupOpen(true);
        },
        [products]
    );

    const closePopup = useCallback(() => {
        setPopupOpen(false);
        setEditId(null);
        openedWithStatusRef.current = null;
        setShowQuickCreateCustomer(false);
        setShowSendEmailPanel(false);
        setShowPartialReturnPanel(false);
        setShowReceiptPanel(false);
        setPartialReturnQuantities({});
        setSendEmailAddress("");
        setSendEmailUpdateCustomer(false);
        setSendEmailErrors({});
        setQcCustomerFullName("");
        setQcCustomerPhone("");
        setQcCustomerEmail("");
        setQcCustomerTaxId("");
        setQcCustomerErrors({});
        resetForm();
    }, [resetForm]);

    const openSendEmail = useCallback(
        (sale: Sale) => {
            openEdit(sale);
            setShowSendEmailPanel(true);
            setSendEmailAddress("");
            setSendEmailUpdateCustomer(false);
            setSendEmailErrors({});
        },
        [openEdit]
    );

    const openPartialReturn = useCallback(
        (sale: Sale) => {
            openEdit(sale);
            setShowPartialReturnPanel(true);
            const init: Record<number, number> = {};
            for (const it of sale.sale_items || []) {
                init[it.id] = it.quantity;
            }
            setPartialReturnQuantities(init);
        },
        [openEdit]
    );

    const handleOpenConvertedDoc = useCallback(() => {
        if (!editSale?.converted_to) return;
        setShowSendEmailPanel(false);
        setShowPartialReturnPanel(false);
        setShowQuickCreateCustomer(false);
        setPendingConvertedId(editSale.converted_to.id);
        setEditId(editSale.converted_to.id);
    }, [editSale?.converted_to]);

    const handleOpenReturnFromDoc = useCallback(() => {
        if (!editSale?.return_from) return;
        setShowSendEmailPanel(false);
        setShowPartialReturnPanel(false);
        setShowQuickCreateCustomer(false);
        setPendingConvertedId(editSale.return_from.id);
        setEditId(editSale.return_from.id);
    }, [editSale?.return_from]);

    useEffect(() => {
        if (pendingConvertedId && editSale?.id === pendingConvertedId) {
            openEdit(editSale);
            setPendingConvertedId(null);
        }
    }, [pendingConvertedId, editSale, openEdit]);

    useEffect(() => {
        if (
            showSendEmailPanel &&
            editId &&
            editSale &&
            editSale.id === editId &&
            sendEmailAddress === ""
        ) {
            setSendEmailAddress(editSale.customer?.email?.trim() ?? "");
        }
    }, [showSendEmailPanel, editId, editSale, sendEmailAddress]);

    useEffect(() => {
        if (formInvoiceType !== "INV" || isCompletedRecInvReadOnly) return;
        const cust = customers.find((c) => String(c.id) === formCustomerId);
        const pt = cust && "payment_terms" in cust ? (cust as { payment_terms?: string }).payment_terms : null;
        if (pt && ["15", "30", "60", "90"].includes(pt)) {
            setFormPaymentTerms(pt as "15" | "30" | "60" | "90");
        } else if (formCustomerId) {
            setFormPaymentTerms("immediate");
        }
    }, [formInvoiceType, formCustomerId, customers, isCompletedRecInvReadOnly]);

    useEffect(() => {
        if (editSale && editId && editId === editSale.id && popupOpen && formItems.length > 0 && formItems[0].productId === "") {
            openEdit(editSale);
        }
    }, [editSale, editId, popupOpen, openEdit]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (convertDropdownSaleId != null && convertDropdownRef.current && !convertDropdownRef.current.contains(e.target as Node)) {
                setConvertDropdownSaleId(null);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [convertDropdownSaleId]);

    const flattenedVariants = useMemo(() => {
        const out: {
            productId: number;
            productName: string;
            product: { id: number; vat_rate?: { rate: number } | null; vat_exempt?: boolean };
            variant: ProductVariant;
            label: string;
        }[] = [];
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

    const selectVariantForRow = (
        rowId: string,
        fv: { productId: number; product: { vat_rate?: { rate: number } | null; vat_exempt?: boolean }; variant: ProductVariant }
    ) => {
        const vatExempt = fv.product.vat_exempt === true;
        const productVatRate = fv.product.vat_rate?.rate ?? 0;
        const vatRate = vatExempt ? 0 : productVatRate;
        const storePrice =
            storeProductsByVariant[`${fv.productId}-${fv.variant.id}`] ??
            (fv.variant.sale_price != null ? fv.variant.sale_price : (fv.variant.cost_price != null ? fv.variant.cost_price : 0));
        const saleWithout = storePrice > 0 ? Math.round(storePrice * 100) / 100 : 0;
        const priceWithoutVal = saleWithout > 0 ? saleWithout.toFixed(2) : "";
        const exemptPriceDisplay = vatExempt && saleWithout > 0 ? saleWithout : undefined;
        setFormItems((prev) =>
            prev.map((r) =>
                r.id !== rowId
                    ? r
                    : {
                          ...r,
                          productId: fv.productId,
                          variantId: fv.variant.id,
                          salePriceWithoutVat: priceWithoutVal,
                          vatRate,
                          vatExempt,
                          productVatRate,
                          priceWithVatWhenExempt: exemptPriceDisplay,
                      }
            )
        );
        setVariantDropdownRowId(null);
        setVariantSearchByRow((prev) => ({ ...prev, [rowId]: "" }));
    };

    const getFilteredVariantsForRow = (rowId: string) => {
        const search = (variantSearchByRow[rowId] ?? "").trim().toLowerCase();
        if (!search) return flattenedVariants;
        return flattenedVariants.filter(
            (fv) => fv.label.toLowerCase().includes(search) || fv.variant.sku?.toLowerCase().includes(search)
        );
    };

    const getSelectedVariantLabel = (row: LineItemRow) => {
        if (!row.productId || !row.variantId) return "";
        const p = products.find((x) => x.id === Number(row.productId));
        const v = p?.variants.find((x) => x.id === Number(row.variantId));
        if (!p || !v) return "";
        return `${p.name} — ${v.name}${v.sku ? ` (${v.sku})` : ""}`;
    };

    const addItemRow = () => {
        setFormItems((prev) => [
            ...prev,
            {
                id: `row-${Date.now()}`,
                productId: "",
                variantId: "",
                quantity: "",
                salePriceWithoutVat: "",
                vatRate: 0,
                vatExempt: false,
                productVatRate: 0,
            },
        ]);
    };

    const removeItemRow = (id: string) => {
        setFormItems((prev) => {
            const next = prev.filter((r) => r.id !== id);
            return next.length === 0
                ? [
                      {
                          id: `empty-${Date.now()}`,
                          productId: "",
                          variantId: "",
                          quantity: "",
                          salePriceWithoutVat: "",
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
                    next.salePriceWithoutVat = "";
                    next.vatRate = 0;
                    next.vatExempt = false;
                    next.productVatRate = 0;
                    next.priceWithVatWhenExempt = undefined;
                }
                if (field === "vatExempt") {
                    const exempt = value === true;
                    next.vatRate = exempt ? 0 : (r.productVatRate || r.vatRate || 0);
                    if (exempt) {
                        const without = Number(r.salePriceWithoutVat) || 0;
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
                return { ...r, salePriceWithoutVat: (Math.round(withoutVat * 100) / 100).toFixed(2) };
            })
        );
    };

    const getSalePriceWithVat = (row: LineItemRow): number => {
        const without = Number(row.salePriceWithoutVat) || 0;
        const rate = row.vatExempt ? 0 : (row.vatRate ?? 0);
        return Math.round(without * (1 + rate) * 100) / 100;
    };

    const getLineTotal = (row: LineItemRow): number => {
        const q = Number(row.quantity) || 0;
        const p = Number(row.salePriceWithoutVat) || 0;
        if (!row.productId || !row.variantId || q <= 0) return 0;
        return Math.round(q * p * 100) / 100;
    };

    const getLineVatAmount = (row: LineItemRow): number => {
        const lineTotal = getLineTotal(row);
        const rate = row.vatExempt ? 0 : (row.vatRate ?? 0);
        return Math.round(lineTotal * rate * 100) / 100;
    };

    const { subtotal, vatTotal, totalAmount } = useMemo(() => {
        let st = 0;
        let vt = 0;
        for (const r of formItems) {
            st += getLineTotal(r);
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

    const amountPaidNum = parseFloat(formAmountPaid) || 0;
    const changeReturned = Math.round((amountPaidNum - totalAmount) * 100) / 100;
    const isCashPayment = paymentMethods.find((pm) => pm.id === formPaymentMethodId)?.key === "cash";

    const validateForm = (): boolean => {
        const err: Record<string, string> = {};
        if (!activeStore?.id) err.store_id = "Επιλέξτε κατάστημα από την πλευρική μπάρα";
        if (!formPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        const needsCustomerWithTaxId = formInvoiceType === "INV" || formInvoiceType === "CRN";
        if (needsCustomerWithTaxId) {
            if (!formCustomerId?.trim()) err.customer_id = "Για τιμολόγιο απαιτείται πελάτης";
            else {
                const cust = customers.find((c) => String(c.id) === formCustomerId);
                if (cust && (!cust.tax_id || !String(cust.tax_id).trim()))
                    err.customer_id = "Ο πελάτης πρέπει να έχει ΑΦΜ για τιμολόγιο";
            }
        }
        const validItems = formItems.filter(
            (r) =>
                r.productId !== "" &&
                r.variantId !== "" &&
                Number(r.quantity) > 0 &&
                Number(r.salePriceWithoutVat) >= 0
        );
        if (validItems.length === 0) err.items = "Προσθέστε τουλάχιστον ένα είδος με ποσότητα και τιμή";
        setFormErrors(err);
        return Object.keys(err).length === 0;
    };

    const buildItems = (): SaleItemInput[] => {
        const validItems = formItems.filter(
            (r) =>
                r.productId !== "" &&
                r.variantId !== "" &&
                Number(r.quantity) > 0 &&
                Number(r.salePriceWithoutVat) >= 0
        );
        return validItems.map((r) => {
            const vatExempt = r.vatExempt === true;
            const vatRate = vatExempt ? 0 : (r.vatRate ?? 0);
            return {
                product_id: Number(r.productId),
                product_variant_id: Number(r.variantId),
                quantity: Number(r.quantity),
                sale_price: Number(r.salePriceWithoutVat),
                vat_rate: vatRate,
                vat_exempt: vatExempt,
            };
        });
    };

    const handleSave = async (statusOverride?: string) => {
        if (!validateForm()) return;

        const statusToUse = statusOverride ?? formStatus;
        const items = buildItems();
        const todayIso = new Date().toISOString().slice(0, 10);
        const baseParams = {
            customer_id: (formInvoiceType === "INV" || formInvoiceType === "CRN") ? formCustomerId : (formCustomerId || null),
            payment_method_id: formPaymentMethodId,
            invoice_type: formInvoiceType,
            invoice_number: formInvoiceNumber.trim() || null,
            invoice_date: formInvoiceDate.trim() || todayIso,
            expiry_date: formInvoiceType === "QUO" ? (formExpiryDate.trim() || null) : undefined,
            notes: formNotes.trim() || null,
            amount_paid: amountPaidNum > 0 ? amountPaidNum : totalAmount,
            status: statusToUse,
            items,
            ...(formInvoiceType === "INV" && { payment_terms: formPaymentTerms }),
        };

        try {
            if (editId) {
                const params: UpdateSaleParams = {
                    ...baseParams,
                    status: baseParams.status as UpdateSaleParams["status"],
                };
                await mutations.updateSale.mutateAsync({ id: editId, ...params });
                showToast({ message: "Η πώληση ενημερώθηκε επιτυχώς", type: "success" });
            } else {
                const statusForCreate = statusToUse === "draft" || statusToUse === "completed" ? statusToUse : "draft";
                const params: CreateSaleParams = {
                    store_id: activeStore!.id,
                    ...baseParams,
                    status: statusForCreate,
                };
                await mutations.createSale.mutateAsync(params);
                showToast({ message: "Η πώληση δημιουργήθηκε επιτυχώς", type: "success" });
            }
            closePopup();
        } catch (e: unknown) {
            const err = e as Error & {
                requires_negative_stock_confirmation?: boolean;
                insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
            };
            if (err.requires_negative_stock_confirmation && err.insufficientItems?.length) {
                const createStatus = statusToUse === "draft" || statusToUse === "completed" ? statusToUse : "draft";
                const pending =
                    editId
                        ? ({ id: editId, ...baseParams } as { id: number } & UpdateSaleParams)
                        : ({ store_id: activeStore!.id, ...baseParams, status: createStatus } as CreateSaleParams);
                setNegativeStockConfirm({ insufficientItems: err.insufficientItems, pendingParams: pending });
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
            if ("id" in params) {
                const { id, ...rest } = params;
                await mutations.updateSale.mutateAsync({ id, ...rest });
                showToast({ message: "Η πώληση ενημερώθηκε επιτυχώς", type: "success" });
            } else {
                await mutations.createSale.mutateAsync(params);
                showToast({ message: "Η πώληση δημιουργήθηκε επιτυχώς", type: "success" });
            }
            closePopup();
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await mutations.deleteSale.mutateAsync({ id });
            showToast({ message: "Η πώληση διαγράφηκε επιτυχώς", type: "success" });
            setDeleteConfirmId(null);
            setDeleteNegativeStockConfirm(null);
        } catch (e: unknown) {
            const err = e as Error & {
                requires_negative_stock_confirmation?: boolean;
                insufficientItems?: Array<{ product_name: string; variant_name: string; required: number; available: number }>;
            };
            if (err.requires_negative_stock_confirmation && err.insufficientItems?.length) {
                setDeleteNegativeStockConfirm(err.insufficientItems);
                return;
            }
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleDeleteConfirm = async (id: number) => {
        try {
            await mutations.deleteSale.mutateAsync({ id, confirm_negative_stock: true });
            showToast({ message: "Η πώληση διαγράφηκε επιτυχώς", type: "success" });
            setDeleteConfirmId(null);
            setDeleteNegativeStockConfirm(null);
        } catch (e: unknown) {
            const err = e as Error;
            showToast({ message: err.message || "Σφάλμα", type: "error" });
        }
    };

    const handleSendSaleEmail = async () => {
        const email = sendEmailAddress.trim();
        const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!email || !validEmail) {
            setSendEmailErrors({ email: "Παρακαλώ εισάγετε έγκυρη διεύθυνση email" });
            return;
        }
        setSendEmailErrors({});
        if (!editId) return;
        setSendEmailSending(true);
        try {
            await axiosPrivate.post(`/api/shared/company/sales/${editId}/send-email`, {
                email,
                update_customer_email: sendEmailUpdateCustomer,
            });
            showToast({ message: "Το email στάλθηκε επιτυχώς", type: "success" });
            setShowSendEmailPanel(false);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } };
            showToast({ message: err.response?.data?.message || "Σφάλμα κατά την αποστολή", type: "error" });
        } finally {
            setSendEmailSending(false);
        }
    };

    const handleSaveCustomerQuickCreate = async () => {
        const err: Record<string, string> = {};
        if (!qcCustomerFullName.trim()) err.full_name = "Το όνομα πελάτη είναι υποχρεωτικό";
        if ((formInvoiceType === "INV" || formInvoiceType === "CRN") && !qcCustomerTaxId.trim()) err.tax_id = "Για τιμολόγιο απαιτείται ΑΦΜ";
        setQcCustomerErrors(err);
        if (Object.keys(err).length > 0) return;

        try {
            const customer = await customerMutations.createCustomer.mutateAsync({
                full_name: qcCustomerFullName.trim(),
                phone: qcCustomerPhone.trim() || undefined,
                email: qcCustomerEmail.trim() || undefined,
                tax_id: qcCustomerTaxId.trim() || undefined,
            });
            setFormCustomerId(String(customer.id));
            setShowQuickCreateCustomer(false);
            setQcCustomerFullName("");
            setQcCustomerPhone("");
            setQcCustomerEmail("");
            setQcCustomerTaxId("");
            setQcCustomerErrors({});
            showToast({ message: "Ο πελάτης δημιουργήθηκε επιτυχώς", type: "success" });
        } catch (e: unknown) {
            const errMsg = e as Error;
            showToast({ message: errMsg.message || "Σφάλμα", type: "error" });
        }
    };

    const openReceipt = useCallback(
        (sale: Sale) => {
            openEdit(sale);
            setShowReceiptPanel(true);
            const amt = (sale as Sale & { amount_due?: number }).amount_due ?? 0;
            setReceiptAmount(amt > 0 ? String(amt) : "");
            setReceiptPaymentMethodId(paymentMethods[0]?.id ?? "");
            setReceiptPaymentDate(new Date().toISOString().slice(0, 10));
            setReceiptNotes("");
            setReceiptErrors({});
        },
        [openEdit, paymentMethods]
    );

    const handleSubmitReceipt = async () => {
        if (!editId || !activeStore?.id) return;
        const err: Record<string, string> = {};
        const amt = parseFloat(receiptAmount) || 0;
        if (amt <= 0) err.amount = "Το ποσό πρέπει να είναι θετικό";
        if (!receiptPaymentMethodId) err.payment_method_id = "Επιλέξτε τρόπο πληρωμής";
        const amountDue = (editSale as Sale & { amount_due?: number })?.amount_due ?? 0;
        if (amt > amountDue) err.amount = `Μέγιστο ποσό: ${amountDue.toFixed(2)} €`;
        setReceiptErrors(err);
        if (Object.keys(err).length > 0) return;
        setReceiptSaving(true);
        try {
            await axiosPrivate.post("/api/shared/company/receipts", {
                store_id: activeStore.id,
                sale_id: editId,
                amount: amt,
                payment_method_id: receiptPaymentMethodId,
                payment_date: receiptPaymentDate ? `${receiptPaymentDate}T12:00:00.000Z` : undefined,
                notes: receiptNotes.trim() || null,
            });
            showToast({ message: "Η εισπραξη καταχωρήθηκε επιτυχώς", type: "success" });
            queryClient.invalidateQueries({ queryKey: ["sale", activeCompany?.id, editId] });
            setShowReceiptPanel(false);
            setReceiptAmount("");
        } catch (e: unknown) {
            const ax = e as { response?: { data?: { message?: string } } };
            showToast({ message: ax.response?.data?.message || "Σφάλμα", type: "error" });
        } finally {
            setReceiptSaving(false);
        }
    };

    const handlePartialReturnSubmit = async () => {
        if (!editId) return;
        const items = Object.entries(partialReturnQuantities)
            .filter(([, qty]) => qty > 0)
            .map(([saleItemId, quantity]) => ({ sale_item_id: parseInt(saleItemId, 10), quantity }));
        if (items.length === 0) {
            showToast({ message: "Επιλέξτε τουλάχιστον ένα προϊόν με ποσότητα επιστροφής", type: "error" });
            return;
        }
        try {
            await mutations.partialReturn.mutateAsync({ id: editId, items });
            showToast({ message: "Η επιστροφή καταχωρήθηκε επιτυχώς", type: "success" });
            setShowPartialReturnPanel(false);
            closePopup();
        } catch (e: unknown) {
            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
        }
    };

    const handleConvert = async (sale: Sale, target: "receipt" | "invoice") => {
        try {
            if (target === "receipt") {
                await mutations.convertToReceipt.mutateAsync(sale.id);
            } else {
                await mutations.convertToInvoice.mutateAsync(sale.id);
            }
            showToast({ message: "Η μετατροπή ολοκληρώθηκε επιτυχώς", type: "success" });
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } }; message?: string };
            const msg = err?.response?.data?.message || err?.message || "Σφάλμα";
            showToast({ message: msg, type: "error" });
        }
    };

    const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);

    const handleDownloadPdf = async (sale: Sale) => {
        const st = (sale.status || "").toLowerCase();
        if (st === "draft") {
            showToast({ message: "Δεν υπάρχει PDF για πωλήσεις σε κατάσταση Πρόχειρο", type: "error" });
            return;
        }
        setPdfLoadingId(sale.id);
        try {
            const res = await axiosPrivate.get(`/api/shared/company/sales/${sale.id}/pdf`, {
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
            const filename = `${sale.invoice_type === "invoice" ? "timologio" : "apodeixi"}-${sale.invoice_number ?? sale.id}.pdf`;
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
            setPdfLoadingId(null);
        }
    };

    const inMainSaleForm =
        !showReceiptPanel &&
        !showSendEmailPanel &&
        !showPartialReturnPanel &&
        !showQuickCreateCustomer &&
        !negativeStockConfirm;
    const saleDocType = (editId && editSale?.id === editId ? editSale?.invoice_type : formInvoiceType) || "REC";
    const saleDocStatus = (editId && editSale?.id === editId ? editSale?.status : formStatus) || "draft";
    const hasReceipts = (editSale?.receipts?.length ?? 0) > 0;
    const saleHasLinkedInvoice = saleDocType === "DNO" && !!editSale?.converted_to;

    const salesFooterActions = useMemo((): FooterButton[] => {
        if (!inMainSaleForm) return [];
        if (editId && editLoading) return [];
        const effectiveType = (editId && editSale?.id === editId ? editSale?.invoice_type : formInvoiceType) || "REC";
        const effectiveStatus = (editId && editSale?.id === editId ? editSale?.status : formStatus) || "draft";
        const buttons = getSalesButtons(
            effectiveType,
            effectiveStatus,
            editSale?.payment_status ?? null,
            hasReceipts,
            saleHasLinkedInvoice
        );
        return buttons
            .filter((b) => !b.disabled)
            .map((btn) => {
                const base: FooterButton = { label: btn.label, onClick: () => {}, variant: "outline", tooltip: btn.tooltip ?? undefined };
                if (btn.key === "record_receipt") {
                    base.onClick = () => setShowReceiptPanel(true);
                    base.variant = "primary";
                } else if (btn.key === "create_credit_note" && editSale) {
                    base.onClick = () => openPartialReturn(editSale);
                    base.variant = "primary";
                } else if (btn.key === "send_email" && editSale) {
                    base.onClick = () => openSendEmail(editSale);
                } else if (btn.key === "accept" && effectiveType === "QUO" && editId) {
                    base.variant = "primary";
                    base.onClick = async () => {
                        try {
                            const newSo = await mutations.acceptQuote.mutateAsync(editId);
                            showToast({ message: "Δημιουργήθηκε Παραγγελία Πώλησης", type: "success" });
                            openEdit(newSo);
                        } catch (e) {
                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                        }
                    };
                    base.loading = mutations.acceptQuote.isPending;
                } else if (btn.key === "create_invoice" && effectiveType === "DNO" && editId) {
                    base.variant = "primary";
                    base.onClick = async () => {
                        try {
                            await mutations.convertToInvoice.mutateAsync(editId);
                            showToast({ message: "Μετατράπηκε σε Τιμολόγιο", type: "success" });
                            closePopup();
                        } catch (e) {
                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                        }
                    };
                    base.loading = mutations.convertToInvoice.isPending;
                } else if (btn.key === "create_receipt" && effectiveType === "DNO" && editId) {
                    base.variant = "primary";
                    base.onClick = async () => {
                        try {
                            await mutations.convertToReceipt.mutateAsync(editId);
                            showToast({ message: "Μετατράπηκε σε Απόδειξη", type: "success" });
                            closePopup();
                        } catch (e) {
                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                        }
                    };
                    base.loading = mutations.convertToReceipt.isPending;
                } else if (btn.key === "delete" && editId) {
                    base.onClick = () => setDeleteConfirmId(editId);
                    base.variant = "danger";
                } else if (btn.key === "save" || btn.key === "finalize") {
                    base.onClick = () => {
                        if (btn.key === "finalize") {
                            let nextStatus = formStatus;
                            if (effectiveType === "QUO") nextStatus = "sent";
                            else if (effectiveType === "SO") nextStatus = "completed";
                            else if (["REC", "INV", "DNO", "CRN"].includes(effectiveType)) nextStatus = "completed";
                            void handleSave(nextStatus);
                        } else {
                            void handleSave();
                        }
                    };
                    base.variant = "primary";
                } else if (btn.key === "cancel" && effectiveType === "SO" && editId) {
                    const soCancelBlock =
                        editSale?.id === editId ? getSoCancelBlockMessageFromLinked(editSale?.linked_documents) : null;
                    base.variant = "outline";
                    base.disabled = !!soCancelBlock;
                    base.tooltip = soCancelBlock ?? undefined;
                    base.onClick = async () => {
                        if (soCancelBlock) return;
                        try {
                            await mutations.updateSale.mutateAsync({ id: editId, status: "cancelled", payment_method_id: formPaymentMethodId, items: buildItems() });
                            showToast({ message: "Η παραγγελία ακυρώθηκε", type: "success" });
                            closePopup();
                        } catch (e) {
                            showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                        }
                    };
                    base.loading = mutations.updateSale.isPending;
                } else if (btn.key === "pdf" && editSale) {
                    base.onClick = () => handleDownloadPdf(editSale);
                } else {
                    return null;
                }
                return base;
            })
            .filter((b): b is FooterButton => b !== null);
    }, [
        inMainSaleForm,
        editId,
        editLoading,
        saleDocType,
        saleDocStatus,
        formStatus,
        hasReceipts,
        saleHasLinkedInvoice,
        editSale,
        editSale?.linked_documents,
        formInvoiceType,
        formPaymentMethodId,
        handleSave,
        mutations.updateSale,
        closePopup,
        showToast,
    ]);

    const showSalesLoading = isLoading && sales.length === 0;

    return (
        <div className={styles.wrapper}>
            <div className={styles.headerRow}>
                <h1 className={styles.title}>Πωλήσεις</h1>
                <p className={styles.subtitle}>Διαχείριση πωλήσεων</p>
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
                                placeholder="Αριθμός απόδειξης..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Πελάτης</label>
                        <select
                            className={styles.filterSelect}
                            value={customerFilter}
                            onChange={(e) => setCustomerFilter(e.target.value)}
                        >
                            <option value="">Όλοι</option>
                            {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.full_name}
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
                            {SALES_DOC_TYPES.map((t) => (
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
                            <option value="draft">Πρόχειρο</option>
                            <option value="sent">Απεστάλη</option>
                            <option value="completed">Ολοκλήρωση</option>
                            <option value="cancelled">Ακυρώθηκε</option>
                            <option value="converted">Μετατράπηκε</option>
                            <option value="expired">Έληξε</option>
                            <option value="invoiced">Τιμολογήθηκε</option>
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
                                {SALES_NEW_DOC_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        className={styles.dropdownItem}
                                        onClick={() => openCreate(opt.value as SalesDocType)}
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
                <h3 className={styles.sectionTitle}>Λίστα πωλήσεων</h3>
                {!activeStore?.id ? (
                    <p className={styles.sectionHint}>
                        Επιλέξτε κατάστημα από την πλευρική μπάρα για να δείτε και να δημιουργήσετε πωλήσεις.
                    </p>
                ) : showSalesLoading ? (
                    <div className={styles.listLoading}>
                        <LoadingSpinner />
                    </div>
                ) : sales.length === 0 ? (
                    <p className={styles.sectionHint}>Δεν υπάρχουν πωλήσεις. Κάντε κλικ στο «Νέα πώληση».</p>
                ) : (
                    <div className={styles.tableScrollWrapper}>
                        <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <colgroup>
                                <col style={{ width: "180px" }} />
                                <col />
                                <col />
                                <col />
                                <col />
                                <col />
                                <col style={{ width: "300px" }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>Αρ. Παραστατικού</th>
                                    <th>Πελάτης</th>
                                    <th>Ημερομηνία</th>
                                    <th>Σύνολο</th>
                                    <th>Τύπος</th>
                                    <th>Κατάσταση</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map((s) => (
                                    <tr key={s.id}>
                                        <td>{s.invoice_number ?? `#${s.id}`}</td>
                                        <td>{s.customer?.full_name ?? "Περαστικός"}</td>
                                        <td>{formatDate(s.created_at)}</td>
                                        <td>{formatCurrency(s.total_amount)}</td>
                                        <td><DocTypeBadge value={s.invoice_type} variant="sales" /></td>
                                        <td><StatusBadge status={s.status} variant="sales" /></td>
                                        <td>
                                            <div className={styles.cellActions}>
                                                {(() => {
                                                    const doc = (s.invoice_type || "REC").toUpperCase();
                                                    const st = (s.status || "").toLowerCase();
                                                    const hasReceipts = (s.receipts?.length ?? 0) > 0;
                                                    const hasLinkedInvoice = doc === "DNO" && !!s.converted_to;
                                                    const soCancelBlockList =
                                                        doc === "SO" ? getSoCancelBlockMessageFromLinked(s.linked_documents) : null;
                                                    const listButtons = getSalesButtons(doc, st, s.payment_status ?? null, hasReceipts, hasLinkedInvoice)
                                                        .filter((b) => !b.disabled && b.key !== "save" && b.key !== "finalize");

                                                    return (
                                                        <>
                                                            {listButtons.map((btn) => {
                                                                if (btn.key === "accept" && doc === "QUO" && (st === "sent" || st === "finalized")) {
                                                                    return (
                                                                        <React.Fragment key="quo-actions">
                                                                            <button type="button" className={styles.editBtn} onClick={async () => { try { const newSo = await mutations.acceptQuote.mutateAsync(s.id); showToast({ message: "Δημιουργήθηκε Παραγγελία Πώλησης", type: "success" }); openEdit(newSo); } catch (e) { showToast({ message: (e as Error).message || "Σφάλμα", type: "error" }); } }} disabled={mutations.acceptQuote.isPending} title={btn.label}>
                                                                                <Check size={16} />
                                                                            </button>
                                                                            <div className={styles.convertDropdownWrap} ref={convertDropdownSaleId === s.id ? convertDropdownRef : undefined}>
                                                                                <button type="button" className={styles.convertBtn} onClick={() => setConvertDropdownSaleId((prev) => (prev === s.id ? null : s.id))} title="Μετατροπή" disabled={mutations.convertToReceipt.isPending || mutations.convertToInvoice.isPending}>
                                                                                    <Repeat size={16} />
                                                                                </button>
                                                                                {convertDropdownSaleId === s.id && (
                                                                                    <div className={styles.convertDropdown} onMouseDown={(e) => e.preventDefault()}>
                                                                                        <button type="button" className={styles.convertDropdownItem} onClick={() => { handleConvert(s, "receipt"); setConvertDropdownSaleId(null); }} disabled={mutations.convertToReceipt.isPending}>Απόδειξη</button>
                                                                                        <button type="button" className={styles.convertDropdownItem} onClick={() => { handleConvert(s, "invoice"); setConvertDropdownSaleId(null); }} disabled={mutations.convertToInvoice.isPending}>Τιμολόγιο</button>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </React.Fragment>
                                                                    );
                                                                }
                                                                if (btn.key === "create_invoice" && doc === "DNO" && ["pending_invoicing", "completed"].includes(st)) {
                                                                    return (
                                                                        <div key="dno-convert" className={styles.convertDropdownWrap} ref={convertDropdownSaleId === s.id ? convertDropdownRef : undefined}>
                                                                            <button type="button" className={styles.convertBtn} onClick={() => setConvertDropdownSaleId((prev) => (prev === s.id ? null : s.id))} title="Μετατροπή σε Τιμολόγιο" disabled={mutations.convertToInvoice.isPending}>
                                                                                <Repeat size={16} />
                                                                            </button>
                                                                            {convertDropdownSaleId === s.id && (
                                                                                <div className={styles.convertDropdown} onMouseDown={(e) => e.preventDefault()}>
                                                                                    <button type="button" className={styles.convertDropdownItem} onClick={() => { handleConvert(s, "invoice"); setConvertDropdownSaleId(null); }} disabled={mutations.convertToInvoice.isPending}>Τιμολόγιο</button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                }
                                                                if (btn.key === "create_receipt" && doc === "DNO") return null;
                                                                const iconName = SALES_ACTION_ICON[btn.key];
                                                                const Icon = iconName ? SALE_ICON_MAP[iconName] : null;
                                                                if (!Icon) return null;

                                                                const btnClass = btn.key === "delete" ? styles.deleteBtn : btn.key === "pdf" ? styles.pdfBtn : btn.key === "send_email" || btn.key === "record_receipt" || btn.key === "create_credit_note" ? styles.mailSendBtn : styles.editBtn;
                                                                const handler = btn.key === "delete" ? () => setDeleteConfirmId(s.id)
                                                                    : btn.key === "pdf" ? () => handleDownloadPdf(s)
                                                                    : btn.key === "send_email" ? () => openSendEmail(s)
                                                                    : btn.key === "record_receipt" ? () => openReceipt(s)
                                                                    : btn.key === "create_credit_note" ? () => openPartialReturn(s)
                                                                    : btn.key === "cancel" && doc === "SO"
                                                                      ? async () => {
                                                                            if (soCancelBlockList) return;
                                                                            try {
                                                                                await mutations.updateSale.mutateAsync({
                                                                                    id: s.id,
                                                                                    status: "cancelled",
                                                                                    payment_method_id: s.payment_method_id,
                                                                                    items: saleItemsToPatchPayload(s),
                                                                                });
                                                                                showToast({ message: "Η παραγγελία ακυρώθηκε", type: "success" });
                                                                                closePopup();
                                                                            } catch (e) {
                                                                                showToast({ message: (e as Error).message || "Σφάλμα", type: "error" });
                                                                            }
                                                                        }
                                                                    : null;
                                                                if (!handler && !["reject", "reverse", "create_invoice", "create_receipt", "cancel", "create_delivery", "close_order", "apply", "refund"].includes(btn.key)) return null;

                                                                return (
                                                                    <button
                                                                        key={btn.key}
                                                                        type="button"
                                                                        className={btnClass}
                                                                        onClick={handler || (() => openEdit(s))}
                                                                        title={
                                                                            btn.key === "cancel" && soCancelBlockList
                                                                                ? soCancelBlockList
                                                                                : btn.tooltip || btn.label
                                                                        }
                                                                        disabled={
                                                                            (btn.key === "pdf" && pdfLoadingId === s.id) ||
                                                                            (btn.key === "cancel" &&
                                                                                (!!soCancelBlockList || mutations.updateSale.isPending))
                                                                        }
                                                                    >
                                                                        <Icon size={16} />
                                                                    </button>
                                                                );
                                                            })}
                                                            <button type="button" className={styles.editBtn} onClick={() => openEdit(s)} title="Επεξεργασία">
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
                    </div>
                )}
            </div>

            {deleteConfirmId && (
                <SidePopup
                    isOpen={!!deleteConfirmId}
                    onClose={() => {
                        setDeleteConfirmId(null);
                        setDeleteNegativeStockConfirm(null);
                    }}
                    title="Επιβεβαίωση διαγραφής"
                    footerLeftButton={{
                        label: "Κλείσιμο",
                        onClick: () => {
                            setDeleteConfirmId(null);
                            setDeleteNegativeStockConfirm(null);
                        },
                        variant: "outline",
                    }}
                    footerRightButton={
                        deleteNegativeStockConfirm
                            ? {
                                  label: "Συνεχίζω",
                                  onClick: () => handleDeleteConfirm(deleteConfirmId!),
                                  variant: "danger",
                                  loading: mutations.deleteSale.isPending,
                              }
                            : {
                                  label: "Διαγραφή",
                                  onClick: () => handleDelete(deleteConfirmId!),
                                  variant: "danger",
                                  loading: mutations.deleteSale.isPending,
                              }
                    }
                >
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
                            Θέλετε να διαγράψετε αυτή την πώληση; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
                        </p>
                    )}
                </SidePopup>
            )}

            <SidePopup
                isOpen={popupOpen}
                onClose={closePopup}
                title={
                    negativeStockConfirm
                        ? "Επιβεβαίωση πώλησης με αρνητικό απόθεμα"
                        : showReceiptPanel
                          ? "Καταχώρηση Είσπραξης"
                          : showSendEmailPanel
                            ? "Αποστολή Παραστατικού"
                            : showPartialReturnPanel
                              ? "Επιστροφή Προϊόντων"
                              : showQuickCreateCustomer
                                ? "Νέος Πελάτης"
                                : editId
                                  ? "Επεξεργασία πώλησης"
                                  : "Νέα πώληση"
                }
                width="1000px"
                footerLeftButton={
                    negativeStockConfirm
                        ? { label: "Ακύρωση", onClick: () => setNegativeStockConfirm(null), variant: "outline" }
                        : showReceiptPanel
                          ? {
                                label: "← Πίσω",
                                onClick: () => setShowReceiptPanel(false),
                                variant: "outline",
                            }
                          : showSendEmailPanel
                            ? {
                                  label: "← Πίσω",
                                  onClick: () => setShowSendEmailPanel(false),
                                  variant: "outline",
                              }
                            : showPartialReturnPanel
                            ? {
                                  label: "← Πίσω",
                                  onClick: () => setShowPartialReturnPanel(false),
                                  variant: "outline",
                              }
                            : showQuickCreateCustomer
                            ? {
                                  label: "← Πίσω",
                                  onClick: () => {
                                      setShowQuickCreateCustomer(false);
                                      setQcCustomerErrors({});
                                  },
                                  variant: "outline",
                              }
                            : { label: "Κλείσιμο", onClick: closePopup, variant: "outline" }
                }
                footerRightButton={
                    negativeStockConfirm
                        ? {
                              label: "Συνεχίζω",
                              onClick: handleConfirmNegativeStock,
                              variant: "primary",
                              loading: mutations.createSale.isPending || mutations.updateSale.isPending,
                          }
                        : showReceiptPanel
                          ? {
                                label: "Αποθήκευση",
                                onClick: handleSubmitReceipt,
                                variant: "primary",
                                loading: receiptSaving,
                            }
                          : showSendEmailPanel
                            ? {
                                  label: "Αποστολή",
                                  onClick: handleSendSaleEmail,
                                  variant: "primary",
                                  loading: sendEmailSending,
                                }
                            : showPartialReturnPanel
                            ? {
                                  label: "Υποβολή",
                                  onClick: handlePartialReturnSubmit,
                                  variant: "primary",
                                  loading: mutations.partialReturn.isPending,
                              }
                            : showQuickCreateCustomer
                            ? {
                                  label: "Αποθήκευση",
                                  onClick: handleSaveCustomerQuickCreate,
                                  variant: "primary",
                                  loading: customerMutations.createCustomer.isPending,
                              }
                            : salesFooterActions.length > 0
                            ? undefined
                            : isQuoReadOnly || isRecInvCancelledReadOnly || (isCompletedRecInvReadOnly && (formStatus as string) !== "cancelled")
                            ? undefined
                            : {
                                  label: "Αποθήκευση",
                                  onClick: handleSave,
                                  variant: "primary",
                                  loading:
                                      mutations.createSale.isPending ||
                                      mutations.updateSale.isPending ||
                                      (!!editId && editLoading),
                              }
                }
                footerActions={salesFooterActions.length > 0 ? salesFooterActions : undefined}
                contentLoading={!!editId && editLoading && inMainSaleForm}
            >
                {isQuoReadOnly && editSale?.converted_to && (
                    <div className={styles.formRow} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
                        <div className={styles.formGroup}>
                            <span className={styles.formLabel}>Αναφορά</span>
                            <button
                                type="button"
                                className={styles.convertedToLink}
                                onClick={handleOpenConvertedDoc}
                            >
                                Μετατράπηκε σε [{editSale.converted_to.invoice_type}-{editSale.converted_to.invoice_number}]
                            </button>
                        </div>
                    </div>
                )}
                {isRecInvCancelledReadOnly && editSale?.converted_to && (
                    <div className={styles.formRow} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
                        <div className={styles.formGroup}>
                            <span className={styles.formLabel}>Αναφορά</span>
                            <button
                                type="button"
                                className={styles.convertedToLink}
                                onClick={handleOpenConvertedDoc}
                            >
                                Ακυρώθηκε → {editSale.converted_to.invoice_type}-{editSale.converted_to.invoice_number}
                            </button>
                        </div>
                    </div>
                )}
                {(editSale?.invoice_type || "").toUpperCase() === "CRN" && editSale?.return_from && editId === editSale.id && (
                    <div className={styles.formRow} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
                        <div className={styles.formGroup}>
                            <span className={styles.formLabel}>Αναφορά</span>
                            <button
                                type="button"
                                className={styles.convertedToLink}
                                onClick={handleOpenReturnFromDoc}
                            >
                                Επιστροφή από [{editSale.return_from.invoice_type}-{editSale.return_from.invoice_number}]
                            </button>
                        </div>
                    </div>
                )}
                <div className={styles.slidingWrapper}>
                    <div
                        className={styles.slidingPanels}
                        style={{ transform: showQuickCreateCustomer || negativeStockConfirm || showSendEmailPanel || showPartialReturnPanel || showReceiptPanel ? "translateX(-50%)" : undefined }}
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
                                        {getSalesStatusLabel(editId && editSale?.id === editId ? (editSale?.status ?? formStatus) : formStatus)}
                                    </div>
                                </div>
                                <div className={styles.formGroup} style={{ flex: 2 }}>
                                    <label className={styles.formLabel}>Πελάτης {(formInvoiceType === "INV" || formInvoiceType === "CRN") ? "*" : ""}</label>
                                    <CustomerSearchSelect
                                        value={formCustomerId}
                                        onChange={(id) => {
                                            setFormCustomerId(id);
                                            setShowQuickCreateCustomer(false);
                                        }}
                                        onOpenQuickCreate={() => setShowQuickCreateCustomer(true)}
                                        placeholder={(formInvoiceType === "INV" || formInvoiceType === "CRN") ? "Επιλέξτε πελάτη με ΑΦΜ" : "Περαστικός"}
                                        disabled={isQuoReadOnly}
                                    />
                                    {formErrors.customer_id && (
                                        <span className={styles.formError}>{formErrors.customer_id}</span>
                                    )}
                                </div>
                            </div>
                            <div className={styles.formRow} style={{ marginTop: 16 }}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Τύπος παραστατικού</label>
                                    <div className={styles.statusReadOnly}>
                                        {SALES_DOC_TYPES.find((t) => t.value === formInvoiceType)?.label ?? formInvoiceType}
                                    </div>
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
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Αριθμός παραστατικού</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formInvoiceNumber}
                                        onChange={(e) => setFormInvoiceNumber(e.target.value)}
                                        placeholder="Προαιρετικό"
                                        disabled={isFormReadOnly}
                                    />
                                </div>
                            </div>
                            {formInvoiceType === "QUO" && (
                                <div className={styles.formRow} style={{ marginTop: 16 }}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Ημερομηνία λήξης</label>
                                        <input
                                            type="date"
                                            className={styles.formInput}
                                            value={formExpiryDate}
                                            onChange={(e) => setFormExpiryDate(e.target.value)}
                                            placeholder="Προαιρετικό"
                                            disabled={isFormReadOnly}
                                        />
                                    </div>
                                </div>
                            )}
                            {formInvoiceType === "INV" && !isCompletedRecInvReadOnly && (
                                <div className={styles.formRow} style={{ marginTop: 16 }}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Όροι Πληρωμής</label>
                                        <select
                                            className={styles.formSelect}
                                            value={formPaymentTerms}
                                            onChange={(e) => setFormPaymentTerms(e.target.value as "immediate" | "15" | "30" | "60" | "90")}
                                            disabled={isFormReadOnly}
                                        >
                                            <option value="immediate">Άμεση Πληρωμή</option>
                                            <option value="15">15 ημέρες</option>
                                            <option value="30">30 ημέρες</option>
                                            <option value="60">60 ημέρες</option>
                                            <option value="90">90 ημέρες</option>
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Προθεσμία</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={
                                                formPaymentTerms === "immediate"
                                                    ? formInvoiceDate
                                                        ? formatDate(formInvoiceDate)
                                                        : "—"
                                                    : formInvoiceDate
                                                        ? (() => {
                                                              const d = new Date(formInvoiceDate);
                                                              const days = parseInt(formPaymentTerms, 10) || 0;
                                                              d.setDate(d.getDate() + days);
                                                              return formatDate(d.toISOString().slice(0, 10));
                                                          })()
                                                        : "—"
                                            }
                                            readOnly
                                            disabled
                                            style={{ backgroundColor: "#f9fafb", cursor: "default" }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className={styles.formRow} style={{ marginTop: 16 }}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>Τρόπος πληρωμής *</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formPaymentMethodId}
                                        onChange={(e) => setFormPaymentMethodId(e.target.value)}
                                        disabled={isFormReadOnly}
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
                                {isCashPayment && (
                                    <>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Πληρωμένο ποσό</label>
                                            <input
                                                type="number"
                                                className={styles.formInput}
                                                min={0}
                                                step={0.01}
                                                value={formAmountPaid}
                                                onChange={(e) => setFormAmountPaid(e.target.value)}
                                                placeholder={totalAmount.toFixed(2)}
                                                disabled={isFormReadOnly}
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Ρέστα</label>
                                            <div className={styles.readOnlyInput}>{formatCurrency(changeReturned)}</div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className={styles.itemsSection}>
                                <div className={styles.itemsHeader}>
                                    <h4 className={styles.itemsTitle}>Είδη</h4>
                                    <button type="button" className={styles.addItemBtn} onClick={addItemRow} disabled={isFormReadOnly}>
                                        <Plus size={14} />
                                        Προσθήκη γραμμής
                                    </button>
                                </div>
                                {formItems.map((row) => (
                                    <div key={row.id} className={styles.itemRow}>
                                        <div className={`${styles.formGroup} ${styles.formGroupRelative}`}>
                                            <label className={styles.formLabel}>Παραλλαγή προϊόντος</label>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                placeholder="Αναζήτηση προϊόντος ή παραλλαγής..."
                                                value={
                                                    variantDropdownRowId === row.id
                                                        ? variantSearchByRow[row.id] ?? ""
                                                        : getSelectedVariantLabel(row)
                                                }
                                                disabled={isFormReadOnly}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setVariantSearchByRow((prev) => ({ ...prev, [row.id]: val }));
                                                    if (val.trim() === "" && row.variantId) {
                                                        updateItemRow(row.id, "productId", "");
                                                    }
                                                }}
                                                onFocus={() => {
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
                                            {variantDropdownRowId === row.id && !isFormReadOnly && (
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
                                                                onClick={() => selectVariantForRow(row.id, fv)}
                                                            >
                                                                {fv.label}
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Ποσότητα</label>
                                            <input
                                                type="number"
                                                className={styles.formInput}
                                                min={1}
                                                placeholder="Ποσότ."
                                                value={row.quantity}
                                                onChange={(e) => updateItemRow(row.id, "quantity", e.target.value)}
                                                disabled={isFormReadOnly}
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Τιμή χωρίς ΦΠΑ</label>
                                            <input
                                                type="number"
                                                className={styles.formInput}
                                                min={0}
                                                step={0.01}
                                                placeholder="0.00"
                                                value={row.salePriceWithoutVat}
                                                disabled={isFormReadOnly}
                                                onChange={(e) =>
                                                    updateItemRow(row.id, "salePriceWithoutVat", e.target.value)
                                                }
                                                onBlur={(e) => {
                                                    const v = parseFloat(e.target.value);
                                                    if (!isNaN(v) && v >= 0) {
                                                        updateItemRow(
                                                            row.id,
                                                            "salePriceWithoutVat",
                                                            (Math.round(v * 100) / 100).toFixed(2)
                                                        );
                                                    }
                                                }}
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
                                                        ? (
                                                              row.vatExempt && row.priceWithVatWhenExempt != null
                                                                  ? row.priceWithVatWhenExempt
                                                                  : getSalePriceWithVat(row)
                                                          ).toFixed(2)
                                                        : ""
                                                }
                                                onChange={(e) => {
                                                    const withVat = parseFloat(e.target.value);
                                                    if (!isNaN(withVat) && withVat >= 0) {
                                                        setPriceFromWithVat(row.id, withVat);
                                                    }
                                                }}
                                                disabled={row.vatExempt || isFormReadOnly}
                                            />
                                        </div>
                                        <div className={styles.checkboxGroup}>
                                            <label className={styles.formLabel}>Απαλλαγή ΦΠΑ</label>
                                            <div className={styles.checkboxWrapper}>
                                                <input
                                                    type="checkbox"
                                                    checked={row.vatExempt}
                                                    onChange={(e) =>
                                                        updateItemRow(row.id, "vatExempt", e.target.checked)
                                                    }
                                                    disabled={isFormReadOnly}
                                                />
                                            </div>
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Σύνολο</label>
                                            <div className={styles.lineTotalReadOnly}>
                                                {formatCurrency(getLineTotal(row))}
                                            </div>
                                        </div>
                                        <div className={styles.removeItemCell}>
                                            <button
                                                type="button"
                                                className={styles.removeItemBtn}
                                                onClick={() => removeItemRow(row.id)}
                                                title="Αφαίρεση"
                                                disabled={isFormReadOnly}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
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

                            {formInvoiceType === "INV" && (editSale?.status || "").toLowerCase() === "completed" && editSale && editId === editSale.id && (
                                <div className={styles.paymentSection} style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
                                    <h4 className={styles.formLabel} style={{ marginBottom: 12 }}>Πληρωμές</h4>
                                    <div className={styles.formRow} style={{ marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
                                        <span>
                                            Κατάσταση:{" "}
                                            <span className={styles[`paymentStatus_${(editSale.payment_status || "unpaid")}`] ?? styles.paymentStatus_unpaid}>
                                                {PAYMENT_STATUS_LABELS[editSale.payment_status as keyof typeof PAYMENT_STATUS_LABELS] ?? editSale.payment_status ?? "—"}
                                            </span>
                                        </span>
                                        {(editSale.amount_due ?? 0) > 0 && (
                                            <>
                                                <span>Υπόλοιπο: {formatCurrency(editSale.amount_due ?? 0)}</span>
                                                {editSale.due_date && <span>Προθεσμία: {formatDate(editSale.due_date)}</span>}
                                            </>
                                        )}
                                    </div>
                                    {(editSale.receipts?.length ?? 0) > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            <span className={styles.formLabel}>Εισπράξεις:</span>
                                            <ul style={{ margin: "8px 0 0 0", paddingLeft: 20 }}>
                                                {editSale.receipts!.map((r) => (
                                                    <li key={r.id} style={{ marginBottom: 4 }}>
                                                        {formatDate(r.payment_date)} — {formatCurrency(r.amount)}
                                                        {r.is_auto && <span style={{ marginLeft: 6, fontSize: 12, color: "#6b7280" }}>(αυτόματη)</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {(editSale.amount_due ?? 0) > 0 && activeStore?.id && (
                                        <Button
                                            variant="primary"
                                            onClick={() => {
                                                setReceiptAmount(String(editSale.amount_due ?? ""));
                                                setReceiptPaymentMethodId(paymentMethods[0]?.id ?? "");
                                                setReceiptPaymentDate(new Date().toISOString().slice(0, 10));
                                                setReceiptNotes("");
                                                setReceiptErrors({});
                                                setShowReceiptPanel(true);
                                            }}
                                        >
                                            Καταχώρηση Είσπραξης
                                        </Button>
                                    )}
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
                            {showReceiptPanel ? (
                                <div className={styles.quickCreateForm}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Ποσό *</label>
                                        <input
                                            type="number"
                                            className={styles.formInput}
                                            min={0}
                                            max={editSale?.amount_due ?? 0}
                                            step={0.01}
                                            value={receiptAmount}
                                            onChange={(e) => {
                                                setReceiptAmount(e.target.value);
                                                setReceiptErrors((prev) => ({ ...prev, amount: "" }));
                                            }}
                                            placeholder="0.00"
                                        />
                                        {receiptErrors.amount && <span className={styles.formError}>{receiptErrors.amount}</span>}
                                    </div>
                                    <div className={styles.formGroup} style={{ marginTop: 16 }}>
                                        <label className={styles.formLabel}>Τρόπος πληρωμής *</label>
                                        <select
                                            className={styles.formSelect}
                                            value={receiptPaymentMethodId}
                                            onChange={(e) => {
                                                setReceiptPaymentMethodId(e.target.value);
                                                setReceiptErrors((prev) => ({ ...prev, payment_method_id: "" }));
                                            }}
                                        >
                                            <option value="">Επιλέξτε</option>
                                            {paymentMethods.filter((pm) => pm.is_active).map((pm) => (
                                                <option key={pm.id} value={pm.id}>{pm.name}</option>
                                            ))}
                                        </select>
                                        {receiptErrors.payment_method_id && <span className={styles.formError}>{receiptErrors.payment_method_id}</span>}
                                    </div>
                                    <div className={styles.formGroup} style={{ marginTop: 16 }}>
                                        <label className={styles.formLabel}>Ημερομηνία</label>
                                        <input
                                            type="date"
                                            className={styles.formInput}
                                            value={receiptPaymentDate}
                                            onChange={(e) => setReceiptPaymentDate(e.target.value)}
                                        />
                                    </div>
                                    <div className={styles.formGroup} style={{ marginTop: 16 }}>
                                        <label className={styles.formLabel}>Σημειώσεις</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={receiptNotes}
                                            onChange={(e) => setReceiptNotes(e.target.value)}
                                            placeholder="Προαιρετικό"
                                        />
                                    </div>
                                </div>
                            ) : showPartialReturnPanel ? (
                                <div className={styles.quickCreateForm}>
                                    <p style={{ marginBottom: 16 }}>Επιλέξτε ποσότητα επιστροφής για κάθε γραμμή:</p>
                                    {(editSale?.sale_items || []).map((it) => {
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
                            ) : showSendEmailPanel ? (
                                <div className={styles.quickCreateForm}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Email *</label>
                                        <input
                                            type="email"
                                            className={styles.formInput}
                                            value={sendEmailAddress}
                                            onChange={(e) => {
                                                setSendEmailAddress(e.target.value);
                                                setSendEmailErrors((prev) => ({ ...prev, email: "" }));
                                            }}
                                            placeholder="π.χ. email@example.com"
                                        />
                                        {sendEmailErrors.email && (
                                            <span className={styles.formError}>{sendEmailErrors.email}</span>
                                        )}
                                    </div>
                                    {editSale?.customer_id && (
                                        <div className={styles.checkboxGroup} style={{ marginTop: 16 }}>
                                            <div className={styles.checkboxWrapper}>
                                                <input
                                                    type="checkbox"
                                                    id="send-email-update-customer"
                                                    checked={sendEmailUpdateCustomer}
                                                    onChange={(e) => setSendEmailUpdateCustomer(e.target.checked)}
                                                />
                                                <label htmlFor="send-email-update-customer" className={styles.checkboxLabel}>
                                                    {editSale?.customer?.email ? "Ενημέρωση email πελάτη" : "Αποθήκευση email στον πελάτη"}
                                                </label>
                                            </div>
                                        </div>
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
                            ) : (
                                <div className={styles.quickCreateForm}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>Όνομα πελάτη *</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={qcCustomerFullName}
                                            onChange={(e) => {
                                                setQcCustomerFullName(e.target.value);
                                                setQcCustomerErrors((prev) => ({ ...prev, full_name: "" }));
                                            }}
                                            placeholder="π.χ. Γιώργος Παπαδόπουλος"
                                        />
                                        {qcCustomerErrors.full_name && (
                                            <span className={styles.formError}>{qcCustomerErrors.full_name}</span>
                                        )}
                                    </div>
                                    {(formInvoiceType === "INV" || formInvoiceType === "CRN") && (
                                        <div className={styles.formGroup} style={{ marginTop: 16 }}>
                                            <label className={styles.formLabel}>ΑΦΜ *</label>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                value={qcCustomerTaxId}
                                                onChange={(e) => {
                                                    setQcCustomerTaxId(e.target.value);
                                                    setQcCustomerErrors((prev) => ({ ...prev, tax_id: "" }));
                                                }}
                                                placeholder="π.χ. 123456789"
                                            />
                                            {qcCustomerErrors.tax_id && (
                                                <span className={styles.formError}>{qcCustomerErrors.tax_id}</span>
                                            )}
                                        </div>
                                    )}
                                    <div className={styles.formRow} style={{ marginTop: 16 }}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Τηλέφωνο</label>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                value={qcCustomerPhone}
                                                onChange={(e) => setQcCustomerPhone(e.target.value)}
                                                placeholder="π.χ. 6945001122"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Email</label>
                                            <input
                                                type="email"
                                                className={styles.formInput}
                                                value={qcCustomerEmail}
                                                onChange={(e) => setQcCustomerEmail(e.target.value)}
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
