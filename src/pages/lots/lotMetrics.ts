import type { ProductLotRow } from "@/shared/domain/types";

/**
 * Shared lot sold / shrinkage metrics.
 * Sold is movement-committed only — stock-count downs are shrinkage (cost), never sales/profit.
 */
export function lotSoldQuantity(lot: ProductLotRow): number {
  return Math.max(0, Number(lot.soldQuantity) || 0);
}

export function lotShrunkQuantity(lot: ProductLotRow): number {
  return Math.max(0, Number(lot.shrunkQuantity) || 0);
}

export function lotSoldRevenue(lot: ProductLotRow): number {
  return Math.max(0, Number(lot.soldRevenue) || 0);
}

export function lotSoldProfit(lot: ProductLotRow): number {
  return Number(lot.soldProfit) || 0;
}

export function lotShrinkCost(lot: ProductLotRow): number {
  return Math.max(0, Number(lot.shrinkCost) || 0);
}
