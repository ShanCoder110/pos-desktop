import type { Product, ProductSellUnit } from "@/shared/types";

const QTY_SCALE = 1_000_000;

export function roundUnitQuantity(value: number) {
  return Math.round(value * QTY_SCALE) / QTY_SCALE;
}

/** Inventory quantity represented by one displayed unit. */
export function stockQuantityPerUnit(
  unit: Pick<ProductSellUnit, "contains" | "factorDirection"> &
    Partial<Pick<ProductSellUnit, "symbol">>,
) {
  const factor = Number(unit.contains);
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  if (unit.factorDirection === "divide") return 1 / safeFactor;
  if (!unit.factorDirection) {
    const symbol = unit.symbol?.trim().toLowerCase();
    if (safeFactor > 1 && symbol && ["m", "gaz", "ft", "g"].includes(symbol)) {
      return 1 / safeFactor;
    }
  }
  return safeFactor;
}

export function displayedToStockQuantity(
  unit: Pick<ProductSellUnit, "contains" | "factorDirection">,
  displayedQuantity: number,
) {
  return roundUnitQuantity(displayedQuantity * stockQuantityPerUnit(unit));
}

export function stockToDisplayedQuantity(
  unit: Pick<ProductSellUnit, "contains" | "factorDirection">,
  stockQuantity: number,
) {
  const factor = stockQuantityPerUnit(unit);
  return roundUnitQuantity(factor ? stockQuantity / factor : stockQuantity);
}

/**
 * Select the unit users should see first. The transaction default is independent
 * from the permanent inventory unit.
 */
export function defaultTransactionUnit(
  product: Pick<Product, "unit" | "sellUnits">,
  units: ProductSellUnit[],
  requestedUnitId?: string,
) {
  return (
    units.find((unit) => unit.id === requestedUnitId) ??
    units.find((unit) => unit.isDefault) ??
    units.find((unit) => unit.symbol === product.unit && unit.isBase) ??
    units.find((unit) => unit.isBase || unit.kind === "base") ??
    units.find((unit) => stockQuantityPerUnit(unit) === 1) ??
    units[0]
  );
}

export function sortUnitsLargestFirst(units: ProductSellUnit[]) {
  return [...units].sort((left, right) => stockQuantityPerUnit(right) - stockQuantityPerUnit(left));
}

/** Preserve the same inventory quantity while switching its displayed unit. */
export function convertDisplayedUnit(
  from: ProductSellUnit,
  to: ProductSellUnit,
  displayedQuantity: number,
) {
  return stockToDisplayedQuantity(to, displayedToStockQuantity(from, displayedQuantity));
}
