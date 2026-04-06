/**
 * Document type configuration for Sales and Purchases.
 * Labels and colors in Greek. Aligned with invoices-status-map.md.
 * Status is NEVER set by user - only via button actions.
 */

export const SALES_DOC_TYPES = [
    { value: "QUO", label: "Προσφορά", prefix: "QUO", badgeColor: "#6366f1" },
    { value: "SO", label: "Παραγγελία Πώλησης", prefix: "SO", badgeColor: "#8b5cf6" },
    { value: "REC", label: "Απόδειξη", prefix: "REC", badgeColor: "#22c55e" },
    { value: "INV", label: "Τιμολόγιο", prefix: "INV", badgeColor: "#3b82f6" },
    { value: "CRN", label: "Πιστωτικό Τιμολόγιο", prefix: "CRN", badgeColor: "#f59e0b" },
    { value: "DNO", label: "Δελτίο Αποστολής", prefix: "DNO", badgeColor: "#8b5cf6" },
] as const;

export const PURCHASE_DOC_TYPES = [
    { value: "PO", label: "Παραγγελία Αγοράς", prefix: "PO", badgeColor: "#6366f1" },
    { value: "GRN", label: "Δελτίο Παραλαβής", prefix: "GRN", badgeColor: "#a855f7" },
    { value: "PUR", label: "Τιμολόγιο Αγοράς", prefix: "PUR", badgeColor: "#0ea5e9" },
    { value: "DBN", label: "Πιστωτικό Αγοράς", prefix: "DBN", badgeColor: "#f59e0b" },
] as const;

/** Options for [+ Νέο Παραστατικό] dropdown - documents creatable from scratch */
export const SALES_NEW_DOC_OPTIONS = [
    { value: "INV", label: "Τιμολόγιο" },
    { value: "REC", label: "Απόδειξη" },
    { value: "QUO", label: "Προσφορά" },
    { value: "SO", label: "Παραγγελία Πώλησης" },
] as const;

export const PURCHASE_NEW_DOC_OPTIONS = [
    { value: "PUR", label: "Τιμολόγιο Αγοράς" },
    { value: "GRN", label: "Δελτίο Παραλαβής" },
    { value: "PO", label: "Παραγγελία Αγοράς" },
] as const;

export type SalesDocType = (typeof SALES_DOC_TYPES)[number]["value"];
export type PurchaseDocType = (typeof PURCHASE_DOC_TYPES)[number]["value"];

/** Sales statuses per document type (Greek labels) - status is set only via button actions */
export const SALES_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    draft: { label: "Πρόχειρο", color: "#9ca3af" },
    sent: { label: "Απεστάλη", color: "#3b82f6" },
    finalized: { label: "Οριστικοποιημένη", color: "#3b82f6" },
    completed: { label: "Ολοκλήρωση", color: "#22c55e" },
    cancelled: { label: "Ακυρώθηκε", color: "#ef4444" },
    converted: { label: "Μετατράπηκε", color: "#8b5cf6" },
    accepted: { label: "Αποδεκτή", color: "#22c55e" },
    rejected: { label: "Απορριφθείσα", color: "#ef4444" },
    expired: { label: "Έληξε", color: "#f59e0b" },
    invoiced: { label: "Τιμολογήθηκε", color: "#0ea5e9" },
    open: { label: "Ανοιχτή", color: "#3b82f6" },
    partially_shipped: { label: "Μερική Παράδοση", color: "#f59e0b" },
    pending_invoicing: { label: "Προς Τιμολόγηση", color: "#6366f1" },
    unpaid: { label: "Απλήρωτο", color: "#f59e0b" },
    partial: { label: "Μερικώς Εξοφλημένο", color: "#f59e0b" },
    paid: { label: "Εξοφλημένο", color: "#22c55e" },
    reversed: { label: "Αντιλογισμένο", color: "#6b7280" },
    credited: { label: "Πιστωμένο", color: "#22c55e" },
    closed: { label: "Κλειστό", color: "#6b7280" },
    posted: { label: "Οριστικοποιημένο", color: "#22c55e" },
};

/** Purchase statuses (Greek labels) */
export const PURCHASE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    draft: { label: "Πρόχειρο", color: "#9ca3af" },
    ordered: { label: "Παραγγελία", color: "#f59e0b" },
    sent: { label: "Απεσταλμένη / Ανοιχτή", color: "#3b82f6" },
    partially_received: { label: "Μερική Παραλαβή", color: "#f59e0b" },
    closed: { label: "Κλειστή", color: "#6b7280" },
    received: { label: "Έλαβα", color: "#3b82f6" },
    completed: { label: "Ολοκλήρωση", color: "#22c55e" },
    cancelled: { label: "Ακυρώθηκε", color: "#ef4444" },
    invoiced: { label: "Τιμολογήθηκε", color: "#0ea5e9" },
    pending_invoice: { label: "Προς Τιμολόγηση", color: "#6366f1" },
    reversed: { label: "Αντιλογισμένο", color: "#6b7280" },
    unpaid: { label: "Απλήρωτο", color: "#f59e0b" },
    partial: { label: "Μερικώς Εξοφλημένο", color: "#f59e0b" },
    paid: { label: "Εξοφλημένο", color: "#22c55e" },
    credited: { label: "Πιστωμένο", color: "#22c55e" },
    posted: { label: "Οριστικοποιημένο", color: "#22c55e" },
};

const LEGACY_SALES_MAP: Record<string, string> = { receipt: "REC", invoice: "INV" };

export function getSalesDocTypeLabel(value: string): string {
    const normalized = LEGACY_SALES_MAP[value?.toLowerCase()] ?? value;
    const t = SALES_DOC_TYPES.find((x) => x.value === normalized);
    return t?.label ?? value;
}

export function getSalesDocTypeConfig(value: string): (typeof SALES_DOC_TYPES)[number] | null {
    const normalized = LEGACY_SALES_MAP[value?.toLowerCase()] ?? value;
    return SALES_DOC_TYPES.find((x) => x.value === normalized) ?? null;
}

export function getPurchaseDocTypeLabel(value: string): string {
    const normalized = (value || "").toString().toUpperCase();
    const t = PURCHASE_DOC_TYPES.find((x) => x.value === normalized);
    return t?.label ?? value;
}

export function getSalesStatusLabel(status: string): string {
    return SALES_STATUS_CONFIG[status]?.label ?? status;
}

export function getPurchaseStatusLabel(status: string): string {
    return PURCHASE_STATUS_CONFIG[status]?.label ?? status;
}
