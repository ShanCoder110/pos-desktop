import { describe, expect, it } from "vitest";
import { profitAmount, profitMarginPercent, markupPercent } from "@/utils/margin";

describe("margin math", () => {
  it("profit margin on selling price", () => {
    expect(profitMarginPercent(100, 80)).toBe(20);
    expect(profitAmount(100, 80)).toBe(20);
  });

  it("zero selling price yields 0% margin", () => {
    expect(profitMarginPercent(0, 5)).toBe(0);
  });

  it("zero cost still computes margin when sell > 0", () => {
    expect(profitMarginPercent(50, 0)).toBe(100);
    expect(markupPercent(50, 0)).toBe(0);
  });

  it("markup from cost", () => {
    expect(markupPercent(120, 100)).toBe(20);
  });
});
