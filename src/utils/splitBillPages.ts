export type SplitBillPageKind = "single" | "first" | "middle" | "last";

export type SplitBillPage<T> = {
  items: T[];
  kind: SplitBillPageKind;
  pageIndex: number;
  pageCount: number;
};

export type SplitBillLimits = {
  first: number;
  middle: number;
  last: number;
};

export const DEFAULT_SPLIT_LIMITS: SplitBillLimits = {
  first: 12,
  middle: 15,
  last: 12,
};

function clampLimit(n: number, fallback: number) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function normalizeSplitLimits(partial?: Partial<SplitBillLimits> | null): SplitBillLimits {
  return {
    first: clampLimit(partial?.first ?? DEFAULT_SPLIT_LIMITS.first, DEFAULT_SPLIT_LIMITS.first),
    middle: clampLimit(partial?.middle ?? DEFAULT_SPLIT_LIMITS.middle, DEFAULT_SPLIT_LIMITS.middle),
    last: clampLimit(partial?.last ?? DEFAULT_SPLIT_LIMITS.last, DEFAULT_SPLIT_LIMITS.last),
  };
}

/**
 * Item counts per cut slip when split-bill is on.
 * First / middle / last sizes come from settings (dukan defaults 12 / 15 / 12).
 */
export function splitBillItemCounts(
  itemCount: number,
  limits: Partial<SplitBillLimits> = DEFAULT_SPLIT_LIMITS,
): number[] {
  const { first, middle, last } = normalizeSplitLimits(limits);
  const n = Math.max(0, Math.floor(itemCount));
  if (n <= first) return [n];

  const counts: number[] = [first];
  let remaining = n - first;

  while (remaining > last) {
    if (remaining <= middle) {
      counts.push(remaining - last);
      remaining = last;
      break;
    }
    const afterMiddle = remaining - middle;
    if (afterMiddle === 0) {
      counts.push(remaining - last);
      remaining = last;
      break;
    }
    counts.push(middle);
    remaining = afterMiddle;
  }

  if (remaining > 0) counts.push(remaining);
  return counts;
}

export function splitBillPages<T>(
  items: readonly T[],
  limits: Partial<SplitBillLimits> = DEFAULT_SPLIT_LIMITS,
): SplitBillPage<T>[] {
  const counts = splitBillItemCounts(items.length, limits);
  const pageCount = Math.max(1, counts.length);
  let offset = 0;
  return counts.map((count, index) => {
    const slice = items.slice(offset, offset + count) as T[];
    offset += count;
    const kind: SplitBillPageKind =
      pageCount === 1
        ? "single"
        : index === 0
          ? "first"
          : index === pageCount - 1
            ? "last"
            : "middle";
    return {
      items: slice,
      kind,
      pageIndex: index + 1,
      pageCount,
    };
  });
}

export function shouldSplitThermalBill(
  enabled: boolean | undefined,
  paperWidth?: string | null,
): boolean {
  if (!enabled) return false;
  const width = (paperWidth ?? "").toUpperCase();
  return width !== "A4";
}
