import { describe, expect, it } from "vitest";
import { displayedToBaseQty, stockCountDifference, stockCountPreview } from "@/utils/stockCount";

describe("stockCount", () => {
  it("converts 5 boxes of 12 to 60 base units", () => {
    expect(displayedToBaseQty(5, 12, "multiply")).toBe(60);
    expect(
      stockCountPreview({ currentBase: 100, countedDisplay: 5, contains: 12 }).countedBase,
    ).toBe(60);
  });

  it("gives difference -6 when counted 94 vs system 100", () => {
    expect(stockCountDifference(100, 94)).toBe(-6);
    expect(
      stockCountPreview({ currentBase: 100, countedDisplay: 94, contains: 1 }).difference,
    ).toBe(-6);
  });
});
