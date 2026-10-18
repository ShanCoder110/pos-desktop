import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/shared/settings";
import { buildReceiptText, whatsAppPhone, whatsAppShareUrl } from "@/utils/receiptShare";

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

  it("uses compact receipt money and the singular Foot label", () => {
    const text = buildReceiptText({
      settings: defaultSettings,
      customer: { id: "walk-in", name: "Walk-in", phone: "", balance: 0, isWalking: true },
      lines: [
        {
          id: "line-1",
          productId: "product-1",
          name: "Cable",
          qty: 2,
          unit: "Feet",
          price: 100,
          minFloor: 0,
          lotsNote: "",
        },
      ],
      total: 200,
      paid: 200,
    });

    expect(text).toContain("2 Foot Cable — Rs 200");
    expect(text).not.toContain(".00");
    expect(text).not.toContain("Feet");
  });
});
