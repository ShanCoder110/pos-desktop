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

function isOnlineMethod(method: string) {
  const m = method.toUpperCase();
  return m === "MOBILE" || m === "CARD" || m === "ONLINE" || m === "BANK";
}

function isCashMethod(method: string) {
  return (method || "CASH").toUpperCase() === "CASH";
}

function activePayments(
  payments:
    { amount?: number; paymentMethod?: string | null; status?: string | null }[] | null | undefined,
) {
  return (payments ?? []).filter((p) => (p.status ?? "COMPLETED").toUpperCase() !== "VOIDED");
}

/**
 * Prefill POS tender controls from payments taken **at sale** only.
 * `paidAmount` may include later customer-payment allocations (no invoice payment
 * row) — those must not appear as Cash received on edit.
 */
export function invoiceEditPaymentPrefill(invoice: {
  paidAmount: number;
  creditAmount: number;
  total: number;
  payments?: { amount?: number; paymentMethod?: string | null; status?: string | null }[] | null;
}): InvoiceEditPaymentPrefill {
  const payments = activePayments(invoice.payments);
  const cashFromRows = payments
    .filter((p) => isCashMethod(p.paymentMethod ?? "CASH"))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const onlineFromRows = payments
    .filter((p) => isOnlineMethod(p.paymentMethod ?? ""))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // Split (cash + online), including when credit remains on the bill.
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
      onlineAmt: onlineFromRows,
    };
  }
  if (cashFromRows > 0) {
    return {
      payMethod: "cash",
      received: cashFromRows,
      cashAmt: 0,
      onlineAmt: 0,
    };
  }
  // No sale-time tender rows: credit / allocation-only → cash tab with received 0.
  // Do not fall back to paidAmount (that mixes in later customer-payment allocations).
  return {
    payMethod: "cash",
    received: 0,
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
  payments?: { amount?: number; paymentMethod?: string | null; status?: string | null }[] | null;
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
