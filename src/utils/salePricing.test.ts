import { describe, expect, it } from "vitest";
import type { Product, ProductSellUnit } from "@/shared/types";
import {
  cartLineTierPrices,
  convertLineToUnit,
  balanceAfterSale,
  displayToBaseQty,
  hasCompleteSellUnit,
  toBaseQty,
  lineProfit,
  lineTotal,
  posTierPrice,
  priceModeForCustomerSwitch,
  productMatchesQuery,
  resolveMatchedUnitId,
  resolveSellUnit,
  unitTierPrice,
} from "@/utils/salePricing";

const piece: ProductSellUnit = {
  id: "u-piece",
  name: "Piece",
  contains: 1,
  cost: 8,
  min: 90,
  wholesale: 95,
  price: 100,
  barcode: "6281000000001",
  isBase: true,
  kind: "base",
};

const pack: ProductSellUnit = {
  id: "u-pack",
  name: "Pack",
  contains: 12,
  cost: 90,
  min: 1080,
  wholesale: 1140,
  price: 1200,
  barcode: "6281000000012",
  kind: "bigger",
};

const carton: ProductSellUnit = {
  id: "u-carton",
  name: "Carton",
  contains: 120,
  cost: 900,
  wholesale: 11000,
  price: 12000,
  min: 10800,
  barcode: "",
  kind: "bigger",
};

const product: Product = {
  id: "p1",
  name: "Widget",
  sku: "W1",
  barcode: "6281000000001",
  category: "Test",
  unit: "pc",
  packQty: 12,
  packPrice: 1200,
  cost: 8,
  min: 90,
  wholesale: 95,
  retail: 100,
  warrantyQty: 0,
  warrantyUnit: "months",
  warrantyDays: 0,
  claims: 0,
  damaged: 0,
  stock: 500,
  isLinear: false,
  isManufactured: false,
  components: [],
  sellUnits: [piece, pack, carton],
};

describe("unitTierPrice", () => {
  it("uses per-unit retail/wholesale/min, not base×factor", () => {
    expect(unitTierPrice(pack, "retail")).toBe(1200);
    expect(unitTierPrice(pack, "wholesale")).toBe(1140);
    expect(unitTierPrice(piece, "retail")).toBe(100);
    expect(posTierPrice(product, "u-pack", "retail")).toBe(1200);
    expect(posTierPrice(product, "u-piece", "wholesale")).toBe(95);
  });
});

describe("conversions", () => {
  it("converts display qty to base for stock", () => {
    expect(displayToBaseQty(pack, 2)).toBe(24);
    expect(displayToBaseQty(carton, 0.5)).toBe(60);
    expect(displayToBaseQty(piece, 3.5)).toBe(3.5);
  });

  it("line totals and profit", () => {
    expect(lineTotal(2, 1200)).toBe(2400);
    expect(lineProfit(2, 1200, 90)).toBe(2220);
    expect(lineTotal(0, 100)).toBe(0);
  });

  it("requires enough stock for one complete pack", () => {
    expect(hasCompleteSellUnit(pack, 4)).toBe(false);
    expect(hasCompleteSellUnit(pack, 11.999)).toBe(false);
    expect(hasCompleteSellUnit(pack, 12)).toBe(true);
    expect(hasCompleteSellUnit(piece, 1)).toBe(true);
  });
});

describe("balanceAfterSale", () => {
  it("subtracts the bill once", () => {
    expect(balanceAfterSale(330, 15, 0)).toBe(315);
    expect(balanceAfterSale(-1170, 15, 0)).toBe(-1185);
    expect(balanceAfterSale(10, 15, 0)).toBe(-5);
  });
});

describe("priceModeForCustomerSwitch", () => {
  it("resets to retail when switching to walk-in / guest", () => {
    expect(priceModeForCustomerSwitch(true, "wholesale")).toBe("retail");
    expect(priceModeForCustomerSwitch(true, "retail")).toBe("retail");
  });

  it("keeps the current mode when switching to a named customer", () => {
    expect(priceModeForCustomerSwitch(false, "wholesale")).toBe("wholesale");
    expect(priceModeForCustomerSwitch(false, "retail")).toBe("retail");
  });
});

describe("toBaseQty", () => {
  it("divides when the stock unit contains the other unit", () => {
    const gaz: ProductSellUnit = {
      ...piece,
      id: "u-gaz",
      name: "Gaz",
      contains: 90,
      factorDirection: "divide",
      isBase: false,
    };
    const roll = { ...product, sellUnits: [{ ...piece, name: "Roll" }, gaz] };
    expect(toBaseQty(roll, "u-gaz", 1)).toBe(0.011111);
    expect(toBaseQty(roll, "u-gaz", 90)).toBe(1);
    expect(toBaseQty(roll, "u-gaz", 450)).toBe(5);
    expect(toBaseQty(roll, "u-gaz", 451)).toBe(5.011111);
    expect(toBaseQty(roll, "u-piece", 1) + toBaseQty(roll, "u-gaz", 45)).toBe(1.5);
  });
});

describe("resolveSellUnit", () => {
  it("resolves by id and falls back to base", () => {
    expect(resolveSellUnit(product, "u-carton")?.name).toBe("Carton");
    expect(resolveSellUnit(product, undefined)?.id).toBe("u-piece");
  });

  it("uses the user-selected default sale unit before the inventory unit", () => {
    const withDefault = {
      ...product,
      sellUnits: [piece, { ...pack, isDefault: true }],
    };
    expect(resolveSellUnit(withDefault)?.id).toBe("u-pack");
  });
});

describe("resolveMatchedUnitId / productMatchesQuery", () => {
  it("product barcode keeps default unit; pack barcode preselects Pack", () => {
    expect(resolveMatchedUnitId(product, "6281000000001")).toBeUndefined();
    expect(resolveMatchedUnitId(product, "6281000000012")).toBe("u-pack");
    expect(resolveMatchedUnitId(product, "6281000000012", "u-pack")).toBe("u-pack");
    expect(resolveSellUnit(product, resolveMatchedUnitId(product, "6281000000012"))?.name).toBe(
      "Pack",
    );
    expect(posTierPrice(product, "u-pack", "retail")).toBe(1200);
  });

  it("matches unit barcodes in search and ignores unknown codes", () => {
    expect(productMatchesQuery(product, "6281000000012")).toBe(true);
    expect(productMatchesQuery(product, "6281000000001")).toBe(true);
    expect(productMatchesQuery(product, "6281999999999")).toBe(false);
    expect(productMatchesQuery(product, "Widget")).toBe(true);
  });

  it("matches SKU PMX-001 case-insensitively and without hyphens", () => {
    const pmx = { ...product, sku: "PMX-001", name: "Pricing Matrix Multi-Unit", barcode: "" };
    expect(productMatchesQuery(pmx, "PMX-001")).toBe(true);
    expect(productMatchesQuery(pmx, "pmx")).toBe(true);
    expect(productMatchesQuery(pmx, "pmx001")).toBe(true);
    expect(productMatchesQuery(pmx, "PMX001")).toBe(true);
    expect(productMatchesQuery(pmx, "xyz")).toBe(false);
  });

  it("matches product search ID", () => {
    const numbered = { ...product, productNo: 42, sku: "P-ABCD", barcode: "", name: "Widget" };
    expect(productMatchesQuery(numbered, "42")).toBe(true);
    expect(productMatchesQuery(numbered, "4")).toBe(true);
    expect(productMatchesQuery(numbered, "99")).toBe(false);
  });
});

describe("edge cases", () => {
  it("zero retail on unit", () => {
    const free = { ...piece, price: 0 };
    expect(unitTierPrice(free, "retail")).toBe(0);
    expect(lineTotal(5, 0)).toBe(0);
  });

  it("zero unit cost profit equals revenue", () => {
    expect(lineProfit(3, 100, 0)).toBe(300);
  });

  it("fractional pack qty base stock", () => {
    expect(displayToBaseQty(pack, 0.25)).toBe(3);
  });

  it("carton tier price is read from unit row not piece×120", () => {
    const linear = unitTierPrice(piece, "wholesale") * 120;
    expect(unitTierPrice(carton, "wholesale")).toBe(11000);
    expect(unitTierPrice(carton, "wholesale")).not.toBe(linear);
  });
});

describe("cartLineTierPrices", () => {
  it("returns pack wholesale without scaling piece price", () => {
    const w = cartLineTierPrices(product, "u-pack", "wholesale");
    expect(w.listPrice).toBe(1140);
    expect(w.minPrice).toBe(1080);
    expect(w.usedRetailFallback).toBe(false);
  });

  it("falls back to retail when wholesale is 0 or unset", () => {
    const noWholesale = {
      ...product,
      sellUnits: [{ ...pack, wholesale: 0 }],
    };
    const w = cartLineTierPrices(noWholesale, "u-pack", "wholesale");
    expect(w.listPrice).toBe(1200);
    expect(w.usedRetailFallback).toBe(true);
  });

  it("convertLineToUnit keeps base qty and applies target tier", () => {
    const fromPack = convertLineToUnit(product, 24, "retail", "u-piece");
    expect(fromPack?.qty).toBe(24);
    expect(fromPack?.listPrice).toBe(100);
    const toPack = convertLineToUnit(product, 24, "wholesale", "u-pack");
    expect(toPack?.qty).toBe(2);
    expect(toPack?.listPrice).toBe(1140);
  });

  it("does not round away stock when a partial pack is selected", () => {
    const toPack = convertLineToUnit(product, 1, "retail", "u-pack");
    expect(toPack?.qty).toBeCloseTo(1 / 12, 12);
    expect((toPack?.qty ?? 0) * 12).toBeCloseTo(1, 12);
    expect((toPack?.qty ?? 0) * 1200).toBeCloseTo(100, 8);
  });

  it("preserves stock when switching from a roll to a subdivision", () => {
    const roll = { ...piece, id: "u-roll", name: "Roll", symbol: "roll" };
    const gaz = {
      ...piece,
      id: "u-gaz",
      name: "Gaz",
      symbol: "gaz",
      contains: 90,
      factorDirection: "divide" as const,
      isBase: false,
      kind: "smaller" as const,
    };
    const wire = { ...product, unit: "roll", sellUnits: [roll, gaz] };
    expect(convertLineToUnit(wire, 1, "retail", "u-gaz")?.qty).toBe(90);
    expect(convertLineToUnit(wire, 0.5, "retail", "u-gaz")?.qty).toBe(45);
  });
});
