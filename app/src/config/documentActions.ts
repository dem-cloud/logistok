/**
 * Document action buttons - aligned with backend documentSpec.
 * Used to drive footer buttons in Sales/Purchases sidepopup.
 * Also drives list row icon buttons (same actions, icon-only + Edit).
 */

/** Icon names for list row (lucide-react component names) */
export const SALES_ACTION_ICON: Record<string, string> = {
    send_email: "Mail",
    pdf: "FileDown",
    delete: "Trash2",
    accept: "Check",
    record_receipt: "Banknote",
    create_credit_note: "RotateCcw",
    create_invoice: "FileText",
    create_receipt: "Receipt",
    reverse: "RotateCcw",
    cancel: "XCircle",
    create_delivery: "Package",
    close_order: "XCircle",
    reject: "X",
    apply: "Link2",
    refund: "Banknote",
};

export const PURCHASE_ACTION_ICON: Record<string, string> = {
    pdf: "FileDown",
    delete: "Trash2",
    record_payment: "Banknote",
    create_credit_note: "RotateCcw",
    create_invoice: "ArrowRight",
    create_grn: "Package",
    reverse: "RotateCcw",
    cancel_order: "XCircle",
    close_order: "XCircle",
    apply: "Link2",
    refund: "Banknote",
};

export type DocumentActionButton = {
    key: string;
    label: string;
    disabled?: boolean;
    tooltip?: string | null;
    show?: boolean;
};

export function getPurchaseButtons(
    documentType: string,
    status: string,
    paymentStatus: string | null | undefined,
    hasPayments: boolean,
    hasLinkedInvoice: boolean
): DocumentActionButton[] {
    const s = (status || "").toLowerCase();
    const doc = (documentType || "PUR").toUpperCase();

    if (doc === "PO") {
        if (s === "draft") return [
            { key: "save", label: "Αποθήκευση" },
            { key: "finalize", label: "Οριστικοποίηση / Αποστολή Παραγγελίας" },
            { key: "delete", label: "Διαγραφή" },
        ];
        if (s === "sent" || s === "ordered") return [
            { key: "create_grn", label: "Παραλαβή Αγαθών" },
            { key: "cancel_order", label: "Ακύρωση Παραγγελίας" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (s === "partially_received") return [
            { key: "create_grn", label: "Παραλαβή Αγαθών" },
            { key: "close_order", label: "Κλείσιμο Παραγγελίας" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (["closed", "completed", "cancelled"].includes(s)) return [
            { key: "pdf", label: "Λήψη PDF" },
        ];
    }

    if (doc === "GRN") {
        if (s === "draft") return [
            { key: "save", label: "Αποθήκευση" },
            { key: "finalize", label: "Οριστικοποίηση Παραλαβής" },
            { key: "delete", label: "Διαγραφή" },
        ];
        if (["pending_invoice", "received", "completed"].includes(s)) return [
            { key: "create_invoice", label: "Δημιουργία Τιμολογίου Αγοράς" },
            { key: "reverse", label: "Αντιλογισμός Δελτίου" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (s === "invoiced") return [
            { key: "reverse", label: "Αντιλογισμός Δελτίου", disabled: true, tooltip: "Το δελτίο έχει τιμολογηθεί." },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (s === "reversed") return [{ key: "pdf", label: "Λήψη PDF" }];
    }

    if (doc === "PUR") {
        if (s === "draft") return [
            { key: "save", label: "Αποθήκευση" },
            { key: "finalize", label: "Οριστικοποίηση" },
            { key: "delete", label: "Διαγραφή" },
        ];
        if (s === "reversed" || s === "credited") return [{ key: "pdf", label: "Λήψη PDF" }];
        if (s !== "draft") {
            const reverseDisabled = hasPayments;
            return [
                { key: "record_payment", label: "Καταχώρηση Πληρωμής", show: (paymentStatus || "").toLowerCase() !== "paid" },
                { key: "create_credit_note", label: "Δημιουργία Πιστωτικού" },
                { key: "reverse", label: "Αντιλογισμός Τιμολογίου", disabled: reverseDisabled, tooltip: reverseDisabled ? "Υπάρχει συνδεδεμένη πληρωμή. Διαγράψτε ή ακυρώστε πρώτα την πληρωμή." : undefined },
                { key: "pdf", label: "Λήψη PDF" },
            ].filter((b) => b.show !== false);
        }
    }

    if (doc === "DBN") {
        if (s === "draft") return [
            { key: "save", label: "Αποθήκευση" },
            { key: "finalize", label: "Οριστικοποίηση" },
            { key: "delete", label: "Διαγραφή" },
        ];
        if (["posted", "completed"].includes(s)) return [
            { key: "apply", label: "Συμψηφισμός με Τιμολόγιο" },
            { key: "refund", label: "Καταχώρηση Επιστροφής Χρημάτων" },
            { key: "reverse", label: "Αντιλογισμός Πιστωτικού" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (["closed", "reversed"].includes(s)) return [{ key: "pdf", label: "Λήψη PDF" }];
    }

    return [];
}

export function getSalesButtons(
    invoiceType: string,
    status: string,
    paymentStatus: string | null | undefined,
    hasReceipts: boolean,
    hasLinkedInvoice: boolean
): DocumentActionButton[] {
    const s = (status || "").toLowerCase();
    const doc = (invoiceType || "REC").toUpperCase();

    if (doc === "QUO") {
        if (s === "draft") return [
            { key: "save", label: "Αποθήκευση" },
            { key: "finalize", label: "Οριστικοποίηση" },
            { key: "delete", label: "Διαγραφή" },
        ];
        if (["sent", "finalized"].includes(s)) return [
            { key: "send_email", label: "Αποστολή με Email" },
            { key: "accept", label: "Αποδοχή & Δημιουργία Παραγγελίας" },
            { key: "reject", label: "Απόρριψη" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (["accepted", "rejected", "converted"].includes(s)) return [
            { key: "send_email", label: "Αποστολή με Email" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
    }

    if (doc === "SO") {
        if (s === "draft") return [
            { key: "save", label: "Αποθήκευση" },
            { key: "finalize", label: "Οριστικοποίηση / Έγκριση" },
            { key: "delete", label: "Διαγραφή" },
        ];
        if (s === "open" || s === "completed") return [
            { key: "create_delivery", label: "Δημιουργία Δελτίου Αποστολής" },
            { key: "send_email", label: "Αποστολή με Email" },
            { key: "cancel", label: "Ακύρωση Παραγγελίας" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (s === "partially_shipped") return [
            { key: "create_delivery", label: "Δημιουργία Δελτίου Αποστολής" },
            { key: "close_order", label: "Κλείσιμο Παραγγελίας" },
            { key: "send_email", label: "Αποστολή με Email" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (["completed", "closed"].includes(s)) return [
            { key: "send_email", label: "Αποστολή με Email" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (s === "cancelled") return [{ key: "pdf", label: "Λήψη PDF" }];
    }

    if (doc === "DNO") {
        if (s === "draft") return [
            { key: "save", label: "Αποθήκευση" },
            { key: "finalize", label: "Οριστικοποίηση" },
            { key: "delete", label: "Διαγραφή" },
        ];
        if (["pending_invoicing", "completed"].includes(s)) return [
            { key: "create_invoice", label: "Έκδοση Τιμολογίου" },
            { key: "create_receipt", label: "Έκδοση Απόδειξης" },
            { key: "reverse", label: "Αντιλογισμός Δελτίου", disabled: hasLinkedInvoice, tooltip: hasLinkedInvoice ? "Το δελτίο έχει τιμολογηθεί." : undefined },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (s === "invoiced") return [
            { key: "reverse", label: "Αντιλογισμός Δελτίου", disabled: true, tooltip: "Το δελτίο έχει τιμολογηθεί." },
            { key: "send_email", label: "Αποστολή με Email" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (s === "reversed") return [{ key: "pdf", label: "Λήψη PDF" }];
    }

    if (doc === "INV" || doc === "REC") {
        if (s === "draft") return [
            { key: "save", label: "Αποθήκευση" },
            { key: "finalize", label: doc === "INV" ? "Οριστικοποίηση & Έκδοση" : "Οριστικοποίηση & Έκδοση" },
            { key: "delete", label: "Διαγραφή" },
        ];
        if (s !== "draft" && s !== "reversed") return [
            { key: "record_receipt", label: "Καταχώρηση Είσπραξης", show: (paymentStatus || "").toLowerCase() !== "paid" },
            { key: "reverse", label: "Αντιλογισμός Τιμολογίου", disabled: hasReceipts, tooltip: hasReceipts ? "Διαγράψτε πρώτα τις Εισπράξεις" : undefined },
            { key: "create_credit_note", label: "Δημιουργία Πιστωτικού" },
            { key: "send_email", label: "Αποστολή με Email" },
            { key: "pdf", label: "Λήψη PDF" },
        ].filter((b) => b.show !== false);
        if (s === "reversed") return [
            { key: "send_email", label: "Αποστολή με Email" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
    }

    if (doc === "CRN") {
        if (s === "draft") return [
            { key: "save", label: "Αποθήκευση" },
            { key: "finalize", label: "Οριστικοποίηση" },
            { key: "delete", label: "Διαγραφή" },
        ];
        if (["open", "completed", "posted"].includes(s)) return [
            { key: "apply", label: "Συμψηφισμός με Τιμολόγιο" },
            { key: "refund", label: "Επιστροφή Χρημάτων" },
            { key: "reverse", label: "Αντιλογισμός Πιστωτικού" },
            { key: "send_email", label: "Αποστολή με Email" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
        if (["closed", "reversed"].includes(s)) return [
            { key: "send_email", label: "Αποστολή με Email" },
            { key: "pdf", label: "Λήψη PDF" },
        ];
    }

    return [];
}
