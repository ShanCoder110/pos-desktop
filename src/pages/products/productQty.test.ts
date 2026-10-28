import { describe, expect, it } from "vitest";
import type { ProductSellUnit } from "@/shared/types";
import { blankProduct, openingLot } from "@/pages/products/productLots";
import { fifoCostForProduct } from "@/pages/products/productFifo";
import { displayToBaseQty } from "@/utils/salePricing";
import {
  applyBaseUnitChange,
  adjacentContains,
  assignBaseSymbol,
  baseChangeCostFactor,
  canonicalUnit,
  containsLabel,
  containsRelationHint,
  deriveAll,
  derivePricesBetween,
  editUnitRate,
  factorDirectionForContains,
  formatLinkedQty,
  formatMixedQty,
  inventoryPerSellUnit,
  normalizeSellUnits,
  lotCostInStockUnit,
  priceBreakdown,
  priceFromStock,
  pricePerStock,
  preferredUnit,
  promoteUnitToInventory,
  qtyUnits,
  sellUnitOptionValue,
  sellUnitOptions,
  setAdjacentContains,
  setPreferredUnit,
  setInventoryBaseUnit,
  setStockRelativeContains,
  suggestedExtraUnit,
  synchronizeUnitCosts,
  unitHierarchySummary,
  unitConversionEquation,
  conversionReferenceUnits,
  setUnitConversionFromReference,
  smallestConversionUnit,
  unitConversionForCard,
  unitRateReference,
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

describe("explicit stock-reference equations", () => {
  it("orders arbitrary names by entered quantities and leaves the POS default separate", () => {
    const units = [
      unit({ id: "each", symbol: "custom-a", name: "Each", isBase: true, isDefault: true }),
      unit({
        id: "bundle",
        symbol: "custom-b",
        name: "Bundle",
        contains: 10,
        factorDirection: "multiply",
      }),
      unit({
        id: "case",
        symbol: "custom-c",
        name: "Case",
        contains: 30,
        factorDirection: "multiply",
      }),
    ];
    const equation = unitConversionEquation(units, "case")!;
    expect(equation.from.id).toBe("case");
    expect(equation.to.id).toBe("each");
    expect(equation.quantity).toBe(30);
    const withDefault = setPreferredUnit(units, "bundle");
    expect(qtyUnits(withDefault).map((row) => row.id)).toEqual(["case", "bundle", "each"]);
    expect(canonicalUnit(withDefault)?.id).toBe("each");
    expect(unitConversionEquation(withDefault, "each")).toBeUndefined();
  });

  it("shows an existing Roll reference as 1 Roll = 90 Gaz without rebasing stock", () => {
    const units = [roll, { ...gaz, factorDirection: "divide" as const }];
    const before = structuredClone(units);
    const equation = unitConversionEquation(units, "gaz")!;
    expect(equation.from.id).toBe("roll");
    expect(equation.to.id).toBe("gaz");
    expect(equation.quantity).toBe(90);
    const reversed = unitConversionEquation(units, "gaz", "multiply")!;
    expect(reversed.from.id).toBe("gaz");
    expect(reversed.quantity).toBeCloseTo(1 / 90);
    expect(units).toEqual(before);
  });

  it("accepts fractional and 1:1 equations while keeping selling prices manual", () => {
    const meter = unit({ id: "meter", symbol: "m", isBase: true, isDefault: true, cost: 100 });
    const foot = unit({ id: "foot", symbol: "ft", contains: 0, price: 50 });
    const units = setStockRelativeContains([meter, foot], "foot", 0.3048, "multiply");
    expect(validateSellUnits(units)).toBeNull();
    expect(inventoryPerSellUnit(units[1])).toBe(0.3048);
    expect(units[1].kind).toBe("smaller");
    expect(units[1].cost).toBe(30.48);
    expect(units[1].price).toBe(50);
    const equal = setStockRelativeContains(units, "foot", 1, "multiply");
    expect(validateSellUnits(equal)).toBeNull();
    expect(equal[1].price).toBe(50);
  });

  it("rejects invalid factors and ambiguous stock references", () => {
    for (const contains of [0, -1, Infinity, NaN]) {
      expect(validateSellUnits([roll, { ...gaz, contains }])).toBe("unitFactorInvalid");
    }
    expect(validateSellUnits([{ ...roll, isBase: false }, gaz])).toBe("unitBaseRequired");
    expect(validateSellUnits([roll, { ...gaz, isBase: true }])).toBe("unitBaseRequired");
  });
});

describe("gaz in 1 roll prices", () => {
  it("keeps saved custom unit prices when a different unit is edited", () => {
    const units = [
      { ...roll, price: 240, wholesale: 220 },
      { ...gaz, contains: 24, price: 15, wholesale: 10, factorDirection: "divide" as const },
    ];
    const changed = editUnitRate(units, "roll", "price", 260);
    expect(changed.find((row) => row.id === "roll")?.price).toBe(260);
    expect(changed.find((row) => row.id === "gaz")?.price).toBe(15);
    expect(normalizeSellUnits(changed).find((row) => row.id === "gaz")?.price).toBe(15);
  });

  it("leaves even proportional smaller selling rates unchanged when Roll increases", () => {
    const units = [
      roll,
      { ...gaz, contains: 90, factorDirection: "divide" as const, price: 61.11 },
    ];
    const changed = editUnitRate(units, "roll", "price", 6300);
    expect(changed.find((row) => row.id === "gaz")?.price).toBe(61.11);
  });

  it.each(["min", "wholesale", "price"] as const)(
    "editing Piece %s never changes Pack, even when the old rates were proportional",
    (key) => {
      const units = [
        unit({ id: "pack", symbol: "pk", isBase: true, [key]: 120 }),
        unit({ id: "piece", symbol: "pc", contains: 12, factorDirection: "divide", [key]: 10 }),
      ];
      const changed = editUnitRate(units, "piece", key, 15);
      expect(changed.find((row) => row.id === "piece")?.[key]).toBe(15);
      expect(changed.find((row) => row.id === "pack")?.[key]).toBe(120);
    },
  );

  it("retains the manual Gaz rate through reopening and a smaller Roll increase", () => {
    const units = [
      { ...roll, price: 120 },
      { ...gaz, factorDirection: "divide" as const, price: 1.33 },
    ];
    const edited = editUnitRate(units, "gaz", "price", 1.5);
    expect(edited.find((row) => row.id === "roll")?.price).toBe(120);
    // API rows do not retain the form's priceManual flags.
    const reopened = normalizeSellUnits(edited.map(({ priceManual: _manual, ...row }) => row));
    const increased = editUnitRate(reopened, "roll", "price", 130);
    expect(increased.find((row) => row.id === "gaz")?.price).toBe(1.5);
    const decreased = editUnitRate(increased, "roll", "price", 90);
    expect(decreased.find((row) => row.id === "gaz")?.price).toBe(1.5);
  });

  it.each([1.5, 2])("keeps manual Gaz price %s when Roll increases to 300", (price) => {
    const changed = editUnitRate(
      [
        { ...roll, price: 120 },
        { ...gaz, price, factorDirection: "divide" },
      ],
      "roll",
      "price",
      300,
    );
    expect(changed.find((row) => row.id === "gaz")?.price).toBe(price);
    expect(unitRateReference(changed, "gaz", "price")?.value).toBeCloseTo(300 / 90);
    expect(unitRateReference(changed, "gaz", "price")?.belowReference).toBe(true);
  });

  it("keeps a higher manual Gaz rate when Roll increases", () => {
    const changed = editUnitRate(
      [
        { ...roll, price: 120 },
        { ...gaz, price: 4, factorDirection: "divide" },
      ],
      "roll",
      "price",
      300,
    );
    expect(changed.find((row) => row.id === "gaz")?.price).toBe(4);
    expect(unitRateReference(changed, "gaz", "price")?.belowReference).toBe(false);
  });

  it("uses conversion quantities across Box, Pack and Piece", () => {
    const units = [
      unit({ id: "piece", symbol: "pc", isBase: true, price: 2 }),
      unit({ id: "pack", symbol: "pk", contains: 10, factorDirection: "multiply", price: 20 }),
      unit({ id: "box", symbol: "box", contains: 30, factorDirection: "multiply", price: 50 }),
    ];
    const changed = editUnitRate(units, "pack", "price", 35);
    expect(changed.find((row) => row.id === "piece")?.price).toBe(2);
    expect(changed.find((row) => row.id === "box")?.price).toBe(50);
    expect(changed.find((row) => row.id === "piece")?.wholesale).toBe(0);
    expect(unitRateReference(changed, "piece", "price")?.source.id).toBe("pack");
    expect(unitRateReference(changed, "piece", "price")?.value).toBe(3.5);
    expect(unitRateReference(changed, "box", "price")).toBeUndefined();
  });

  it("calculates a reference without filling or replacing manual smaller prices", () => {
    const units = [
      { ...roll, price: 120 },
      { ...gaz, contains: 0, price: 0, factorDirection: "divide" as const },
    ];
    expect(unitRateReference(units, "gaz", "price")).toBeUndefined();
    const configured = setStockRelativeContains(units, "gaz", 90, "divide");
    expect(configured.find((row) => row.id === "gaz")?.price).toBe(0);
    expect(unitRateReference(configured, "gaz", "price")?.belowReference).toBe(false);
    expect(unitRateReference(configured, "gaz", "price")?.value).toBeCloseTo(120 / 90);
    const edited = editUnitRate(configured, "gaz", "price", 2);
    const resized = setStockRelativeContains(edited, "gaz", 100, "divide");
    expect(resized.find((row) => row.id === "gaz")?.price).toBe(2);
    expect(unitRateReference(resized, "gaz", "price")?.value).toBeCloseTo(1.2);
  });

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
      factorDirection: undefined,
    });
    expect(derivePricesBetween(roll, gazFraction).price).toBe(61.11);
  });

  it("promotes Gaz to inventory and enables 1 Roll contains", () => {
    const gazCard = unit({
      id: "gaz",
      symbol: "gaz",
      name: "Gaz",
      contains: 90,
      factorDirection: "divide",
      isBase: false,
    });
    const next = applyBaseUnitChange([roll, gazCard], "gaz");
    const gaz = next.find((row) => row.id === "gaz")!;
    const stock = next.find((row) => row.id === "roll")!;
    expect(canonicalUnit(next)?.id).toBe("gaz");
    expect(gaz.contains).toBe(1);
    expect(gaz.isBase).toBe(true);
    expect(gaz.isDefault).toBe(true);
    expect(stock.contains).toBe(90);
    expect(stock.factorDirection).toBe("multiply");
    expect(stock.isBase).toBe(false);
    expect(containsLabel(next, stock)).toBe("1 Roll contains");
    expect(containsRelationHint(next, stock)).toBe("1 Roll = 90 Gaz");
  });

  it("promotes Pack above Piece and keeps twelve Pieces per Pack", () => {
    const piece = unit({
      id: "piece",
      symbol: "pc",
      name: "Piece",
      isBase: true,
      isDefault: true,
      cost: 67,
      min: 70,
      wholesale: 75,
      price: 100,
    });
    const pack = unit({
      id: "pack",
      symbol: "pk",
      name: "Pack",
      contains: 12,
      factorDirection: "divide", // legacy wrong direction after changing a unit name
      isBase: false,
      isDefault: false,
    });
    expect(factorDirectionForContains("divide", 12, "pk")).toBe("multiply");
    const promoted = promoteUnitToInventory([piece, pack], "pack");
    expect(qtyUnits(promoted).map((row) => row.id)).toEqual(["pack", "piece"]);
    expect(canonicalUnit(promoted)).toMatchObject({
      id: "pack",
      contains: 1,
      isBase: true,
      isDefault: true,
      cost: 804,
      price: 1200,
    });
    expect(promoted.find((row) => row.id === "piece")).toMatchObject({
      contains: 12,
      factorDirection: "divide",
      cost: 67,
      price: 100,
    });
    expect(
      containsRelationHint(
        promoted,
        promoted.find((row) => row.id === "piece")!,
      ),
    ).toBe("1 Pack = 12 Piece");
    expect(unitConversionForCard(promoted, "pack")).toMatchObject({
      from: { id: "pack" },
      to: { id: "piece" },
      quantity: 12,
    });
    expect(unitConversionForCard(promoted, "piece")).toMatchObject({
      from: { id: "piece" },
      to: { id: "piece" },
      quantity: 1,
    });
    expect(unitConversionForCard(promoted, "piece", "pack")).toMatchObject({
      to: { id: "pack" },
      quantity: 0.0833,
    });
  });

  it("normalizes Box entry through Piece and preserves it when Pack size changes", () => {
    const pack = unit({
      id: "pack",
      symbol: "pk",
      name: "Pack",
      contains: 1,
      factorDirection: "multiply",
      isBase: true,
      isDefault: true,
      cost: 120,
      min: 140,
      wholesale: 160,
      price: 200,
    });
    const piece = unit({
      id: "piece",
      symbol: "pc",
      name: "Piece",
      contains: 12,
      factorDirection: "divide",
      isBase: false,
      isDefault: false,
      cost: 10,
    });
    const box = unit({
      id: "box",
      symbol: "box",
      name: "Box",
      contains: 0,
      factorDirection: "multiply",
      isBase: false,
      isDefault: false,
    });

    expect(smallestConversionUnit([pack, piece, box])?.id).toBe("piece");
    expect(conversionReferenceUnits([pack, piece, box], "box").map((row) => row.id)).toEqual([
      "piece",
      "pack",
    ]);
    expect(unitConversionForCard([pack, piece, box], "box")).toMatchObject({
      to: { id: "piece" },
      quantity: 0,
    });

    const configured = setUnitConversionFromReference([pack, piece, box], "box", "piece", 120);
    expect(configured.find((row) => row.id === "box")).toMatchObject({
      contains: 10,
      factorDirection: "multiply",
      cost: 1200,
    });
    expect(unitConversionForCard(configured, "box")).toMatchObject({
      to: { id: "piece" },
      quantity: 120,
    });
    expect(unitConversionForCard(configured, "box", "pack")).toMatchObject({
      to: { id: "pack" },
      quantity: 10,
    });
    expect(unitHierarchySummary(configured)).toBe("1 Box = 10 Pack = 120 Piece");

    const resizedPack = setUnitConversionFromReference(configured, "pack", "piece", 10);
    expect(resizedPack.find((row) => row.id === "piece")).toMatchObject({
      contains: 10,
      factorDirection: "divide",
    });
    expect(resizedPack.find((row) => row.id === "box")).toMatchObject({
      contains: 12,
      factorDirection: "multiply",
    });
    expect(unitConversionForCard(resizedPack, "box")).toMatchObject({ quantity: 120 });
    expect(unitHierarchySummary(resizedPack)).toBe("1 Box = 12 Pack = 120 Piece");
  });

  it("infers a missing legacy Piece direction beneath Pack", () => {
    const pack = unit({
      id: "pack",
      symbol: "pk",
      name: "Pack",
      contains: 1,
      isBase: true,
      isDefault: true,
      cost: 120,
      price: 240,
    });
    const piece = unit({
      id: "piece",
      symbol: "pc",
      name: "Piece",
      contains: 12,
      factorDirection: undefined,
    });
    const normalized = normalizeSellUnits([piece, pack]);
    expect(qtyUnits(normalized).map((row) => row.id)).toEqual(["pack", "piece"]);
    expect(normalized.find((row) => row.id === "piece")?.factorDirection).toBe("divide");
    expect(normalized.find((row) => row.id === "piece")?.cost).toBe(10);
    expect(normalized.find((row) => row.id === "piece")?.price).toBe(20);
    expect(adjacentContains(normalized, normalized[0])).toBe(12);
  });

  it("shows Box, Pack, and Piece as adjacent steps but stores stock-relative factors", () => {
    const piece = unit({
      id: "piece",
      symbol: "pc",
      name: "Piece",
      contains: 1,
      isBase: true,
      isDefault: true,
      cost: 5,
      min: 6,
      wholesale: 7,
      price: 8,
    });
    const pack = unit({
      id: "pack",
      symbol: "pk",
      name: "Pack",
      contains: 0,
      isBase: false,
      isDefault: false,
    });
    const box = unit({
      id: "box",
      symbol: "box",
      name: "Box",
      contains: 0,
      isBase: false,
      isDefault: false,
    });
    const withPack = setStockRelativeContains([piece, pack, box], "pack", 10, "multiply");
    const withBox = setStockRelativeContains(withPack, "box", 30, "multiply");
    expect(withBox.find((row) => row.id === "pack")?.contains).toBe(10);
    expect(withBox.find((row) => row.id === "box")?.contains).toBe(30);
    expect(withBox.find((row) => row.id === "box")?.cost).toBe(150);

    const promoted = promoteUnitToInventory(withBox, "box");
    const ordered = qtyUnits(promoted);
    expect(ordered.map((row) => row.id)).toEqual(["box", "pack", "piece"]);
    expect(ordered.map((row) => row.contains)).toEqual([1, 3, 30]);
    expect(ordered.map((row) => row.factorDirection)).toEqual(["multiply", "divide", "divide"]);
    expect(adjacentContains(promoted, ordered[1])).toBe(3);
    expect(adjacentContains(promoted, ordered[2])).toBe(10);
    expect(containsLabel(promoted, ordered[2])).toBe("1 Pack contains");
    expect(containsRelationHint(promoted, ordered[2])).toBe("1 Pack = 10 Piece");
    expect(unitHierarchySummary(promoted)).toBe("1 Box = 3 Pack = 30 Piece");

    const changed = setAdjacentContains(promoted, "pack", 6);
    expect(changed.find((row) => row.id === "pack")?.contains).toBe(6);
    expect(changed.find((row) => row.id === "piece")?.contains).toBe(60);
    expect(
      adjacentContains(
        changed,
        changed.find((row) => row.id === "piece")!,
      ),
    ).toBe(10);
  });

  it("uses conversions rather than names and keeps the POS default separate from stock", () => {
    const each = unit({
      id: "each",
      symbol: "custom-a",
      name: "Each",
      contains: 1,
      isBase: true,
      isDefault: true,
      cost: 5,
    });
    const inner = unit({
      id: "inner",
      symbol: "custom-b",
      name: "Inner",
      contains: 0,
      isBase: false,
      isDefault: false,
    });
    const caseUnit = unit({
      id: "case",
      symbol: "custom-c",
      name: "Case",
      contains: 0,
      isBase: false,
      isDefault: false,
    });
    const withInner = setStockRelativeContains([each, inner, caseUnit], "inner", 10, "multiply");
    const withCase = setStockRelativeContains(withInner, "case", 30, "multiply");
    const preferredCase = setPreferredUnit(withCase, "case");
    expect(qtyUnits(preferredCase).map((row) => row.id)).toEqual(["case", "inner", "each"]);
    expect(canonicalUnit(preferredCase)?.id).toBe("each");
    expect(preferredUnit(preferredCase)?.id).toBe("case");
    expect(preferredCase.find((row) => row.id === "case")?.cost).toBe(150);
    expect(unitHierarchySummary(preferredCase)).toBe("1 Case = 3 Inner = 30 Each");

    const withHalf = setStockRelativeContains(preferredCase, "inner", 2, "divide");
    const rebased = setInventoryBaseUnit(withHalf, "inner");
    expect(canonicalUnit(rebased)?.id).toBe("inner");
    expect(preferredUnit(rebased)?.id).toBe("case");
    expect(inventoryPerSellUnit(rebased.find((row) => row.id === "case")!)).toBe(60);
  });

  it("leaves Roll contains blank when promoting a Gaz with no factor yet", () => {
    const gazCard = unit({
      id: "gaz",
      symbol: "gaz",
      name: "Gaz",
      contains: 0,
      factorDirection: "divide",
      isBase: false,
      kind: "smaller",
    });
    const next = applyBaseUnitChange([roll, gazCard], "gaz");
    const stock = next.find((row) => row.id === "roll")!;
    expect(canonicalUnit(next)?.id).toBe("gaz");
    expect(stock.contains).toBe(0);
    expect(stock.factorDirection).toBe("multiply");
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

  it("shows 7 pieces of a 10-pack as 7 Piece (not 0.7 Pack) — Step 26 lot Qty lock display", () => {
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
      contains: 10,
      factorDirection: "multiply",
    });
    const product = { unit: "pc", sellUnits: [piece, pack] } as Product;
    expect(formatMixedQty(product, 7)).toBe("7 Piece");
    expect(formatMixedQty(product, 7)).not.toMatch(/0\.7/);
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

describe("inventory unit cost", () => {
  it("preserves the entered pack cost when deriving a rounded piece cost", () => {
    const pack = unit({
      id: "pack",
      symbol: "pk",
      contains: 1,
      isBase: true,
      cost: 194,
    });
    const piece = unit({
      id: "piece",
      symbol: "pc",
      contains: 24,
      factorDirection: "divide",
      cost: 0,
    });
    const priced = synchronizeUnitCosts([pack, piece], "pack", 194);
    expect(priced.map((row) => row.cost)).toEqual([194, 8.08]);
    const corrected = deriveAll([pack, { ...piece, cost: 194, priceManual: { cost: true } }]);
    expect(corrected.map((row) => row.cost)).toEqual([194, 8.08]);
  });

  it("uses the recorded pack cost even when a piece reference cost is stale", () => {
    const product = {
      ...blankProduct(),
      id: "cost-case",
      unit: "pk",
      cost: 194,
      min: 205,
      wholesale: 220,
      retail: 240,
      sellUnits: [
        unit({
          id: "pack",
          symbol: "pk",
          name: "Pack",
          contains: 1,
          isBase: true,
          isDefault: true,
          cost: 194,
          min: 205,
          wholesale: 220,
          price: 240,
        }),
        unit({
          id: "piece",
          symbol: "pc",
          name: "Piece",
          contains: 24,
          factorDirection: "divide",
          cost: 194,
          priceManual: { cost: true },
          min: 9,
          wholesale: 10,
          price: 15,
        }),
      ],
    };
    const lot = { ...openingLot(product, []), purchasePrice: 194, remainingQuantity: 1 };
    const cost = fifoCostForProduct(product, [lot]);
    expect(cost).toBe(194);
    expect(priceBreakdown(product, cost).map((row) => row.value)).toEqual([194, 8.08]);
    expect((product.retail - cost) / product.retail).toBeCloseTo(46 / 240);
  });

  it("does not guess the unit of a low purchase cost from the selling price", () => {
    const product = {
      ...blankProduct(),
      unit: "pk",
      min: 205,
      retail: 240,
      sellUnits: [
        unit({ id: "pack", symbol: "pk", isBase: true, isDefault: true, contains: 1 }),
        unit({ id: "piece", symbol: "pc", contains: 24, factorDirection: "divide" }),
      ],
    };
    expect(lotCostInStockUnit(product, 50)).toBe(50);
    expect(priceBreakdown(product, 50).map((row) => row.value)).toEqual([50, 2.08]);
  });
});
