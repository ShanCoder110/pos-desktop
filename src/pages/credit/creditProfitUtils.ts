import type { InvoiceRow, LedgerRow } from "@/shared/domain/types";

/** Cash collected (or refunded). Returns are not paid — they net sold instead. */
const PAID_LEDGER_TYPES = new Set(["PAYMENT_RECEIVED", "PAYMENT", "PAYMENT_MADE"]);

/**
 * Calculates the total gross profit for an invoice across its line items.
 */
export function calculateInvoiceGrossProfit(invoice: InvoiceRow): number {
  if (!invoice.items || invoice.items.length === 0) return 0;
  return invoice.items.reduce((sum, item) => sum + (item.grossProfit ?? 0), 0);
}

/**
 * Ledger-backed sold / paid / balance.
 * Sold nets SALE + revise ADJUSTMENT + RETURN (returns reduce sold).
 * Paid is cash only so sold − paid = balance.
 */
export function summarizeCreditLedger(entries: LedgerRow[], balanceAfter?: number) {
  let sold = 0;
  let paid = 0;
  for (const entry of entries) {
    const type = (entry.type || "").toUpperCase();
    const net = (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
    if (PAID_LEDGER_TYPES.has(type)) {
      paid += (Number(entry.credit) || 0) - (Number(entry.debit) || 0);
    } else {
      sold += net;
    }
  }
  const balance =
    balanceAfter !== undefined
      ? balanceAfter
      : entries.length
        ? Number(entries[entries.length - 1]?.balanceAfter) || 0
        : 0;
  return {
    sold: +sold.toFixed(2),
    paid: +paid.toFixed(2),
    balance: +balance.toFixed(2),
  };
}

/**
 * Net invoice value still on the books after returns (cash received + open credit).
 * Full return with no cash → 0; RETURNED/PARTIALLY_RETURNED never invent a paid share.
 */
export function invoiceNetRemaining(invoice: InvoiceRow): number {
  const paid = Math.max(0, Number(invoice.paidAmount) || 0);
  const credit = Math.max(0, Number(invoice.creditAmount) || 0);
  return +(paid + credit).toFixed(2);
}

/**
 * Profit still attributable to non-returned value.
 * remainingProfit = gross × (paid + credit) / total.
 * RETURNED with paid=0,credit=0 → 0 (not “fully paid”).
 */
export function calculateInvoiceRemainingProfit(invoice: InvoiceRow): number {
  if (invoice.total <= 0) return 0;
  const grossProfit = calculateInvoiceGrossProfit(invoice);
  if (grossProfit <= 0) return 0;
  const net = invoiceNetRemaining(invoice);
  if (net <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, net / invoice.total));
  return +(grossProfit * ratio).toFixed(4);
}

/**
 * Profit on hold = remaining profit × credit / (paid + credit)
 * ≡ gross × credit / total. Zero when no open credit (incl. full return).
 */
export function calculateInvoiceProfitHold(invoice: InvoiceRow): number {
  if (invoice.total <= 0 || invoice.creditAmount <= 0) return 0;
  const grossProfit = calculateInvoiceGrossProfit(invoice);
  if (grossProfit <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, invoice.creditAmount / invoice.total));
  return +(grossProfit * ratio).toFixed(4);
}

/**
 * Realized profit = remaining profit × paid / (paid + credit)
 * ≡ gross × paid / total. Cash only — never treat creditAmount 0 / RETURNED as paid.
 */
export function calculateInvoiceRealizedProfit(invoice: InvoiceRow): number {
  if (invoice.total <= 0) return 0;
  const grossProfit = calculateInvoiceGrossProfit(invoice);
  if (grossProfit <= 0) return 0;
  const paid = Math.max(0, Number(invoice.paidAmount) || 0);
  if (paid <= 0) return 0;
  const ratio = Math.min(1, paid / invoice.total);
  return +(grossProfit * ratio).toFixed(4);
}

/**
 * Aggregates credit stats across a collection of credit invoices.
 * Realized uses cash paid only — never gross − hold (that treated full returns as paid).
 */
export function summarizeCreditInvoices(invoices: InvoiceRow[]) {
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalCreditOutstanding = 0;
  let totalGrossProfit = 0;
  let totalProfitOnHold = 0;
  let totalRealizedProfit = 0;

  for (const inv of invoices) {
    totalInvoiced += inv.total;
    totalPaid += inv.paidAmount;
    totalCreditOutstanding += inv.creditAmount;
    const gross = calculateInvoiceGrossProfit(inv);
    const hold = calculateInvoiceProfitHold(inv);
    const realized = calculateInvoiceRealizedProfit(inv);
    totalGrossProfit += gross;
    totalProfitOnHold += hold;
    totalRealizedProfit += realized;
  }

  return {
    invoiceCount: invoices.length,
    totalInvoiced,
    totalPaid,
    totalCreditOutstanding,
    totalGrossProfit: +totalGrossProfit.toFixed(2),
    totalProfitOnHold: +totalProfitOnHold.toFixed(2),
    totalRealizedProfit: +totalRealizedProfit.toFixed(2),
  };
}
