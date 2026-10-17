import { describe, expect, it } from "vitest";
import {
  invoiceEditAllocatedPaid,
  invoiceEditBalanceAfter,
  invoiceEditLoadSnapshot,
  invoiceEditPaymentPrefill,
  invoiceEditPaymentStatusText,
  invoiceEditPaymentTotals,
  previousBalanceExcludingInvoiceCredit,
} from "@/utils/posInvoiceEdit";

describe("posInvoiceEdit preload", () => {
  it("allocation-only paid 5 (no sale tender rows) → received 0, credit open 25", () => {
    // INV-0004 style: paidAmount includes later customer-payment allocation, not cash at sale.
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
    expect(snap.received).toBe(0);
    expect(snap.creditOpen).toBe(25);
    expect(snap.allocatedPaid).toBe(5);
    expect(
      invoiceEditPaymentPrefill({
        paidAmount: 5,
        creditAmount: 25,
        total: 30,
        payments: [],
      }).received,
    ).toBe(0);
  });

  it("sale-time cash 5 → cash received 5 even when paidAmount also includes allocations", () => {
    expect(
      invoiceEditPaymentPrefill({
        paidAmount: 10,
        creditAmount: 20,
        total: 30,
        payments: [{ amount: 5, paymentMethod: "CASH", status: "COMPLETED" }],
      }),
    ).toEqual({ payMethod: "cash", received: 5, cashAmt: 0, onlineAmt: 0 });
  });

  it("previous balance excludes this invoice's open credit", () => {
    // POS balance −25 means owes 25 (includes this bill's credit).
    expect(previousBalanceExcludingInvoiceCredit(-25, 25)).toBe(0);
    // Owed 35 overall, 25 on this bill → prior Due 10.
    expect(previousBalanceExcludingInvoiceCredit(-35, 25)).toBe(-10);
  });

  it("cash only → cash tab with received = paid", () => {
    expect(
      invoiceEditPaymentPrefill({
        paidAmount: 40,
        creditAmount: 0,
        total: 40,
        payments: [{ amount: 40, paymentMethod: "CASH", status: "COMPLETED" }],
      }),
    ).toEqual({ payMethod: "cash", received: 40, cashAmt: 0, onlineAmt: 0 });
  });

  it("online only → online tab with onlineAmt", () => {
    expect(
      invoiceEditPaymentPrefill({
        paidAmount: 40,
        creditAmount: 0,
        total: 40,
        payments: [{ amount: 40, paymentMethod: "MOBILE", status: "COMPLETED" }],
      }),
    ).toEqual({ payMethod: "online", received: 0, cashAmt: 0, onlineAmt: 40 });
  });

  it("split CASH 20 + MOBILE 20 → split tab 20/20 (not cash received 40)", () => {
    expect(
      invoiceEditPaymentPrefill({
        paidAmount: 40,
        creditAmount: 0,
        total: 40,
        payments: [
          { amount: 20, paymentMethod: "CASH", status: "COMPLETED" },
          { amount: 20, paymentMethod: "MOBILE", status: "COMPLETED" },
        ],
      }),
    ).toEqual({ payMethod: "split", received: 0, cashAmt: 20, onlineAmt: 20 });
  });

  it("split + credit remaining → split amounts + credit open", () => {
    const snap = invoiceEditLoadSnapshot({
      customerId: "cust-split",
      discount: 0,
      notes: null,
      paidAmount: 40,
      creditAmount: 10,
      total: 50,
      payments: [
        { amount: 20, paymentMethod: "CASH", status: "COMPLETED" },
        { amount: 20, paymentMethod: "MOBILE", status: "COMPLETED" },
      ],
    });
    expect(snap.payMethod).toBe("split");
    expect(snap.cashAmt).toBe(20);
    expect(snap.onlineAmt).toBe(20);
    expect(snap.received).toBe(0);
    expect(snap.creditOpen).toBe(10);
    expect(snap.allocatedPaid).toBe(0);
  });

  it("credit only → cash tab with received 0", () => {
    expect(
      invoiceEditPaymentPrefill({
        paidAmount: 0,
        creditAmount: 40,
        total: 40,
        payments: [],
      }),
    ).toEqual({ payMethod: "cash", received: 0, cashAmt: 0, onlineAmt: 0 });
  });

  it("ignores VOIDED payment rows when choosing split vs cash", () => {
    expect(
      invoiceEditPaymentPrefill({
        paidAmount: 20,
        creditAmount: 0,
        total: 20,
        payments: [
          { amount: 20, paymentMethod: "CASH", status: "COMPLETED" },
          { amount: 20, paymentMethod: "MOBILE", status: "VOIDED" },
        ],
      }),
    ).toEqual({ payMethod: "cash", received: 20, cashAmt: 0, onlineAmt: 0 });
  });
});

describe("posInvoiceEdit payment totals (allocated as paid)", () => {
  it("allocation only → unpaid 40 on total 45, due after bill 65", () => {
    expect(invoiceEditAllocatedPaid({ paidAmount: 5, payments: [] })).toBe(5);
    expect(invoiceEditPaymentTotals({ billTotal: 45, tenderPaid: 0, allocatedPaid: 5 })).toEqual({
      billTotal: 45,
      tenderPaid: 0,
      allocatedPaid: 5,
      amountPaid: 5,
      unpaid: 40,
      extra: 0,
    });
    // Previous Due 25 (POS −25) + bill 45 − allocated 5 → Due 65.
    expect(
      invoiceEditBalanceAfter({
        previousBalance: -25,
        billTotal: 45,
        tenderPaid: 0,
        allocatedPaid: 5,
      }),
    ).toBe(-65);
    expect(
      invoiceEditPaymentStatusText({
        billTotal: 45,
        tenderPaid: 0,
        allocatedPaid: 5,
      }),
    ).toBe("Partially paid · 5 already collected");
  });

  it("tender + allocation → both count toward paid", () => {
    expect(
      invoiceEditAllocatedPaid({
        paidAmount: 15,
        payments: [{ amount: 10, paymentMethod: "CASH", status: "COMPLETED" }],
      }),
    ).toBe(5);
    expect(
      invoiceEditPaymentTotals({ billTotal: 45, tenderPaid: 10, allocatedPaid: 5 }),
    ).toMatchObject({ amountPaid: 15, unpaid: 30, extra: 0 });
  });

  it("no payments → unpaid = total", () => {
    expect(invoiceEditAllocatedPaid({ paidAmount: 0, payments: [] })).toBe(0);
    expect(
      invoiceEditPaymentTotals({ billTotal: 45, tenderPaid: 0, allocatedPaid: 0 }),
    ).toMatchObject({ amountPaid: 0, unpaid: 45 });
    expect(
      invoiceEditPaymentStatusText({
        billTotal: 45,
        tenderPaid: 0,
        allocatedPaid: 0,
      }),
    ).toBe("Unpaid");
  });
});
