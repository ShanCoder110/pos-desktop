import { routes } from "@/shared/constants/routes";

const BLOCKED_PAYMENT = new Set(["RETURNED", "PARTIALLY_RETURNED"]);

/**
 * Why POS edit is blocked, or `null` when Edit is allowed.
 * Fully / partially returned invoices are blocked (no net-of-return loader).
 */
export function invoicePosEditBlockReason(invoice: {
  status: string;
  paymentStatus?: string | null;
}): string | null {
  if (invoice.status !== "COMPLETED") {
    return "Only completed invoices can be edited.";
  }
  const payment = (invoice.paymentStatus ?? "").toUpperCase();
  if (payment === "RETURNED") {
    return "Fully returned invoices cannot be edited.";
  }
  if (payment === "PARTIALLY_RETURNED") {
    return "Partially returned invoices cannot be edited.";
  }
  if (BLOCKED_PAYMENT.has(payment)) {
    return "This invoice cannot be edited.";
  }
  return null;
}

export function canOpenInvoicePosEdit(invoice: { status: string; paymentStatus?: string | null }) {
  return invoicePosEditBlockReason(invoice) === null;
}

/** Canonical POS edit URL for an invoice id (`/pos?edit=<id>`). */
export function invoicePosEditHref(invoiceId: string) {
  return `${routes.pos}?edit=${encodeURIComponent(invoiceId)}`;
}

/** `search` for `navigate({ pathname, search })` — includes leading `?` (RR v6). */
export function invoicePosEditSearch(invoiceId: string) {
  return `?edit=${encodeURIComponent(invoiceId)}`;
}
