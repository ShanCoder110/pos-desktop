import { productsHref } from "@/shared/constants/products";
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
  credit: { label: "Credit sales", hint: "Open customer balance", to: routes.credit },
  low: { label: "Low stock", hint: "Below minimum", to: productsHref("low") },
} as const;

export type DashboardDelta = {
  text: string;
  direction: "up" | "down" | "flat" | "new";
};

const BUSINESS_ZONE = "Asia/Karachi";

export function businessDayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isSameCalendarDay(iso: string, day = new Date()) {
  const left = businessDayKey(iso);
  return left !== "" && left === businessDayKey(day);
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
