import { describe, expect, it } from "vitest";
import type { ProductLotRow } from "@/shared/domain/types";
import {
  lotShrinkCost,
  lotShrunkQuantity,
  lotSoldProfit,
  lotSoldQuantity,
  lotSoldRevenue,
} from "@/pages/lots/lotMetrics";

/** Hand-check: lot 100 @ 8, sell 10 @ 15, count down 5 → sold 10 / rev 150 / profit 70 / shrink 5 (Rs 40) / left 85. */
function handCheckLot(): ProductLotRow {
  return {
    id: "lot-1",
    productId: "p1",
    supplierId: "",
    lotNumber: "L-1",
    purchasePrice: 8,
    minimumPrice: 0,
    wholesalePrice: 0,
    retailPrice: 15,
    originalQuantity: 100,
    remainingQuantity: 85,
    damagedQuantity: 0,
    soldQuantity: 10,
    shrunkQuantity: 5,
    soldRevenue: 150,
    soldProfit: 70,
    shrinkCost: 40,
    receivedAt: "2026-10-17",
    expiryDate: null,
    createdBy: "",
  };
}

describe("lotMetrics", () => {
  it("hand-check: sold/revenue/profit ignore shrinkage", () => {
    const lot = handCheckLot();
    expect(lotSoldQuantity(lot)).toBe(10);
    expect(lotSoldRevenue(lot)).toBe(150);
    expect(lotSoldProfit(lot)).toBe(70);
    expect(lotShrunkQuantity(lot)).toBe(5);
    expect(lotShrinkCost(lot)).toBe(40);
    expect(lot.remainingQuantity).toBe(85);
    // Residual formula would wrongly treat count-down as sold:
    const residual = Math.max(
      0,
      lot.originalQuantity - lot.remainingQuantity - lot.damagedQuantity,
    );
    expect(residual).toBe(15);
    expect(lotSoldQuantity(lot)).not.toBe(residual);
  });

  it("never invents residual sold when API fields are missing", () => {
    const lot: ProductLotRow = {
      id: "lot-2",
      productId: "p1",
      supplierId: "",
      lotNumber: "L-2",
      purchasePrice: 8,
      minimumPrice: 0,
      wholesalePrice: 0,
      retailPrice: 15,
      originalQuantity: 100,
      remainingQuantity: 0,
      damagedQuantity: 0,
      receivedAt: "2026-10-17",
      expiryDate: null,
      createdBy: "",
    };
    expect(lotSoldQuantity(lot)).toBe(0);
    expect(lotShrunkQuantity(lot)).toBe(0);
  });
});
