import { describe, expect, it } from "vitest";
import { splitBillItemCounts, splitBillPages, shouldSplitThermalBill } from "@/utils/splitBillPages";

describe("splitBillPages", () => {
  it("keeps short bills on one page", () => {
    expect(splitBillItemCounts(8)).toEqual([8]);
    expect(splitBillPages([1, 2, 3], { first: 12, middle: 15, last: 12 })).toHaveLength(1);
  });

  it("splits long bills with configurable limits", () => {
    expect(splitBillItemCounts(27)).toEqual([12, 3, 12]);
    expect(splitBillItemCounts(20, { first: 5, middle: 8, last: 5 })).toEqual([5, 8, 2, 5]);
  });

  it("only splits thermal paper", () => {
    expect(shouldSplitThermalBill(true, "MM_80")).toBe(true);
    expect(shouldSplitThermalBill(true, "A4")).toBe(false);
    expect(shouldSplitThermalBill(false, "MM_80")).toBe(false);
  });
});
