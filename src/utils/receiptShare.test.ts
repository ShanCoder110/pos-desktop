import { describe, expect, it } from "vitest";
import { whatsAppPhone, whatsAppShareUrl } from "@/utils/receiptShare";

describe("WhatsApp receipt sharing", () => {
  it("normalizes Pakistani local mobile numbers", () => {
    expect(whatsAppPhone("0300-1234567")).toBe("923001234567");
    expect(whatsAppPhone("3001234567")).toBe("923001234567");
  });

  it("keeps an existing country code and encodes the receipt", () => {
    expect(whatsAppShareUrl("+92 300 1234567", "Invoice #1\nRs 500")).toBe(
      "https://wa.me/923001234567?text=Invoice%20%231%0ARs%20500",
    );
  });
});
