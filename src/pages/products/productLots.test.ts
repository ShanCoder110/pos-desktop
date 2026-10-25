import { describe, expect, it } from "vitest";
import { blankProduct } from "@/pages/products/productLots";

describe("new product draft", () => {
  it("defaults inventory and selling units to Piece", () => {
    const product = blankProduct();

    expect(product.unit).toBe("pc");
    expect(product.sellUnits).toHaveLength(1);
    expect(product.sellUnits?.[0]).toMatchObject({
      name: "Piece",
      symbol: "pc",
      contains: 1,
      isBase: true,
      isDefault: true,
    });
  });
});
