/**
 * Document specification aligned with invoices-status-map.md.
 * Status is never set directly by user - only via button actions.
 */

const PURCHASE_DOC_TYPES = ['PO', 'GRN', 'PUR', 'CN'];
const SALES_DOC_TYPES = ['QUO', 'SO', 'DNO', 'INV', 'REC', 'CRN'];

const STATUS_LABELS = {
  draft: 'Πρόχειρο',
  sent: 'Απεσταλμένη / Ανοιχτή',
  partially_received: 'Μερική Παραλαβή',
  closed: 'Κλειστή',
  completed: 'Ολοκληρωμένη',
  cancelled: 'Ακυρωμένη',
  pending_invoice: 'Προς Τιμολόγηση',
  invoiced: 'Τιμολογημένο',
  reversed: 'Αντιλογισμένο',
  unpaid: 'Απλήρωτο',
  partial: 'Μερικώς Εξοφλημένο',
  paid: 'Εξοφλημένο',
  credited: 'Πιστωμένο',
  posted: 'Οριστικοποιημένο',
  open: 'Ανοιχτή',
  partially_shipped: 'Μερική Παράδοση',
  converted: 'Μετατράπηκε',
  expired: 'Έληξε',
  finalized: 'Οριστικοποιημένη',
  accepted: 'Αποδεκτή',
  rejected: 'Απορριφθείσα',
  pending_invoicing: 'Προς Τιμολόγηση',
};

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

/**
 * Returns buttons available for a purchase document given its type, status, and payment_status.
 * @returns {Array<{key: string, label: string, disabled?: boolean, tooltip?: string}>}
 */
function getPurchaseButtons(documentType, status, paymentStatus, hasPayments, hasLinkedInvoice, extras) {
  const s = (status || '').toLowerCase();
  const doc = (documentType || 'PUR').toUpperCase();
  const fullyCredited = !!(extras && extras.fullyCredited);
  const cnCloseReason = (extras && extras.cnCloseReason) || null;
  // credit_status is independent of payment_status (cash). Only PURs carry it.
  // It reflects ONLY non-reversed, non-draft CNs — Reversed CNs drop out, so a
  // PUR whose only CN was reversed has credit_status = null.
  const creditStatus = (extras && extras.creditStatus) || null;
  // Set when the PUR has any CN currently in Draft. Blocks reversal because a
  // draft CN must be deleted before the invoice itself can be reversed.
  const hasDraftCn = !!(extras && extras.hasDraftCn);
  // amount_due drives record_payment visibility/enabling: if the PUR has no
  // remaining cash balance (fully paid OR fully offset by credits) there is
  // nothing to receive — button stays visible but disabled.
  const amountDue = Number((extras && extras.amountDue) != null ? extras.amountDue : 0);

  if (doc === 'PO') {
    if (s === 'draft') return [
      { key: 'save', label: 'Αποθήκευση' },
      { key: 'finalize', label: 'Οριστικοποίηση / Αποστολή Παραγγελίας' },
      { key: 'delete', label: 'Διαγραφή' },
    ];
    if (s === 'sent' || s === 'ordered') return [
      { key: 'create_grn', label: 'Παραλαβή Αγαθών' },
      { key: 'cancel_order', label: 'Ακύρωση Παραγγελίας' },
      { key: 'pdf', label: 'Λήψη PDF' },
    ];
    if (s === 'partially_received') return [
      { key: 'create_grn', label: 'Παραλαβή Αγαθών' },
      { key: 'close_order', label: 'Κλείσιμο Παραγγελίας' },
      { key: 'pdf', label: 'Λήψη PDF' },
    ];
    if (s === 'closed' || s === 'completed' || s === 'cancelled') return [
      { key: 'pdf', label: 'Λήψη PDF' },
    ];
  }

  if (doc === 'GRN') {
    if (s === 'draft') return [
      { key: 'save', label: 'Αποθήκευση' },
      { key: 'finalize', label: 'Οριστικοποίηση Παραλαβής' },
      { key: 'delete', label: 'Διαγραφή' },
    ];
    if (s === 'pending_invoice' || s === 'received') {
      const reverseBtn = { key: 'reverse', label: 'Αντιλογισμός Δελτίου' };
      if (hasLinkedInvoice) {
        reverseBtn.disabled = true;
        reverseBtn.tooltip = 'Υπάρχει συνδεδεμένο Τιμολόγιο Αγοράς. Διαγράψτε πρώτα το τιμολόγιο.';
      }
      return [
        { key: 'create_invoice', label: 'Δημιουργία Τιμολογίου Αγοράς' },
        reverseBtn,
        { key: 'pdf', label: 'Εκτύπωση PDF' },
      ];
    }
    if (s === 'invoiced') return [
      { key: 'reverse', label: 'Αντιλογισμός Δελτίου', disabled: true, tooltip: 'Το δελτίο έχει τιμολογηθεί. Ακυρώστε πρώτα το Τιμολόγιο Αγοράς.' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
    if (s === 'reversed') return [{ key: 'pdf', label: 'Εκτύπωση PDF' }];
  }

  if (doc === 'PUR') {
    if (s === 'draft') return [
      { key: 'save', label: 'Αποθήκευση' },
      { key: 'finalize', label: 'Οριστικοποίηση' },
      { key: 'delete', label: 'Διαγραφή' },
    ];
    if (s === 'reversed') return [{ key: 'pdf', label: 'Εκτύπωση PDF' }];
    if (s !== 'draft') {
      // Reversal is blocked by, in priority order:
      //  1) any posted cash payment on the PUR,
      //  2) any linked CN currently in Draft (must be deleted first),
      //  3) any linked CN currently Posted/Open (must be reversed first).
      // Reversed CNs never block — they're already undone.
      const hasPostedCreditNote = creditStatus === 'partially_credited' || creditStatus === 'credited';
      let reverseTooltip = null;
      if (hasPayments) {
        reverseTooltip = 'Υπάρχει καταχωρημένη πληρωμή. Διαγράψτε πρώτα την Πληρωμή για να προχωρήσετε.';
      } else if (hasDraftCn) {
        reverseTooltip = 'Υπάρχει πιστωτικό σε πρόχειρο. Διαγράψτε πρώτα το Πιστωτικό για να προχωρήσετε.';
      } else if (hasPostedCreditNote) {
        reverseTooltip = 'Υπάρχει ενεργό πιστωτικό. Αντιλογίστε πρώτα το Πιστωτικό για να προχωρήσετε.';
      }
      const reverseDisabled = hasPayments || hasDraftCn || hasPostedCreditNote;
      const recordPaymentDisabled = !(amountDue > 0);
      return [
        {
          key: 'record_payment',
          label: 'Καταχώρηση Πληρωμής',
          disabled: recordPaymentDisabled,
          tooltip: recordPaymentDisabled
            ? 'Το υπόλοιπο του τιμολογίου είναι 0. Δεν απαιτείται επιπλέον πληρωμή.'
            : null,
        },
        { key: 'create_credit_note', label: 'Δημιουργία Πιστωτικού', disabled: fullyCredited, tooltip: fullyCredited ? 'Όλα τα είδη του τιμολογίου έχουν ήδη πιστωθεί.' : null },
        { key: 'reverse', label: 'Αντιλογισμός Τιμολογίου', disabled: reverseDisabled, tooltip: reverseTooltip },
        { key: 'pdf', label: 'Εκτύπωση PDF' },
      ];
    }
  }

  if (doc === 'CN') {
    if (s === 'draft') return [
      { key: 'save', label: 'Αποθήκευση' },
      { key: 'finalize', label: 'Οριστικοποίηση' },
      { key: 'delete', label: 'Διαγραφή' },
    ];
    if (s === 'posted' || s === 'completed') return [
      { key: 'create_receipt', label: 'Καταχώρηση Είσπραξης' },
      { key: 'reverse', label: 'Αντιλογισμός Πιστωτικού' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
    if (s === 'closed') {
      const closedTooltip = cnCloseReason === 'fully_credited'
        ? 'Το πιστωτικό είναι κλειστό. Το τιμολόγιο έχει πιστωθεί πλήρως.'
        : 'Το πιστωτικό είναι κλειστό. Ακυρώστε πρώτα την Είσπραξη για να προχωρήσετε.';
      return [
        { key: 'reverse', label: 'Αντιλογισμός Πιστωτικού', disabled: true, tooltip: closedTooltip },
        { key: 'pdf', label: 'Εκτύπωση PDF' },
      ];
    }
    if (s === 'reversed') return [{ key: 'pdf', label: 'Εκτύπωση PDF' }];
  }

  return [];
}

/**
 * Returns buttons available for a sale document.
 */
function getSalesButtons(invoiceType, status, paymentStatus, hasReceipts, hasLinkedInvoice) {
  const s = (status || '').toLowerCase();
  const doc = (invoiceType || 'REC').toUpperCase();

  if (doc === 'QUO') {
    if (s === 'draft') return [
      { key: 'save', label: 'Αποθήκευση' },
      { key: 'finalize', label: 'Οριστικοποίηση' },
      { key: 'delete', label: 'Διαγραφή' },
    ];
    if (s === 'sent' || s === 'finalized') return [
      { key: 'send_email', label: 'Αποστολή με Email' },
      { key: 'accept', label: 'Αποδοχή & Δημιουργία Παραγγελίας' },
      { key: 'reject', label: 'Απόρριψη' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
    if (s === 'accepted' || s === 'rejected' || s === 'converted') return [
      { key: 'send_email', label: 'Αποστολή με Email' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
  }

  if (doc === 'SO') {
    if (s === 'draft') return [
      { key: 'save', label: 'Αποθήκευση' },
      { key: 'finalize', label: 'Οριστικοποίηση / Έγκριση' },
      { key: 'delete', label: 'Διαγραφή' },
    ];
    if (s === 'open') return [
      { key: 'create_delivery', label: 'Δημιουργία Δελτίου Αποστολής' },
      { key: 'send_email', label: 'Αποστολή με Email' },
      { key: 'cancel', label: 'Ακύρωση Παραγγελίας' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
    if (s === 'partially_shipped') return [
      { key: 'create_delivery', label: 'Δημιουργία Δελτίου Αποστολής' },
      { key: 'close_order', label: 'Κλείσιμο Παραγγελίας' },
      { key: 'send_email', label: 'Αποστολή με Email' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
    if (s === 'completed' || s === 'closed') return [
      { key: 'send_email', label: 'Αποστολή με Email' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
    if (s === 'cancelled') return [{ key: 'pdf', label: 'Εκτύπωση PDF' }];
  }

  if (doc === 'DNO') {
    if (s === 'draft') return [
      { key: 'save', label: 'Αποθήκευση' },
      { key: 'finalize', label: 'Οριστικοποίηση' },
      { key: 'delete', label: 'Διαγραφή' },
    ];
    if (s === 'pending_invoicing' || s === 'completed') return [
      { key: 'create_invoice', label: 'Έκδοση Τιμολογίου' },
      { key: 'create_receipt', label: 'Έκδοση Απόδειξης' },
      { key: 'reverse', label: 'Αντιλογισμός Δελτίου', disabled: hasLinkedInvoice, tooltip: hasLinkedInvoice ? 'Το δελτίο έχει τιμολογηθεί. Αντιλογίστε πρώτα το Τιμολόγιο.' : null },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
    if (s === 'invoiced') return [
      { key: 'reverse', label: 'Αντιλογισμός Δελτίου', disabled: true, tooltip: 'Το δελτίο έχει τιμολογηθεί.' },
      { key: 'send_email', label: 'Αποστολή με Email' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
    if (s === 'reversed') return [{ key: 'pdf', label: 'Εκτύπωση PDF' }];
  }

  if (doc === 'INV' || doc === 'REC') {
    if (s === 'draft') return [
      { key: 'save', label: 'Αποθήκευση' },
      { key: 'finalize', label: doc === 'INV' ? 'Οριστικοποίηση & Έκδοση' : 'Οριστικοποίηση & Έκδοση' },
      { key: 'delete', label: 'Διαγραφή' },
    ];
    const pay = (paymentStatus || '').toLowerCase();
    if (s !== 'draft' && s !== 'reversed') return [
      { key: 'record_receipt', label: 'Καταχώρηση Είσπραξης', show: pay !== 'paid' },
      { key: 'reverse', label: 'Αντιλογισμός Τιμολογίου', disabled: hasReceipts, tooltip: hasReceipts ? 'Διαγράψτε πρώτα τις Εισπράξεις για να προχωρήσετε' : null },
      { key: 'create_credit_note', label: 'Δημιουργία Πιστωτικού' },
      { key: 'send_email', label: 'Αποστολή με Email' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ].filter(b => b.show !== false);
    if (s === 'reversed') return [
      { key: 'send_email', label: 'Αποστολή με Email' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
  }

  if (doc === 'CRN') {
    if (s === 'draft') return [
      { key: 'save', label: 'Αποθήκευση' },
      { key: 'finalize', label: 'Οριστικοποίηση' },
      { key: 'delete', label: 'Διαγραφή' },
    ];
    if (s === 'open' || s === 'completed' || s === 'posted') return [
      { key: 'apply', label: 'Συμψηφισμός με Τιμολόγιο' },
      { key: 'refund', label: 'Επιστροφή Χρημάτων' },
      { key: 'reverse', label: 'Αντιλογισμός Πιστωτικού' },
      { key: 'send_email', label: 'Αποστολή με Email' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
    if (s === 'closed' || s === 'reversed') return [
      { key: 'send_email', label: 'Αποστολή με Email' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
  }

  return [];
}

/**
 * Check if document is editable (form fields) based on type and status.
 */
function canEditPurchaseFields(documentType, status) {
  const s = (status || '').toLowerCase();
  const doc = (documentType || 'PUR').toUpperCase();
  if (s === 'draft') return true;
  return false;
}

function canEditSalesFields(invoiceType, status) {
  const s = (status || '').toLowerCase();
  const doc = (invoiceType || 'REC').toUpperCase();
  if (s === 'draft') return true;
  return false;
}

module.exports = {
  PURCHASE_DOC_TYPES,
  SALES_DOC_TYPES,
  STATUS_LABELS,
  getStatusLabel,
  getPurchaseButtons,
  getSalesButtons,
  canEditPurchaseFields,
  canEditSalesFields,
};
