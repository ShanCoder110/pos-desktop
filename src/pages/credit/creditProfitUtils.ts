import type { InvoiceRow, LedgerRow } from "@/shared/domain/types";

const PAID_LEDGER_TYPES = new Set(["PAYMENT_RECEIVED", "PAYMENT", "PAYMENT_MADE", "RETURN"]);

/**
 * Calculates the total gross profit for an invoice across its line items.
 */
export function calculateInvoiceGrossProfit(invoice: InvoiceRow): number {
  if (!invoice.items || invoice.items.length === 0) return 0;
  return invoice.items.reduce((sum, item) => sum + (item.grossProfit ?? 0), 0);
}

/** Ledger-backed sold / paid / balance. Revise ADJUSTMENTs net against SALE (no double count). */
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
 * Calculates the Profit on Hold for an invoice.
 * Option A (Proportional):
 * When unpaid/credit amount is outstanding:
 * profitHold = totalGrossProfit * (creditAmount / total)
 * If total <= 0 or creditAmount <= 0, profitHold is 0.
 */
export function calculateInvoiceProfitHold(invoice: InvoiceRow): number {
  if (invoice.total <= 0 || invoice.creditAmount <= 0) return 0;
  const grossProfit = calculateInvoiceGrossProfit(invoice);
  if (grossProfit <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, invoice.creditAmount / invoice.total));
  return grossProfit * ratio;
}

/**
 * Calculates the Realized Profit for an invoice so far.
 * Realized tracks the paid share of GP. A full unpaid return (credit=0, paid=0)
 * leaves both hold and realized at 0.
 */
export function calculateInvoiceRealizedProfit(invoice: InvoiceRow): number {
  if (invoice.total <= 0) return 0;
  const grossProfit = calculateInvoiceGrossProfit(invoice);
  if (grossProfit <= 0) return 0;
  const paid = Math.max(0, Number(invoice.paidAmount) || 0);
  const ratio = Math.min(1, paid / invoice.total);
  return grossProfit * ratio;
}

/**
 * Aggregates credit stats across a collection of credit invoices.
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
    totalGrossProfit += gross;
    totalProfitOnHold += hold;
    totalRealizedProfit += Math.max(0, gross - hold);
  }

  return {
    invoiceCount: invoices.length,
    totalInvoiced,
    totalPaid,
    totalCreditOutstanding,
    totalGrossProfit,
    totalProfitOnHold,
    totalRealizedProfit,
  };
}
