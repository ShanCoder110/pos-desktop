import { describe, expect, it } from "vitest";
import { editLotUnitPrice, seedLotUnits } from "@/pages/lots/lotUnitPricing";
import { blankProduct } from "@/pages/products/productLots";

function packAndPiece() {
  return {
    ...blankProduct(),
    unit: "pk",
    cost: 194,
    min: 205,
    wholesale: 220,
    retail: 240,
    sellUnits: [
      {
        id: "pack",
        name: "Pack",
        symbol: "pk",
        contains: 1,
        factorDirection: "multiply" as const,
        cost: 194,
        min: 205,
        wholesale: 220,
        price: 240,
        barcode: "",
        isBase: true,
        isDefault: true,
      },
      {
        id: "piece",
        name: "Piece",
        symbol: "pc",
        contains: 24,
        factorDirection: "divide" as const,
        cost: 8.08,
        min: 9,
        wholesale: 10,
        price: 15,
        barcode: "",
        isBase: false,
        isDefault: false,
      },
    ],
  };
}

describe("lot prices for multiple units", () => {
  it("loads lot cost without replacing independent Piece selling prices", () => {
    const units = seedLotUnits(packAndPiece(), {
      purchasePrice: 194,
      minimumPrice: 205,
      wholesalePrice: 220,
      retailPrice: 240,
    });
    expect(units.map((unit) => [unit.cost, unit.min, unit.wholesale, unit.price])).toEqual([
      [194, 205, 220, 240],
      [8.08, 9, 10, 15],
    ]);
  });

  it("edits a Piece tier independently but converts a Piece cost to Pack cost", () => {
    const units = seedLotUnits(packAndPiece());
    const withPieceMinimum = editLotUnitPrice(units, "pk", "piece", "min", 11);
    expect(withPieceMinimum.map((unit) => unit.min)).toEqual([205, 11]);
    const withPieceCost = editLotUnitPrice(units, "pk", "piece", "cost", 9);
    expect(withPieceCost.map((unit) => unit.cost)).toEqual([216, 9]);
  });
});
