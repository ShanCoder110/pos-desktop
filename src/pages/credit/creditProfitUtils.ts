import type { InvoiceRow } from "@/shared/domain/types";

/**
 * Calculates the total gross profit for an invoice across its line items.
 */
export function calculateInvoiceGrossProfit(invoice: InvoiceRow): number {
  if (!invoice.items || invoice.items.length === 0) return 0;
  return invoice.items.reduce((sum, item) => sum + (item.grossProfit ?? 0), 0);
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
 * realizedProfit = totalGrossProfit - profitHold
 */
export function calculateInvoiceRealizedProfit(invoice: InvoiceRow): number {
  const grossProfit = calculateInvoiceGrossProfit(invoice);
  const profitHold = calculateInvoiceProfitHold(invoice);
  return Math.max(0, grossProfit - profitHold);
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
