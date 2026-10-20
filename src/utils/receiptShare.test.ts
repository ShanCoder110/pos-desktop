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

  it("orders totals as Grand Total → Previous → Total Bill → Cash → Remaining", () => {
    const settings = { ...defaultSettings, showBalanceOnSlip: true };
    const owes = buildReceiptText({
      settings,
      customer: { id: "c1", name: "Ali", phone: "03001234567", balance: 100, isWalking: false },
      lines: [
        {
          id: "line-1",
          productId: "p1",
          name: "Item",
          qty: 1,
          unit: "Piece",
          price: 50,
          minFloor: 0,
          lotsNote: "",
        },
      ],
      total: 50,
      paid: 0,
      balanceBefore: 7501,
      balanceAfter: 7551,
    });
    expect(owes).toContain("Grand Total (1 item): Rs 50");
    expect(owes).toContain("Previous Balance: Rs 7,501");
    expect(owes).toContain("Total Bill: Rs 7,551");
    expect(owes).toContain("Cash Received: Rs 0");
    expect(owes).toContain("Remaining Amount: Rs 7,551");
    expect(owes).not.toContain(" N:");
    expect(owes).not.toContain(" P:");
    expect(owes.indexOf("Grand Total")).toBeLessThan(owes.indexOf("Previous Balance"));
    expect(owes.indexOf("Previous Balance")).toBeLessThan(owes.indexOf("Total Bill"));
    expect(owes.indexOf("Total Bill")).toBeLessThan(owes.indexOf("Cash Received"));

    const advance = buildReceiptText({
      settings,
      customer: { id: "c2", name: "Sara", phone: "03007654321", balance: -73, isWalking: false },
      lines: [
        {
          id: "line-1",
          productId: "p1",
          name: "Item",
          qty: 1,
          unit: "Piece",
          price: 10,
          minFloor: 0,
          lotsNote: "",
        },
      ],
      total: 10,
      paid: 10,
      balanceBefore: -73,
      balanceAfter: -73,
    });
    // Advance (−73) subtracts from grand total: 10 − 73 = −63 → Total Bill Rs 63; Remaining after pay Rs 73.
    expect(advance).toContain("Grand Total (1 item): Rs 10");
    expect(advance).toContain("Previous Balance: Rs 73");
    expect(advance).toContain("Total Bill: Rs 63");
    expect(advance).toContain("Remaining Amount: Rs 73");
    expect(advance).not.toContain(" P:");
  });
});
