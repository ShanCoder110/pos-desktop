import type { Product, ProductSellUnit } from "@/shared/types";
import { normalizeSellUnits } from "@/pages/products/productQty";
import { productSellUnits as creditUnits } from "@/pages/credit/creditSaleUtils";

export type SalePriceTier = "retail" | "wholesale" | "minimum";

export function unitsForProduct(product: Product): ProductSellUnit[] {
  if (product.sellUnits?.length) return normalizeSellUnits(product.sellUnits);
  return creditUnits(product);
}

export function resolveSellUnit(product: Product, unitId?: string): ProductSellUnit | undefined {
  const units = unitsForProduct(product);
  if (unitId) {
    const hit = units.find((u) => u.id === unitId);
    if (hit) return hit;
  }
  return (
    units.find((u) => u.isBase || u.kind === "base") ??
    units.find((u) => u.contains === 1) ??
    units[0]
  );
}

/** Selling price for one displayed unit at the given tier (uses product_units row, not base×factor). */
export function unitTierPrice(unit: ProductSellUnit | undefined, tier: SalePriceTier): number {
  if (!unit) return 0;
  if (tier === "minimum") return Number(unit.min) || 0;
  if (tier === "wholesale") return Number(unit.wholesale) || 0;
  return Number(unit.price) || 0;
}

export function posTierPrice(
  product: Product,
  unitId: string,
  tier: "retail" | "wholesale",
): number {
  const unit = resolveSellUnit(product, unitId);
  return unitTierPrice(unit, tier === "wholesale" ? "wholesale" : "retail");
}

export function creditTierPrice(unit: ProductSellUnit | undefined, tier: SalePriceTier): number {
  return unitTierPrice(unit, tier);
}

export function displayToBaseQty(unit: ProductSellUnit, displayQty: number): number {
  const factor = unit.contains > 0 ? unit.contains : 1;
  return +(displayQty * factor).toFixed(3);
}

export function lineTotal(displayQty: number, unitPrice: number): number {
  return +(displayQty * unitPrice).toFixed(2);
}

export function lineProfit(displayQty: number, unitPrice: number, unitCost: number): number {
  return +((unitPrice - unitCost) * displayQty).toFixed(2);
}

export function unitCostPerDisplay(unit: ProductSellUnit): number {
  return Number(unit.cost) || 0;
}

export type PosPriceMode = "retail" | "wholesale";

/** List/min prices for a cart line's unit row at retail or wholesale (not base×factor). */
export function cartLineTierPrices(
  product: Product,
  productUnitId: string,
  mode: PosPriceMode,
): { listPrice: number; minPrice: number } {
  const unit = resolveSellUnit(product, productUnitId);
  const tier = mode === "wholesale" ? "wholesale" : "retail";
  const listPrice = unitTierPrice(unit, tier);
  const minPrice = unitTierPrice(unit, "minimum");
  return { listPrice, minPrice };
}

/** When switching a line between sell units, keep base qty and apply target unit tier prices. */
export function convertLineToUnit(
  product: Product,
  baseQty: number,
  priceMode: PosPriceMode,
  targetUnitId: string,
): {
  productUnitId: string;
  qty: number;
  listPrice: number;
  unitPrice: number;
  minPrice: number;
  sellUnit: string;
  packSize: number;
} | null {
  const target = resolveSellUnit(product, targetUnitId);
  if (!target?.id) return null;
  const factor = target.contains > 0 ? target.contains : 1;
  const tier = priceMode === "wholesale" ? "wholesale" : "retail";
  const listPrice = unitTierPrice(target, tier);
  const minPrice = unitTierPrice(target, "minimum");
  return {
    productUnitId: target.id,
    qty: +(baseQty / factor).toFixed(3),
    listPrice,
    unitPrice: listPrice,
    minPrice,
    sellUnit: target.name || target.symbol || product.unit,
    packSize: factor,
  };
}
