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

/** Shared with backend `MAX_STOCK_COUNT_BASE_UNITS` — counted qty after unit→base. */
export const MAX_STOCK_COUNT_BASE_UNITS = 1_000_000;

/** Whether a typed counted display value is usable (finite, non-negative). */
export function stockCountCountedValid(raw: string, allowsFractions: boolean): boolean {
  const trimmed = raw.trim();
  if (trimmed === "") return false;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return false;
  if (!allowsFractions && !Number.isInteger(n)) return false;
  return true;
}

/** Inline / toast reason when counted qty is invalid or over the base-unit cap. */
export function stockCountCountedError(
  raw: string,
  countedBase: number,
  allowsFractions: boolean,
): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return "Enter a valid counted quantity";
  if (n < 0) return "Counted quantity cannot be negative";
  if (!allowsFractions && !Number.isInteger(n)) return "This unit only allows whole numbers";
  if (countedBase > MAX_STOCK_COUNT_BASE_UNITS) {
    return "Counted quantity cannot exceed 1,000,000 base units";
  }
  return null;
}
