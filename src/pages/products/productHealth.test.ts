import { describe, expect, it } from "vitest";
import { matchesHealth } from "@/pages/products/ProductsLayout";
import type { Product } from "@/shared/types";

describe("product health", () => {
  const product = (stock: number, minimumStock: number) =>
    ({ stock, minimumStock, isLinear: false }) as Product;

  it("does not count zero stock as both healthy and dead when the threshold is zero", () => {
    const row = product(0, 0);
    expect(matchesHealth(row, "healthy")).toBe(false);
    expect(matchesHealth(row, "dead")).toBe(true);
  });

  it("separates in-stock and low-stock products", () => {
    expect(matchesHealth(product(5, 0), "healthy")).toBe(true);
    expect(matchesHealth(product(5, 10), "risk")).toBe(true);
    expect(matchesHealth(product(5, 10), "healthy")).toBe(false);
  });
});
