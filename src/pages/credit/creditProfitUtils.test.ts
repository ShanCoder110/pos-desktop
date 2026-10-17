import { describe, expect, it } from "vitest";
import type { InvoiceRow, LedgerRow } from "@/shared/domain/types";
import {
  calculateInvoiceProfitHold,
  calculateInvoiceRealizedProfit,
  calculateInvoiceRemainingProfit,
  summarizeCreditInvoices,
  summarizeCreditLedger,
} from "@/pages/credit/creditProfitUtils";

function entry(type: string, debit: number, credit: number, balanceAfter: number): LedgerRow {
  return {
    id: crypto.randomUUID(),
    customerId: "c1",
    branchId: "b1",
    invoiceId: null,
    type: type as LedgerRow["type"],
    debit,
    credit,
    balanceAfter,
    notes: "",
    createdAt: "2026-10-17T00:00:00Z",
  };
}

describe("summarizeCreditLedger", () => {
  it("nets revise adjustments so sold is 45, paid 20, balance 25", () => {
    const entries = [
      entry("SALE", 30, 0, 30),
      entry("ADJUSTMENT", 0, 30, 0),
      entry("SALE", 15, 0, 15),
      entry("SALE", 30, 0, 45),
      entry("PAYMENT_RECEIVED", 0, 20, 25),
    ];
    expect(summarizeCreditLedger(entries)).toEqual({
      sold: 45,
      paid: 20,
      balance: 25,
    });
  });

  it("open credit with no payment is sold 45 / paid 0 / balance 45", () => {
    const entries = [
      entry("SALE", 30, 0, 30),
      entry("ADJUSTMENT", 0, 30, 0),
      entry("SALE", 15, 0, 15),
      entry("SALE", 30, 0, 45),
    ];
    expect(summarizeCreditLedger(entries, 45)).toEqual({
      sold: 45,
      paid: 0,
      balance: 45,
    });
  });

  it("full return nets sold (sold 40 returned 40 → sold 0, paid 0, balance 0)", () => {
    const entries = [entry("SALE", 40, 0, 40), entry("RETURN", 0, 40, 0)];
    expect(summarizeCreditLedger(entries)).toEqual({
      sold: 0,
      paid: 0,
      balance: 0,
    });
  });
});

describe("invoice profit after return", () => {
  function invoice(overrides: Partial<InvoiceRow> & { creditAmount: number; paidAmount: number }) {
    return {
      id: "inv-1",
      invoiceNumber: "INV-1",
      branchId: "b1",
      customerId: "c1",
      status: "COMPLETED",
      paymentStatus: "CREDIT",
      subtotal: 40,
      discount: 0,
      tax: 0,
      total: 40,
      changeAmount: 0,
      items: [
        {
          id: "ii-1",
          productId: "p1",
          productUnitId: "u1",
          unitName: "Piece",
          quantity: 2,
          baseQuantity: 2,
          unitPrice: 20,
          discount: 0,
          total: 40,
          fifoCost: 16,
          grossProfit: 24,
        },
      ],
      notes: "",
      createdBy: "u1",
      createdAt: "2026-10-17T00:00:00Z",
      ...overrides,
    } as InvoiceRow;
  }

  function twoLineSale(
    overrides: Partial<InvoiceRow> & { creditAmount: number; paidAmount: number },
  ) {
    return {
      id: "inv-60",
      invoiceNumber: "INV-60",
      branchId: "b1",
      customerId: "c1",
      status: "COMPLETED",
      paymentStatus: "CREDIT",
      subtotal: 60,
      discount: 0,
      tax: 0,
      total: 60,
      changeAmount: 0,
      items: [
        {
          id: "ii-a",
          productId: "p1",
          productUnitId: "u1",
          unitName: "Piece",
          quantity: 1,
          baseQuantity: 1,
          unitPrice: 30,
          discount: 0,
          total: 30,
          fifoCost: 15,
          grossProfit: 15,
        },
        {
          id: "ii-b",
          productId: "p1",
          productUnitId: "u1",
          unitName: "Piece",
          quantity: 1,
          baseQuantity: 1,
          unitPrice: 30,
          discount: 0,
          total: 30,
          fifoCost: 15,
          grossProfit: 15,
        },
      ],
      notes: "",
      createdBy: "u1",
      createdAt: "2026-10-17T00:00:00Z",
      ...overrides,
    } as InvoiceRow;
  }

  it("(a) sale 40 profit 24, full return: held 0, realized 0", () => {
    const inv = invoice({
      creditAmount: 0,
      paidAmount: 0,
      paymentStatus: "RETURNED",
    });
    expect(calculateInvoiceRemainingProfit(inv)).toBe(0);
    expect(calculateInvoiceProfitHold(inv)).toBe(0);
    expect(calculateInvoiceRealizedProfit(inv)).toBe(0);
    expect(summarizeCreditInvoices([inv])).toMatchObject({
      totalProfitOnHold: 0,
      totalRealizedProfit: 0,
    });
  });

  it("RETURNED / credit 0 is never treated as fully paid for realized", () => {
    const inv = invoice({
      creditAmount: 0,
      paidAmount: 0,
      paymentStatus: "RETURNED",
    });
    // Regression: gross − hold would have been 24
    expect(summarizeCreditInvoices([inv]).totalRealizedProfit).toBe(0);
  });

  it("(b) sale 60 profit 30, return 1 line, pay 0: held 15, realized 0", () => {
    const inv = twoLineSale({
      creditAmount: 30,
      paidAmount: 0,
      paymentStatus: "PARTIALLY_RETURNED",
    });
    expect(calculateInvoiceRemainingProfit(inv)).toBe(15);
    expect(calculateInvoiceProfitHold(inv)).toBe(15);
    expect(calculateInvoiceRealizedProfit(inv)).toBe(0);
    expect(summarizeCreditInvoices([inv])).toMatchObject({
      totalProfitOnHold: 15,
      totalRealizedProfit: 0,
    });
  });

  it("(c) sale 60 profit 30, pay 30, return 1 line: realized 15, held 0", () => {
    const inv = twoLineSale({
      creditAmount: 0,
      paidAmount: 30,
      paymentStatus: "RETURNED",
    });
    expect(calculateInvoiceRemainingProfit(inv)).toBe(15);
    expect(calculateInvoiceProfitHold(inv)).toBe(0);
    expect(calculateInvoiceRealizedProfit(inv)).toBe(15);
    expect(summarizeCreditInvoices([inv])).toMatchObject({
      totalProfitOnHold: 0,
      totalRealizedProfit: 15,
    });
  });

  it("partial credit remaining: hold is proportional to credit/total", () => {
    const inv = invoice({ creditAmount: 20, paidAmount: 0 });
    expect(calculateInvoiceProfitHold(inv)).toBe(12); // 24 * 20/40
  });
});
