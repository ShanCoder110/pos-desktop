import { describe, expect, it } from "vitest";
import {
  displayedToBaseQty,
  MAX_STOCK_COUNT_BASE_UNITS,
  stockCountCountedError,
  stockCountDifference,
  stockCountPreview,
} from "@/utils/stockCount";

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

  it("rejects negatives, non-finite, and over 1,000,000 base units", () => {
    expect(stockCountCountedError("-1", -1, true)).toMatch(/negative/i);
    expect(stockCountCountedError("Infinity", Number.POSITIVE_INFINITY, true)).toMatch(/valid/i);
    expect(
      stockCountCountedError(
        String(MAX_STOCK_COUNT_BASE_UNITS + 1),
        MAX_STOCK_COUNT_BASE_UNITS + 1,
        true,
      ),
    ).toMatch(/1,000,000/);
    expect(stockCountCountedError("12", 12, true)).toBeNull();
  });
});
