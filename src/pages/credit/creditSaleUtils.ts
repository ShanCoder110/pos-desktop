import type { Product, ProductSellUnit } from "@/shared/types";
import { creditTierPrice } from "@/utils/salePricing";
import {
  defaultTransactionUnit,
  sortUnitsLargestFirst,
  stockQuantityPerUnit,
  stockToDisplayedQuantity,
} from "@/utils/unitConversion";

export function productSellUnits(product: Product): ProductSellUnit[] {
  const units = product.sellUnits ?? [];
  if (units.length) {
    return sortUnitsLargestFirst(units);
  }
  return [
    {
      id: product.baseUnitId || product.id,
      name: product.unit || "Unit",
      contains: 1,
      cost: product.cost,
      min: product.min,
      wholesale: product.wholesale,
      price: product.retail,
      barcode: product.barcode ?? "",
      isBase: true,
    },
  ];
}

export function resolveProductSellUnit(product: Product, unitId?: string) {
  const units = productSellUnits(product);
  if (unitId) {
    const matched = units.find((unit) => unit.id === unitId);
    if (matched) return matched;
  }
  return defaultTransactionUnit(product, units);
}

export function defaultSellPrice(product: Product, unitId?: string) {
  const unit = resolveProductSellUnit(product, unitId);
  return creditTierPrice(unit, "retail") || product.retail || 0;
}

export function unitStockHint(product: Product, unit?: ProductSellUnit) {
  const stock = product.stock ?? product.totalStock ?? 0;
  if (!unit || stockQuantityPerUnit(unit) === 1) {
    return `${stock} ${product.unit || "units"} in stock`;
  }
  const inUnit = stockToDisplayedQuantity(unit, stock);
  return `${stock} base · ~${Number.isFinite(inUnit) ? inUnit.toFixed(2) : "0"} ${unit.name || "units"}`;
}
