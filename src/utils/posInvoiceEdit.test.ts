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
