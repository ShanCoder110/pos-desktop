import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/shared/settings";
import {
  convertBillDiscount,
  posLineDiscount,
  paymentStatusLabel,
  wholesaleCartToast,
} from "@/pages/pos/posBilling";

describe("POS billing helpers", () => {
  it("defaults to excluding wholesale reductions above the minimum", () => {
    expect(defaultSettings.wholesaleDiscountBelowMinimumOnly).toBe(true);
    const line = { priceMode: "wholesale", listPrice: 100, minPrice: 90, unitPrice: 95, qty: 2 };
    expect(posLineDiscount(line, true)).toBe(0);
    expect(posLineDiscount({ ...line, unitPrice: 90 }, true)).toBe(0);
    expect(posLineDiscount({ ...line, unitPrice: 85 }, true)).toBe(10);
    expect(posLineDiscount(line, false)).toBe(10);
    expect(posLineDiscount({ ...line, priceMode: "retail" }, true)).toBe(10);
    expect(posLineDiscount({ ...line, unitPrice: 105 }, true)).toBe(0);
  });
  it("preserves the actual discount when switching Rs to percent and back", () => {
    const percent = convertBillDiscount("pct", 1_000, 125, 0);
    expect(percent.percent).toBe(12.5);
    expect(convertBillDiscount("rs", 1_000, 0, percent.percent).amount).toBe(125);
  });

  it("reports unpaid, partial and paid states", () => {
    expect(paymentStatusLabel({ paid: 0, unpaid: 500, extra: 0, returnChange: false })).toBe(
      "Unpaid",
    );
    expect(paymentStatusLabel({ paid: 200, unpaid: 300, extra: 0, returnChange: false })).toBe(
      "Partially paid",
    );
    expect(paymentStatusLabel({ paid: 500, unpaid: 0, extra: 0, returnChange: false })).toBe(
      "Paid",
    );
  });

  it("F11 wholesale toast pluralizes retail fallbacks", () => {
    expect(wholesaleCartToast(0)).toBe("All items wholesale");
    expect(wholesaleCartToast(1)).toBe(
      "Wholesale applied; 1 item kept retail (no wholesale price)",
    );
    expect(wholesaleCartToast(2)).toBe(
      "Wholesale applied; 2 items kept retail (no wholesale price)",
    );
  });
});
