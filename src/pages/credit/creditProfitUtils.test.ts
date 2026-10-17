import { describe, expect, it } from "vitest";
import type { LedgerRow } from "@/shared/domain/types";
import { summarizeCreditLedger } from "@/pages/credit/creditProfitUtils";

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
});
