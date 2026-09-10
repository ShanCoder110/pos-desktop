import type { DateRangeFilter } from "@/components/common/DateRangePeriodPicker";
import type { DashboardDelta } from "@/shared/constants/dashboard";

export const REPORT_COPY = {
  title: "Reports",
  hint: "Filter any period, then export a PDF of billed sales, collections, expenses, and stock.",
  exportPdf: "Export PDF",
  empty: "Nothing in this date range.",
  vsPrior: "vs prior period",
  samePrior: "Same as prior period",
  newPrior: "New vs prior period",
} as const;

export function rangeLabel(range: DateRangeFilter) {
  if (range.period === "custom" && range.from) return `${range.from} – ${range.to || range.from}`;
  if (range.period === "today") return "Today";
  if (range.period === "7d") return "Last 7 days";
  if (range.period === "30d") return "Last 30 days";
  return "All time";
}

export function priorRange(range: DateRangeFilter): DateRangeFilter | null {
  if (range.period === "all" || !range.from || !range.to) return null;
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const priorTo = new Date(from);
  priorTo.setDate(priorTo.getDate() - 1);
  const priorFrom = new Date(priorTo);
  priorFrom.setDate(priorFrom.getDate() - (days - 1));
  const iso = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  return { period: "custom", from: iso(priorFrom), to: iso(priorTo) };
}

export function comparePeriods(current: number, previous: number): DashboardDelta {
  if (previous === 0 && current === 0) {
    return { text: REPORT_COPY.samePrior, direction: "flat" };
  }
  if (previous === 0) {
    return { text: REPORT_COPY.newPrior, direction: "new" };
  }
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (percent === 0) {
    return { text: `0% ${REPORT_COPY.vsPrior}`, direction: "flat" };
  }
  const sign = percent > 0 ? "+" : "";
  return {
    text: `${sign}${percent}% ${REPORT_COPY.vsPrior}`,
    direction: percent > 0 ? "up" : "down",
  };
}
