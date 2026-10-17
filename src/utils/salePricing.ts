import type { Product, ProductSellUnit } from "@/shared/types";
import { inventoryPerSellUnit, normalizeSellUnits } from "@/pages/products/productQty";
import { productSellUnits as creditUnits } from "@/pages/credit/creditSaleUtils";
import {
  defaultTransactionUnit,
  displayedToStockQuantity,
  stockToDisplayedQuantity,
} from "@/utils/unitConversion";

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
  return defaultTransactionUnit(product, units);
}

/** Exact product barcode → undefined (default unit). Exact sell-unit barcode → that unit. */
export function resolveMatchedUnitId(
  product: Product,
  query: string,
  matchedUnitId?: string | null,
): string | undefined {
  if (matchedUnitId) {
    const hit = resolveSellUnit(product, matchedUnitId);
    if (hit?.id) return hit.id;
  }
  const needle = query.trim().toLowerCase();
  if (!needle) return undefined;
  if ((product.barcode ?? "").toLowerCase() === needle) return undefined;
  const unit = unitsForProduct(product).find(
    (u) => (u.barcode ?? "").trim().toLowerCase() === needle,
  );
  return unit?.id;
}

export function productMatchesQuery(product: Product, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if ((product.name ?? "").toLowerCase().includes(q)) return true;
  if ((product.sku ?? "").toLowerCase().includes(q)) return true;
  if ((product.barcode ?? "").toLowerCase().includes(q)) return true;
  return unitsForProduct(product).some((u) => (u.barcode ?? "").toLowerCase().includes(q));
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

/** Stock units consumed by one displayed unit. */
export function stockPerUnit(unit: ProductSellUnit): number {
  return inventoryPerSellUnit(unit);
}

function round6(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

/** Base (stock) qty for a displayed qty. Uses the containment saved on that unit. */
export function toBaseQty(product: Product, unitId: string, qty: number): number {
  const unit = resolveSellUnit(product, unitId);
  if (!unit) return round6(qty);
  return displayToBaseQty(unit, qty);
}

export function displayToBaseQty(unit: ProductSellUnit, displayQty: number): number {
  return round6(displayedToStockQuantity(unit, displayQty));
}

/** Positive balance is an advance. paidNow is money kept, not change handed back. */
export function balanceAfterSale(currentBalance: number, billTotal: number, paidNow: number) {
  return +(currentBalance - billTotal + paidNow).toFixed(2);
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
  const tier = priceMode === "wholesale" ? "wholesale" : "retail";
  const listPrice = unitTierPrice(target, tier);
  const minPrice = unitTierPrice(target, "minimum");
  return {
    productUnitId: target.id,
    qty: +stockToDisplayedQuantity(target, baseQty).toFixed(4),
    listPrice,
    unitPrice: listPrice,
    minPrice,
    sellUnit: target.name || target.symbol || product.unit,
    packSize: stockPerUnit(target),
  };
}
