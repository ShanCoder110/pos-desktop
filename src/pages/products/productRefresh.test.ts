import { describe, expect, it } from "vitest";
import { blankProduct, openingLot } from "./productLots";
import { mergeProductSearchRows } from "./productSearchRows";
import { supplierProductCount } from "./hubSupplierFilters";

describe("catalog updates", () => {
  it("keeps saved stock and prices when an older search response arrives", () => {
    const old = { ...blankProduct(), id: "p", stock: 0, retail: 100 };
    const saved = { ...old, stock: 24, retail: 120 };
    const extra = { ...old, id: "extra" };
    expect(mergeProductSearchRows([saved], [old, extra])).toEqual([saved, extra]);
  });

  it("counts distinct supplier products and refreshes after lot and product changes", () => {
    const product = { ...blankProduct(), id: "p", supplierId: "a" };
    const products = [product];
    const lot = { ...openingLot(product, []), supplierId: "b" };
    const lots = [lot, { ...lot, id: "second" }];
    expect(supplierProductCount("a", products, lots)).toBe(1);
    expect(supplierProductCount("b", products, lots)).toBe(1);
    expect(supplierProductCount("b", products, [])).toBe(0);
    expect(supplierProductCount("b", [], lots)).toBe(0);
    expect(supplierProductCount("a", [{ ...product, supplierId: "c" }], lots)).toBe(0);
  });
});
