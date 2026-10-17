import { inventoryPerSellUnit, roundStockQty } from "@/pages/products/productQty";
import type { ProductSellUnit } from "@/shared/types";

/** Display qty × unit → base inventory qty (e.g. 3 Pack × 10 = 30 Piece). */
export function reorderDisplayedToBaseQty(unit: ProductSellUnit, displayedQty: number): number {
  if (!Number.isFinite(displayedQty) || displayedQty <= 0) return 0;
  return roundStockQty(displayedQty * inventoryPerSellUnit(unit));
}

/**
 * Cost per selected unit → cost per base unit.
 * Example: Rs 80 / Pack with 10 pcs/pack → Rs 8 / Piece.
 */
export function reorderCostPerBase(unit: ProductSellUnit, unitCost: number): number {
  const per = inventoryPerSellUnit(unit);
  if (!Number.isFinite(unitCost) || unitCost < 0 || !(per > 0)) return 0;
  return roundStockQty(unitCost / per);
}

/** Hand-check helper used by Vitest and the create drawer preview. */
export function reorderLineBaseTotals(
  unit: ProductSellUnit,
  displayedQty: number,
  unitCost: number,
): { baseQty: number; costPerBase: number; lineTotal: number } {
  const baseQty = reorderDisplayedToBaseQty(unit, displayedQty);
  const costPerBase = reorderCostPerBase(unit, unitCost);
  const lineTotal = roundStockQty(
    Number.isFinite(displayedQty) && Number.isFinite(unitCost) ? displayedQty * unitCost : 0,
  );
  return { baseQty, costPerBase, lineTotal };
}
