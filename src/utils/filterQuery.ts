import { chipValuesForField, type FilterChip } from "@/utils/filterChips";

/** Join multi-select chip values for comma-separated API query params. */
export function chipCsv(chips: FilterChip[], field: string): string | undefined {
  const values = chipValuesForField(chips, field);
  return values.length ? values.join(",") : undefined;
}

export function chipCsvFromNames(
  names: string[],
  lookup: (name: string) => string | undefined,
): string | undefined {
  const ids = names.map(lookup).filter((id): id is string => Boolean(id));
  return ids.length ? ids.join(",") : undefined;
}

export function chipMinNumber(chips: FilterChip[], field: string): number | undefined {
  const values = chipValuesForField(chips, field);
  if (!values.length) return undefined;
  const nums = values
    .map((value) => Number(String(value).replace(/[^\d.-]/g, "")))
    .filter((value) => Number.isFinite(value));
  return nums.length ? Math.min(...nums) : undefined;
}

export function chipStatusCsv(
  chips: FilterChip[],
  field: string,
  toApi: (label: string) => string | undefined,
): string | undefined {
  const labels = chipValuesForField(chips, field);
  const values = labels.map(toApi).filter((value): value is string => Boolean(value));
  return values.length ? values.join(",") : undefined;
}
