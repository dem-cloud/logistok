/**
 * Document specification aligned with invoices-status-map.md.
 * Status is never set directly by user - only via button actions.
 */

const PURCHASE_DOC_TYPES = ['PO', 'GRN', 'PUR', 'DBN'];
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
function getPurchaseButtons(documentType, status, paymentStatus, hasPayments, hasLinkedInvoice) {
  const s = (status || '').toLowerCase();
  const doc = (documentType || 'PUR').toUpperCase();

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
    if (s === 'pending_invoice' || s === 'received') return [
      { key: 'create_invoice', label: 'Δημιουργία Τιμολογίου Αγοράς' },
      { key: 'reverse', label: 'Αντιλογισμός Δελτίου' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
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
    const pay = (paymentStatus || '').toLowerCase();
    if (s !== 'draft' && s !== 'reversed') {
      const reverseDisabled = hasPayments;
      return [
        { key: 'record_payment', label: 'Καταχώρηση Πληρωμής', show: pay !== 'paid' },
        { key: 'create_credit_note', label: 'Δημιουργία Πιστωτικού' },
        { key: 'reverse', label: 'Αντιλογισμός Τιμολογίου', disabled: reverseDisabled, tooltip: reverseDisabled ? 'Διαγράψτε πρώτα τις Πληρωμές για να προχωρήσετε' : null },
        { key: 'pdf', label: 'Εκτύπωση PDF' },
      ].filter(b => b.show !== false);
    }
    if (s === 'reversed') return [{ key: 'pdf', label: 'Εκτύπωση PDF' }];
    if (s === 'credited') return [{ key: 'pdf', label: 'Εκτύπωση PDF' }];
  }

  if (doc === 'DBN') {
    if (s === 'draft') return [
      { key: 'save', label: 'Αποθήκευση' },
      { key: 'finalize', label: 'Οριστικοποίηση' },
      { key: 'delete', label: 'Διαγραφή' },
    ];
    if (s === 'posted' || s === 'completed') return [
      { key: 'apply', label: 'Συμψηφισμός με Τιμολόγιο' },
      { key: 'refund', label: 'Καταχώρηση Επιστροφής Χρημάτων' },
      { key: 'reverse', label: 'Αντιλογισμός Πιστωτικού' },
      { key: 'pdf', label: 'Εκτύπωση PDF' },
    ];
    if (s === 'closed' || s === 'reversed') return [{ key: 'pdf', label: 'Εκτύπωση PDF' }];
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
