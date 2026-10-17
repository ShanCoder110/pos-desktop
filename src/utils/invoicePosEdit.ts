import { routes } from "@/shared/constants/routes";

/** Completed invoices can be revised in POS (same gate as Invoices / POS today). */
export function canOpenInvoicePosEdit(invoice: { status: string }) {
  return invoice.status === "COMPLETED";
}

/** Canonical POS edit URL for an invoice id (`/pos?edit=<id>`). */
export function invoicePosEditHref(invoiceId: string) {
  return `${routes.pos}?edit=${encodeURIComponent(invoiceId)}`;
}

/** `search` for `navigate({ pathname, search })` — includes leading `?` (RR v6). */
export function invoicePosEditSearch(invoiceId: string) {
  return `?edit=${encodeURIComponent(invoiceId)}`;
}
