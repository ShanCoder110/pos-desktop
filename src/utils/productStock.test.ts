import { describe, expect, it } from "vitest";
import { productStockStatus } from "./productStock";
import type { Product } from "@/shared/types";

describe("productStockStatus", () => {
  const product = { stock: 0, minimumStock: 5 } as Product;
  it("never labels zero or negative stock as available", () => {
    expect(productStockStatus(product)).toEqual({ label: "Out of stock", tone: "danger" });
    expect(productStockStatus(product, -1).label).toBe("Out of stock");
  });
  it("uses the same inclusive low-stock threshold in lists and drawers", () => {
    expect(productStockStatus(product, 5).label).toBe("Low stock");
    expect(productStockStatus(product, 6).label).toBe("In stock");
  });
  it("supports an explicit zero threshold and a supplied total quantity", () => {
    expect(productStockStatus({ ...product, minimumStock: 0 }, 1).tone).toBe("ok");
    expect(productStockStatus({ ...product, stock: 10 }, 0).tone).toBe("danger");
  });
});
