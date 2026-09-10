import { routes } from "@/shared/constants/routes";

export const DASHBOARD_RECENT_INVOICES = 8;
export const DASHBOARD_TOP_PRODUCTS = 6;

export const DASHBOARD_COPY = {
  title: "Today",
  openPos: "Open POS",
  reports: "Reports",
  salesTrend: "Sales trend",
  salesTrendHint: "Completed invoices by day",
  needsAction: "Needs attention",
  recentBills: "Recent bills",
  topProducts: "Top products",
  emptySales: "No sales recorded yet.",
  emptyBills: "No invoices yet.",
  emptyProducts: "No product sales yet.",
  vsYesterday: "vs yesterday",
  sameYesterday: "Same as yesterday",
  newYesterday: "New vs yesterday",
} as const;

export const DASHBOARD_KPI = {
  sales: { label: "Today’s sales", hint: "Completed bills", to: routes.sales },
  collected: { label: "Collected today", hint: "Cash and bank in", to: routes.transactions },
  credit: { label: "Customer owes", hint: "Open khata", to: routes.credit },
  low: { label: "Low stock", hint: "Below minimum", to: routes.productsLow },
} as const;

export type DashboardDelta = {
  text: string;
  direction: "up" | "down" | "flat" | "new";
};

export function isSameCalendarDay(iso: string, day = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function compareToPrevious(current: number, previous: number): DashboardDelta {
  if (previous === 0 && current === 0) {
    return { text: DASHBOARD_COPY.sameYesterday, direction: "flat" };
  }
  if (previous === 0) {
    return { text: DASHBOARD_COPY.newYesterday, direction: "new" };
  }
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (percent === 0) {
    return { text: `0% ${DASHBOARD_COPY.vsYesterday}`, direction: "flat" };
  }
  const sign = percent > 0 ? "+" : "";
  return {
    text: `${sign}${percent}% ${DASHBOARD_COPY.vsYesterday}`,
    direction: percent > 0 ? "up" : "down",
  };
}
