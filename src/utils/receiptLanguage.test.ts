import { describe, expect, it } from "vitest";
import { isReceiptUrdu, resolveReceiptLanguage } from "@/utils/receiptLanguage";

describe("receiptLanguage", () => {
  it("detects UR in any case", () => {
    expect(isReceiptUrdu("UR")).toBe(true);
    expect(isReceiptUrdu("ur")).toBe(true);
    expect(isReceiptUrdu(" EN ")).toBe(false);
    expect(isReceiptUrdu(undefined)).toBe(false);
  });

  it("prefers override over settings", () => {
    expect(resolveReceiptLanguage("UR", "EN")).toBe("UR");
    expect(resolveReceiptLanguage("EN", "UR")).toBe("EN");
    expect(resolveReceiptLanguage(undefined, "UR")).toBe("UR");
  });
});
