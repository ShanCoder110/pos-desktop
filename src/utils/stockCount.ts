import { isLinearStockUnit } from "@/pages/products/productQty";

/** Convert a counted display qty in a sell unit to base/stock units. */
export function displayedToBaseQty(
  displayed: number,
  contains: number,
  factorDirection: "multiply" | "divide" = "multiply",
): number {
  if (!Number.isFinite(displayed) || displayed === 0) return 0;
  const factor = contains > 0 ? contains : 1;
  const raw = factorDirection === "divide" ? displayed / factor : displayed * factor;
  return Math.round(raw * 1_000_000) / 1_000_000;
}

/** Counted base minus system base (negative = short). */
export function stockCountDifference(currentBase: number, countedBase: number): number {
  return Math.round((countedBase - currentBase) * 1_000_000) / 1_000_000;
}

/** Live preview for the stock-count form. */
export function stockCountPreview(input: {
  currentBase: number;
  countedDisplay: number;
  contains: number;
  factorDirection?: "multiply" | "divide";
}): { countedBase: number; difference: number } {
  const countedBase = displayedToBaseQty(
    input.countedDisplay,
    input.contains,
    input.factorDirection ?? "multiply",
  );
  return {
    countedBase,
    difference: stockCountDifference(input.currentBase, countedBase),
  };
}

/** Whole units only unless the unit is sold by length (or product is linear). */
export function stockCountAllowsFractions(symbol?: string, productIsLinear?: boolean): boolean {
  return Boolean(productIsLinear) || isLinearStockUnit(symbol);
}

export const STOCK_COUNT_REASON_MAX = 200;
