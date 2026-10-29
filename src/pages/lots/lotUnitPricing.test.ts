import { describe, expect, it } from "vitest";
import { editLotUnitPrice, seedLotUnits } from "@/pages/lots/lotUnitPricing";
import { blankProduct } from "@/pages/products/productLots";
import { normalizeSellUnits, unitRateReference } from "@/pages/products/productQty";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LotUnitLines } from "@/pages/products/LotFields";

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
  it.each(["cost", "min", "wholesale", "price"] as const)(
    "keeps Pack %s unchanged when Piece is edited, including after reopening",
    (key) => {
      const product = packAndPiece();
      const original = seedLotUnits(product);
      const packRate = original[0][key];
      const edited = editLotUnitPrice(original, "pk", "piece", key, 17);
      expect(edited[0][key]).toBe(packRate);
      expect(edited[1][key]).toBe(17);
      expect(unitRateReference(edited, "pack", key)?.value).toBe(408);
      const reopened = seedLotUnits(
        {
          ...product,
          sellUnits: normalizeSellUnits(edited.map(({ priceManual: _manual, ...row }) => row)),
        },
        {
          purchasePrice: original[0].cost,
          minimumPrice: original[0].min,
          wholesalePrice: original[0].wholesale,
          retailPrice: original[0].price,
        },
      );
      expect(reopened[0][key]).toBe(packRate);
      expect(reopened[1][key]).toBe(17);
      const packEdited = editLotUnitPrice(reopened, "pk", "pack", key, 480);
      expect(packEdited[1][key]).toBe(17);
    },
  );

  it("renders calculated references below lot price fields without replacing their input values", () => {
    const units = editLotUnitPrice(seedLotUnits(packAndPiece()), "pk", "piece", "cost", 9);
    const html = renderToStaticMarkup(
      createElement(LotUnitLines, {
        units,
        stockSymbol: "pk",
        received: 2,
        left: 2,
        damaged: 0,
      }),
    );
    expect(html).toContain("Calculated: Rs. 216 from Piece");
    expect(html).toContain('value="194"');
    expect(html).toContain('value="9"');
  });

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

  it("edits Piece selling prices and cost without overwriting Pack", () => {
    const units = seedLotUnits(packAndPiece());
    const withPieceMinimum = editLotUnitPrice(units, "pk", "piece", "min", 11);
    expect(withPieceMinimum.map((unit) => unit.min)).toEqual([205, 11]);
    const withPieceCost = editLotUnitPrice(units, "pk", "piece", "cost", 9);
    expect(withPieceCost.map((unit) => unit.cost)).toEqual([194, 9]);
  });
});
