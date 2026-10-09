import type { Product, ProductSellUnit } from "@/shared/types";

export function productSellUnits(product: Product): ProductSellUnit[] {
  const units = product.sellUnits ?? [];
  if (units.length) {
    return [...units].sort((a, b) => (b.contains || 1) - (a.contains || 1));
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
  return (
    units.find((unit) => unit.id === product.baseUnitId) ??
    units.find((unit) => unit.kind === "base" || unit.contains === 1 || unit.isBase) ??
    units[0]
  );
}

export function defaultSellPrice(product: Product, unitId?: string) {
  const unit = resolveProductSellUnit(product, unitId);
  return unit?.price ?? product.retail ?? 0;
}

export function unitStockHint(product: Product, unit?: ProductSellUnit) {
  const stock = product.stock ?? product.totalStock ?? 0;
  if (!unit || !unit.contains || unit.contains === 1) {
    return `${stock} ${product.unit || "units"} in stock`;
  }
  const inUnit = stock / unit.contains;
  return `${stock} base · ~${Number.isFinite(inUnit) ? inUnit.toFixed(2) : "0"} ${unit.name || "units"}`;
}
