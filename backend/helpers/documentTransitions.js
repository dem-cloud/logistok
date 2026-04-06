/**
 * Document status transitions - maps button actions to new status.
 * Status is never set directly; these are applied when user clicks a button.
 */

function getPurchaseNewStatus(documentType, currentStatus, action) {
  const doc = (documentType || 'PUR').toUpperCase();
  const s = (currentStatus || '').toLowerCase();
  const a = (action || '').toLowerCase();

  if (doc === 'PO') {
    if (a === 'finalize') return 'sent';
    if (a === 'cancel_order') return 'cancelled';
    if (a === 'close_order') return 'closed';
  }

  if (doc === 'GRN') {
    if (a === 'finalize') return 'pending_invoice';
    if (a === 'reverse') return 'reversed';
    if (a === 'create_invoice') return 'invoiced'; // set when invoice is created and linked
  }

  if (doc === 'PUR') {
    if (a === 'finalize') return 'unpaid';
    if (a === 'reverse') return 'reversed';
    if (a === 'create_credit_note' && s !== 'credited') return s; // credited when CN covers full amount
  }

  if (doc === 'DBN') {
    if (a === 'finalize') return 'posted';
    if (a === 'reverse') return 'reversed';
    if (a === 'apply' || a === 'refund') return 'closed';
  }

  return null;
}

function getSalesNewStatus(invoiceType, currentStatus, action) {
  const doc = (invoiceType || 'REC').toUpperCase();
  const s = (currentStatus || '').toLowerCase();
  const a = (action || '').toLowerCase();

  if (doc === 'QUO') {
    if (a === 'finalize') return 'sent';
    if (a === 'accept') return 'accepted';
    if (a === 'reject') return 'rejected';
  }

  if (doc === 'SO') {
    if (a === 'finalize') return 'open';
    if (a === 'cancel') return 'cancelled';
    if (a === 'close_order') return 'completed';
    if (a === 'create_delivery') return s === 'open' ? 'partially_shipped' : s;
  }

  if (doc === 'DNO') {
    if (a === 'finalize') return 'pending_invoicing';
    if (a === 'reverse') return 'reversed';
    if (a === 'create_invoice' || a === 'create_receipt') return 'invoiced';
  }

  if (doc === 'INV' || doc === 'REC') {
    if (a === 'finalize') return 'unpaid';
    if (a === 'reverse') return 'reversed';
  }

  if (doc === 'CRN') {
    if (a === 'finalize') return 'open';
    if (a === 'reverse') return 'reversed';
    if (a === 'apply' || a === 'refund') return 'closed';
  }

  return null;
}

/**
 * Validate if an action is allowed for current state.
 */
function canPerformPurchaseAction(documentType, status, paymentStatus, action, context) {
  const buttons = require('../config/documentSpec').getPurchaseButtons(
    documentType, status, paymentStatus,
    context?.hasPayments ?? false,
    context?.hasLinkedInvoice ?? false
  );
  const btn = buttons.find(b => b.key === action);
  return btn && !btn.disabled;
}

function canPerformSalesAction(invoiceType, status, paymentStatus, action, context) {
  const buttons = require('../config/documentSpec').getSalesButtons(
    invoiceType, status, paymentStatus,
    context?.hasReceipts ?? false,
    context?.hasLinkedInvoice ?? false
  );
  const btn = buttons.find(b => b.key === action);
  return btn && !btn.disabled;
}

/**
 * Get allowed statuses for transition from current state.
 * Used by backend to validate status changes. Includes currentStatus (no change) and all statuses reachable via button actions.
 */
function getAllowedPurchaseStatuses(documentType, currentStatus, context) {
  const { getPurchaseButtons } = require('../config/documentSpec');
  const buttons = getPurchaseButtons(
    documentType, currentStatus, context?.paymentStatus,
    context?.hasPayments ?? false,
    context?.hasLinkedInvoice ?? false
  );
  const statuses = new Set([currentStatus]); // allow no change (save)
  for (const btn of buttons) {
    if (btn.disabled) continue;
    const s = getPurchaseNewStatus(documentType, currentStatus, btn.key);
    if (s) statuses.add(s);
  }
  return Array.from(statuses);
}

/** Map spec status to DB status for backward compatibility with existing data. */
function mapSalesSpecStatusToDb(invoiceType, specStatus) {
  const doc = (invoiceType || '').toUpperCase();
  const s = (specStatus || '').toLowerCase();
  if (doc === 'REC' || doc === 'INV') {
    if (s === 'unpaid') return 'completed';
    if (s === 'reversed') return 'cancelled';
  }
  if (doc === 'DNO') {
    if (s === 'pending_invoicing') return 'completed';
  }
  if (doc === 'CRN') {
    if (s === 'open') return 'completed';
  }
  return specStatus;
}

function getAllowedSalesStatuses(invoiceType, currentStatus, context) {
  const { getSalesButtons } = require('../config/documentSpec');
  const buttons = getSalesButtons(
    invoiceType, currentStatus, context?.paymentStatus,
    context?.hasReceipts ?? false,
    context?.hasLinkedInvoice ?? false
  );
  const statuses = new Set([currentStatus]);
  for (const btn of buttons) {
    if (btn.disabled) continue;
    const s = getSalesNewStatus(invoiceType, currentStatus, btn.key);
    if (s) {
      statuses.add(s);
      const dbS = mapSalesSpecStatusToDb(invoiceType, s);
      if (dbS !== s) statuses.add(dbS);
    }
  }
  return Array.from(statuses);
}

module.exports = {
  getPurchaseNewStatus,
  getSalesNewStatus,
  canPerformPurchaseAction,
  canPerformSalesAction,
  getAllowedPurchaseStatuses,
  getAllowedSalesStatuses,
};
