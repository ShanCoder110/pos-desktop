import { describe, expect, it } from "vitest";
import {
  invoiceEditLoadSnapshot,
  invoiceEditPaymentPrefill,
  previousBalanceExcludingInvoiceCredit,
} from "@/utils/posInvoiceEdit";

describe("posInvoiceEdit preload", () => {
  it("loads credit invoice for customer X: paid 5 of 30 → credit open 25", () => {
    const snap = invoiceEditLoadSnapshot({
      customerId: "cust-x",
      discount: 0,
      notes: null,
      paidAmount: 5,
      creditAmount: 25,
      total: 30,
      payments: [],
    });
    expect(snap.customerId).toBe("cust-x");
    expect(snap.payMethod).toBe("cash");
    expect(snap.received).toBe(5);
    expect(snap.creditOpen).toBe(25);
    expect(
      invoiceEditPaymentPrefill({
        paidAmount: 5,
        creditAmount: 25,
        total: 30,
      }).received,
    ).toBe(5);
  });

  it("previous balance excludes this invoice's open credit", () => {
    // POS balance −25 means owes 25 (includes this bill's credit).
    expect(previousBalanceExcludingInvoiceCredit(-25, 25)).toBe(0);
    // Owed 35 overall, 25 on this bill → prior Due 10.
    expect(previousBalanceExcludingInvoiceCredit(-35, 25)).toBe(-10);
  });
});
