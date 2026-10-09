export type FilterChip = { field: string; label: string; value: string; values?: string[] };

export function chipValues(chip?: FilterChip): string[] {
  if (!chip) return [];
  if (chip.values?.length) return chip.values;
  const trimmed = chip.value.trim();
  return trimmed ? [trimmed] : [];
}

export function chipValuesForField(chips: FilterChip[], field: string): string[] {
  return chipValues(chips.find((chip) => chip.field === field));
}

export function formatChipDisplay(values: string[]): string {
  if (!values.length) return "";
  if (values.length <= 2) return values.join(", ");
  return `${values.slice(0, 2).join(", ")} +${values.length - 2}`;
}

export function makeFilterChip(field: string, label: string, values: string[]): FilterChip {
  const clean = values.map((value) => value.trim()).filter(Boolean);
  return { field, label, values: clean, value: formatChipDisplay(clean) };
}

export function matchesChipValue(rowValue: string, chips: FilterChip[], field: string): boolean {
  const selected = chipValuesForField(chips, field);
  if (!selected.length) return true;
  return selected.includes(rowValue);
}

export function matchesChipSome(
  chips: FilterChip[],
  field: string,
  matches: (value: string) => boolean,
): boolean {
  const selected = chipValuesForField(chips, field);
  if (!selected.length) return true;
  return selected.some(matches);
}

export function hasMultiChipValues(chips: FilterChip[], fields: string[]): boolean {
  return fields.some((field) => chipValuesForField(chips, field).length > 1);
}

export function applyFilterChip(chips: FilterChip[], chip: FilterChip): FilterChip[] {
  const values = chipValues(chip);
  if (!values.length) return chips.filter((item) => item.field !== chip.field);
  return [...chips.filter((item) => item.field !== chip.field), chip];
}
