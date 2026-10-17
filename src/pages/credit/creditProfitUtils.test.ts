import { describe, expect, it } from "vitest";
import type { InvoiceRow, LedgerRow } from "@/shared/domain/types";
import {
  calculateInvoiceProfitHold,
  calculateInvoiceRealizedProfit,
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

  it("full unpaid return: credit 0 → hold 0 and realized 0", () => {
    const inv = invoice({ creditAmount: 0, paidAmount: 0 });
    expect(calculateInvoiceProfitHold(inv)).toBe(0);
    expect(calculateInvoiceRealizedProfit(inv)).toBe(0);
  });

  it("partial credit remaining: hold is proportional to credit/total", () => {
    const inv = invoice({ creditAmount: 20, paidAmount: 0 });
    expect(calculateInvoiceProfitHold(inv)).toBe(12); // 24 * 20/40
  });
});
