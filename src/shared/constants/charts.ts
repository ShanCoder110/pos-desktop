export const DATE_PERIOD_PRESETS = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "custom", label: "Custom range" },
] as const;

/** Default date filter when opening supplier, customer, and staff ledger tabs. */
export const DEFAULT_LEDGER_DATE_PERIOD = "30d" as const;

export const CHART_COLORS = [
  "#9d4b82",
  "#e08a3e",
  "#7c5bbf",
  "#d95d67",
  "#3f9b8d",
  "#c09a32",
  "#b45f4b",
  "#746778",
] as const;
