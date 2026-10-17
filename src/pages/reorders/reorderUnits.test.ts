import { describe, expect, it } from "vitest";
import type { ProductSellUnit } from "@/shared/types";
import {
  reorderCostPerBase,
  reorderDisplayedToBaseQty,
  reorderLineBaseTotals,
} from "@/pages/reorders/reorderUnits";

function packUnit(contains = 10): ProductSellUnit {
  return {
    id: "pack-1",
    name: "Pack",
    symbol: "pk",
    contains,
    cost: 80,
    min: 80,
    wholesale: 90,
    price: 100,
    barcode: "",
    isBase: false,
    isDefault: false,
    factorDirection: "multiply",
  };
}

function pieceUnit(): ProductSellUnit {
  return {
    id: "pc-1",
    name: "Piece",
    symbol: "pc",
    contains: 1,
    cost: 8,
    min: 8,
    wholesale: 9,
    price: 10,
    barcode: "",
    isBase: true,
    isDefault: true,
    factorDirection: "multiply",
  };
}

describe("reorderUnits base conversion", () => {
  it("3 Pack @ 10 pcs and Rs 80/pack → 30 base, Rs 8/base", () => {
    const pack = packUnit(10);
    const totals = reorderLineBaseTotals(pack, 3, 80);
    expect(totals.baseQty).toBe(30);
    expect(totals.costPerBase).toBe(8);
    expect(totals.lineTotal).toBe(240);
    expect(reorderDisplayedToBaseQty(pack, 3)).toBe(30);
    expect(reorderCostPerBase(pack, 80)).toBe(8);
  });

  it("piece unit is 1:1", () => {
    const piece = pieceUnit();
    expect(reorderLineBaseTotals(piece, 5, 8)).toEqual({
      baseQty: 5,
      costPerBase: 8,
      lineTotal: 40,
    });
  });
});
