import { describe, expect, it } from "vitest";
import {
  canOpenInvoicePosEdit,
  invoicePosEditHref,
  invoicePosEditSearch,
} from "@/utils/invoicePosEdit";

describe("invoicePosEdit", () => {
  it("builds the POS edit navigation target for an invoice id", () => {
    expect(invoicePosEditHref("inv-42")).toBe("/pos?edit=inv-42");
    expect(invoicePosEditSearch("inv-42")).toBe("?edit=inv-42");
    expect(invoicePosEditHref("a/b")).toBe("/pos?edit=a%2Fb");
  });

  it("only allows completed invoices (same gate as today)", () => {
    expect(canOpenInvoicePosEdit({ status: "COMPLETED" })).toBe(true);
    expect(canOpenInvoicePosEdit({ status: "CANCELLED" })).toBe(false);
    expect(canOpenInvoicePosEdit({ status: "HELD" })).toBe(false);
  });
});
