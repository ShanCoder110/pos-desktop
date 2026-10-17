import { describe, expect, it } from "vitest";
import type { ProductSellUnit } from "@/shared/types";
import { displayToBaseQty } from "@/utils/salePricing";
import {
  assignBaseSymbol,
  baseChangeCostFactor,
  containsLabel,
  containsRelationHint,
  deriveAll,
  derivePricesBetween,
  factorDirectionForContains,
  formatLinkedQty,
  formatMixedQty,
  normalizeSellUnits,
  priceFromStock,
  pricePerStock,
  sellUnitOptionValue,
  sellUnitOptions,
  setPreferredUnit,
  suggestedExtraUnit,
  validateOpeningStock,
  validateSellUnits,
} from "@/pages/products/productQty";
import type { Product } from "@/shared/types";

function unit(
  partial: Partial<ProductSellUnit> & Pick<ProductSellUnit, "id" | "symbol">,
): ProductSellUnit {
  return {
    name: partial.symbol ?? "",
    contains: 1,
    cost: 0,
    min: 0,
    wholesale: 0,
    price: 0,
    barcode: "",
    kind: "base",
    ...partial,
  };
}

const roll = unit({
  id: "roll",
  symbol: "roll",
  name: "Roll",
  contains: 1,
  isBase: true,
  isDefault: true,
  kind: "base",
  cost: 5000,
  min: 5100,
  wholesale: 5300,
  price: 5500,
});

const gaz = unit({
  id: "gaz",
  symbol: "gaz",
  name: "Gaz",
  contains: 90,
  kind: "smaller",
  cost: 450000,
  min: 459000,
  wholesale: 477000,
  price: 495000,
});

describe("gaz in 1 roll prices", () => {
  it("prices one gaz as the roll price divided by 90", () => {
    const prices = derivePricesBetween(roll, gaz);
    expect(prices.cost).toBe(55.56);
    expect(prices.min).toBe(56.67);
    expect(prices.wholesale).toBe(58.89);
    expect(prices.price).toBe(61.11);
  });

  it("prices one roll as 90 gaz when gaz is the source", () => {
    const oneGaz = { ...gaz, cost: 56, min: 57, wholesale: 59, price: 61 };
    const prices = derivePricesBetween(oneGaz, roll);
    expect(prices.cost).toBe(5040);
    expect(prices.min).toBe(5130);
    expect(prices.wholesale).toBe(5310);
    expect(prices.price).toBe(5490);
  });

  it("rewrites a gaz row that was scaled up by 90", () => {
    const [pricedGaz] = deriveAll([roll, gaz]).filter((row) => row.id === "gaz");
    expect(pricedGaz.price).toBe(61.11);
    expect(pricedGaz.cost).toBe(55.56);
  });

  it("keeps a hand-edited gaz price", () => {
    const custom = { ...gaz, price: 70, priceManual: { price: true } };
    const [pricedGaz] = deriveAll([roll, custom]).filter((row) => row.id === "gaz");
    expect(pricedGaz.price).toBe(70);
    expect(pricedGaz.cost).toBe(55.56);
  });

  it("converts lot cost both ways", () => {
    const units = [roll, gaz];
    expect(priceFromStock(units, "roll", 5000, gaz)).toBe(55.56);
    expect(pricePerStock(units, "roll", 55.56, gaz)).toBe(5000.4);
  });

  it("sells 90 gaz as 1 roll of stock", () => {
    expect(displayToBaseQty(gaz, 90)).toBe(1);
    expect(displayToBaseQty(gaz, 1)).toBe(0.011111);
  });

  it("sells 30 gaz as one third of a roll", () => {
    const thirty = unit({
      id: "gaz",
      symbol: "gaz",
      name: "Gaz",
      contains: 90,
      factorDirection: "divide",
    });
    expect(displayToBaseQty(thirty, 30)).toBe(0.333333);
  });

  it("still multiplies a pack", () => {
    const piece = unit({
      id: "pc",
      symbol: "pc",
      contains: 1,
      isBase: true,
      cost: 10,
      price: 15,
      min: 12,
      wholesale: 13,
    });
    const pack = unit({ id: "pk", symbol: "pk", name: "Pack", contains: 12, kind: "bigger" });
    expect(derivePricesBetween(piece, pack).price).toBe(180);
    expect(displayToBaseQty(pack, 2)).toBe(24);
  });

  it("keeps inventory factors when Gaz becomes the preferred sale unit", () => {
    const masters = [
      { symbol: "roll", name: "Roll" },
      { symbol: "gaz", name: "Gaz" },
      { symbol: "pc", name: "Piece" },
      { symbol: "pk", name: "Pack" },
    ];
    const gazCard = unit({
      id: "gaz",
      symbol: "Gaz",
      name: "Gaz",
      contains: 90,
      factorDirection: "divide",
      isBase: false,
    });
    const next = assignBaseSymbol([roll, gazCard], "gaz");
    const gaz = next.find((row) => row.id === "gaz");
    const stock = next.find((row) => row.id === "roll");
    expect(gaz?.name).toBe("Gaz");
    expect(gaz?.isBase).toBe(false);
    expect(gaz?.isDefault).toBe(true);
    expect(gaz?.contains).toBe(90);
    expect(gaz?.factorDirection).toBe("divide");
    expect(stock?.name).toBe("Roll");
    expect(stock?.symbol).toBe("roll");
    expect(stock?.contains).toBe(1);
    expect(stock?.isBase).toBe(true);
    expect(stock?.isDefault).toBe(false);
    expect(sellUnitOptionValue(gaz!, masters)).toBe("gaz");
    expect(sellUnitOptions(stock!, next, masters).some((option) => option.value === "roll")).toBe(
      true,
    );
    expect(sellUnitOptions(gaz!, next, masters).some((option) => option.label === "Gaz")).toBe(
      true,
    );
  });

  it("adds a blank unit row without Pack 12", () => {
    const next = suggestedExtraUnit([roll]);
    expect(next.symbol).toBe("");
    expect(next.contains).toBe(0);
  });

  it("setPreferredUnit does not rewrite conversions", () => {
    const gazCard = unit({
      id: "gaz",
      symbol: "gaz",
      name: "Gaz",
      contains: 90,
      factorDirection: "divide",
    });
    const next = setPreferredUnit([roll, gazCard], "gaz");
    expect(next.find((row) => row.id === "gaz")?.contains).toBe(90);
    expect(next.find((row) => row.id === "roll")?.contains).toBe(1);
    expect(validateSellUnits(next)).toBeNull();
  });

  it("rejects missing conversion and duplicate names", () => {
    const gazEmpty = unit({
      id: "gaz",
      symbol: "gaz",
      name: "Gaz",
      contains: 0,
      factorDirection: "divide",
    });
    expect(validateSellUnits([roll, gazEmpty])).toBe("unitFactorInvalid");
    const gazNegative = unit({
      id: "gaz-neg",
      symbol: "gaz",
      name: "Gaz",
      contains: -1,
      factorDirection: "divide",
    });
    expect(validateSellUnits([roll, gazNegative])).toBe("unitFactorInvalid");
    const dup = unit({ id: "r2", symbol: "roll2", name: "Roll", contains: 12 });
    expect(validateSellUnits([roll, dup])).toBe("unitNameDuplicate");
  });

  it("allows zero opening stock and rejects negatives", () => {
    expect(validateOpeningStock(0)).toBeNull();
    expect(validateOpeningStock(12)).toBeNull();
    expect(validateOpeningStock(-0.01)).toBe("openingQty");
    expect(validateOpeningStock(Number.NaN)).toBe("openingQty");
  });

  it("keeps a new secondary unit blank until its conversion is entered", () => {
    const pendingGaz = unit({
      id: "gaz",
      symbol: "gaz",
      name: "Gaz",
      contains: 0,
      isBase: false,
      kind: "smaller",
      factorDirection: "divide",
    });
    const normalized = normalizeSellUnits([roll, pendingGaz]);
    expect(normalized.find((row) => row.id === "roll")?.contains).toBe(1);
    expect(normalized.find((row) => row.id === "gaz")?.contains).toBe(0);
  });

  it("keeps a typed 0.011111 factor as a fraction of stock", () => {
    expect(factorDirectionForContains("divide", 0.011111)).toBe("multiply");
    const gazFraction = unit({
      id: "gaz",
      symbol: "gaz",
      name: "Gaz",
      contains: 0.011111,
      factorDirection: "multiply",
    });
    expect(derivePricesBetween(roll, gazFraction).price).toBe(61.11);
  });

  it("treats typed 7 on Gaz as how many Gaz in 1 Roll", () => {
    expect(factorDirectionForContains("multiply", 7, "gaz")).toBe("divide");
    const sevenGaz = unit({
      id: "gaz",
      symbol: "gaz",
      name: "Gaz",
      contains: 7,
      factorDirection: factorDirectionForContains("multiply", 7, "gaz"),
      cost: 0,
      min: 0,
      wholesale: 0,
      price: 0,
    });
    const priced = deriveAll([
      { ...roll, cost: 100, min: 100, wholesale: 200, price: 300 },
      sevenGaz,
    ]);
    const gazRow = priced.find((row) => row.id === "gaz")!;
    expect(gazRow.factorDirection).toBe("divide");
    expect(gazRow.cost).toBe(14.29);
    expect(gazRow.price).toBe(42.86);
    expect(containsLabel(priced, gazRow)).toBe("1 Roll contains");
    expect(containsRelationHint(priced, gazRow)).toBe("1 Roll = 7 Gaz");
  });

  it("scales lot cost up when a pack becomes the stock unit", () => {
    const piece = unit({
      id: "pc",
      symbol: "pc",
      name: "Piece",
      contains: 1,
      isBase: true,
      factorDirection: "multiply",
    });
    const pack = unit({
      id: "pk",
      symbol: "pk",
      name: "Pack",
      contains: 12,
      factorDirection: "multiply",
    });
    expect(baseChangeCostFactor([piece, pack], "pk")).toBe(12);
  });

  it("shows 19 pieces as 1 pack plus 7 pieces", () => {
    const piece = unit({
      id: "pc",
      symbol: "pc",
      name: "Piece",
      contains: 1,
      isBase: true,
      factorDirection: "multiply",
    });
    const pack = unit({
      id: "pk",
      symbol: "pk",
      name: "Pack",
      contains: 12,
      factorDirection: "multiply",
    });
    const product = { unit: "pc", sellUnits: [piece, pack] } as Product;
    expect(formatMixedQty(product, 19)).toBe("1 Pack + 7 Piece");
  });

  it("shows 103 pieces as 8 Pack + 7 Piece (not 8.58 Pack)", () => {
    const piece = unit({
      id: "pc",
      symbol: "pc",
      name: "Piece",
      contains: 1,
      isBase: true,
      factorDirection: "multiply",
    });
    const pack = unit({
      id: "pk",
      symbol: "pk",
      name: "Pack",
      contains: 12,
      factorDirection: "multiply",
    });
    const product = { unit: "pc", sellUnits: [piece, pack] } as Product;
    expect(formatMixedQty(product, 103)).toBe("8 Pack + 7 Piece");
  });

  it("formatLinkedQty uses whole packs + pieces (not decimal Pack)", () => {
    const piece = unit({
      id: "pc",
      symbol: "pc",
      name: "Piece",
      contains: 1,
      isBase: true,
      factorDirection: "multiply",
    });
    const pack = unit({
      id: "pk",
      symbol: "pk",
      name: "Pack",
      contains: 12,
      factorDirection: "multiply",
    });
    const product = { unit: "pc", sellUnits: [piece, pack] } as Product;
    // 99980.2 Pack would be wrong; mixed must floor packs.
    expect(formatLinkedQty(product, 1_199_762)).toBe("99980 Pack + 2 Piece");
    expect(formatLinkedQty(product, 1_199_762)).not.toMatch(/99980\.2/);
  });
});
