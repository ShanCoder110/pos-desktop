/**
 * Prefill helpers for POS invoice edit (`/pos?edit=` and Invoices → Edit).
 * Shared so Vitest can lock customer / payment / prior-balance behaviour.
 */

export type InvoiceEditPaymentPrefill = {
  payMethod: "cash" | "online" | "split";
  /** Cash tendered / applied toward the bill (open credit = total − this). */
  received: number;
  cashAmt: number;
  onlineAmt: number;
};

/** Derive cash/credit/split controls from invoice paid + credit (+ optional payment rows). */
export function invoiceEditPaymentPrefill(invoice: {
  paidAmount: number;
  creditAmount: number;
  total: number;
  payments?: { amount?: number; paymentMethod?: string | null }[] | null;
}): InvoiceEditPaymentPrefill {
  const paid = Math.max(0, Number(invoice.paidAmount) || 0);
  const payments = invoice.payments ?? [];
  const cashFromRows = payments
    .filter((p) => (p.paymentMethod ?? "CASH").toUpperCase() === "CASH")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const onlineFromRows = payments
    .filter((p) => {
      const m = (p.paymentMethod ?? "").toUpperCase();
      return m === "MOBILE" || m === "CARD" || m === "ONLINE" || m === "BANK";
    })
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  if (cashFromRows > 0 && onlineFromRows > 0) {
    return {
      payMethod: "split",
      received: 0,
      cashAmt: cashFromRows,
      onlineAmt: onlineFromRows,
    };
  }
  if (onlineFromRows > 0 && cashFromRows <= 0) {
    return {
      payMethod: "online",
      received: 0,
      cashAmt: 0,
      onlineAmt: onlineFromRows || paid,
    };
  }
  return {
    payMethod: "cash",
    received: paid,
    cashAmt: 0,
    onlineAmt: 0,
  };
}

/**
 * POS customer balance is negated ledger (`-currentBalance`). Open credit on the
 * invoice being edited is included in that balance — add it back so "Previous
 * balance" excludes this bill's outstanding credit.
 */
export function previousBalanceExcludingInvoiceCredit(
  customerPosBalance: number,
  invoiceCreditAmount: number,
) {
  return +(customerPosBalance + Math.max(0, Number(invoiceCreditAmount) || 0)).toFixed(2);
}

/** Snapshot of fields the edit loader must restore (customer, money, notes). */
export function invoiceEditLoadSnapshot(invoice: {
  customerId?: string | null;
  discount: number;
  notes?: string | null;
  paidAmount: number;
  creditAmount: number;
  total: number;
  payments?: { amount?: number; paymentMethod?: string | null }[] | null;
}) {
  const payment = invoiceEditPaymentPrefill(invoice);
  return {
    customerId: invoice.customerId ?? "",
    billDiscount: Number(invoice.discount) || 0,
    notes: invoice.notes ?? "",
    creditOpen: Math.max(0, Number(invoice.creditAmount) || 0),
    ...payment,
  };
}
