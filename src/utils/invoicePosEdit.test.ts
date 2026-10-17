import { describe, expect, it } from "vitest";
import {
  canOpenInvoicePosEdit,
  invoicePosEditBlockReason,
  invoicePosEditHref,
  invoicePosEditSearch,
} from "@/utils/invoicePosEdit";

describe("invoicePosEdit", () => {
  it("builds the POS edit navigation target for an invoice id", () => {
    expect(invoicePosEditHref("inv-42")).toBe("/pos?edit=inv-42");
    expect(invoicePosEditSearch("inv-42")).toBe("?edit=inv-42");
    expect(invoicePosEditHref("a/b")).toBe("/pos?edit=a%2Fb");
  });

  it("allows completed non-returned invoices", () => {
    expect(canOpenInvoicePosEdit({ status: "COMPLETED", paymentStatus: "CREDIT" })).toBe(true);
    expect(canOpenInvoicePosEdit({ status: "COMPLETED", paymentStatus: "PARTIAL" })).toBe(true);
    expect(canOpenInvoicePosEdit({ status: "COMPLETED", paymentStatus: "PAID" })).toBe(true);
  });

  it("blocks returned and cancelled invoices", () => {
    expect(invoicePosEditBlockReason({ status: "COMPLETED", paymentStatus: "RETURNED" })).toMatch(
      /returned/i,
    );
    expect(
      invoicePosEditBlockReason({ status: "COMPLETED", paymentStatus: "PARTIALLY_RETURNED" }),
    ).toMatch(/partially returned/i);
    expect(canOpenInvoicePosEdit({ status: "CANCELLED", paymentStatus: "PAID" })).toBe(false);
  });
});
