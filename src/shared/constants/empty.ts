export const EMPTY_COPY = {
  title: "Nothing here yet",
  noData: "No data found",
  filter: "No data matches the current filters.",
} as const;

export function listEmptyMessage(hasFilters: boolean) {
  return hasFilters ? EMPTY_COPY.filter : EMPTY_COPY.noData;
}
