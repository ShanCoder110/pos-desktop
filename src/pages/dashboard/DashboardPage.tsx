import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronRight,
  Factory,
  PackageMinus,
  Receipt,
  RotateCcw,
  Store,
  Wallet,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyRow,
  HubChart,
  KpiCard,
  PageHead,
  Skeleton,
  Table,
  Td,
  THead,
  Th,
} from "@/components/common";
import {
  DASHBOARD_COPY,
  DASHBOARD_KPI,
  DASHBOARD_RECENT_INVOICES,
  DASHBOARD_TOP_PRODUCTS,
  addDays,
  compareToPrevious,
  isSameCalendarDay,
} from "@/shared/constants/dashboard";
import { routes } from "@/shared/constants/routes";
import type { ExpenseRow, InvoiceRow, PaymentStatus, ReturnRow } from "@/shared/domain/types";
import { money } from "@/utils/format";
import { ensureSession } from "@/services/auth";
import { listAllReturns } from "@/services/credit";
import { listAllExpenses, reportsAnalytics, reportsDashboard } from "@/services/finance";
import { listAllRepairs, type RepairResponse } from "@/services/repairs";
import { listAllInvoices } from "@/services/sales";
import { listAllTransfers } from "@/services/transfers";

function payTone(status: PaymentStatus) {
  if (status === "PAID") return "ok" as const;
  if (status === "PARTIAL") return "warn" as const;
  return "danger" as const;
}

function weekdayLabel(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function sumDay(rows: InvoiceRow[], day: Date, pick: (row: InvoiceRow) => number) {
  return rows
    .filter((row) => row.status === "COMPLETED" && isSameCalendarDay(row.createdAt, day))
    .reduce((sum, row) => sum + pick(row), 0);
}

function countOnDay<T>(rows: T[], day: Date, dateOf: (row: T) => string) {
  return rows.filter((row) => isSameCalendarDay(dateOf(row), day)).length;
}

function deltaClass(direction: "up" | "down" | "flat" | "new", invert?: boolean) {
  if (direction === "flat" || direction === "new") return "is-flat";
  if (invert) return direction === "up" ? "is-down" : "is-up";
  return direction === "up" ? "is-up" : "is-down";
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [todaySales, setTodaySales] = useState(0);
  const [creditOpen, setCreditOpen] = useState(0);
  const [low, setLow] = useState(0);
  const [openRepairs, setOpenRepairs] = useState(0);
  const [pendingTransfers, setPendingTransfers] = useState(0);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [repairs, setRepairs] = useState<RepairResponse[]>([]);
  const [transfers, setTransfers] = useState<{ status: string; createdAt: string }[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [chart, setChart] = useState<{ label: string; value: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ productId: string; productName: string; quantity: number; revenue: number }[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const [dash, analytics, transferRows, invoiceRows, returnRows, expenseRows, repairRows] = await Promise.all([
        reportsDashboard(controller.signal).catch(() => null),
        reportsAnalytics({}, controller.signal).catch(() => null),
        listAllTransfers(controller.signal).catch(() => []),
        listAllInvoices(controller.signal).catch(() => [] as InvoiceRow[]),
        listAllReturns(controller.signal).catch(() => [] as ReturnRow[]),
        listAllExpenses(controller.signal).catch(() => [] as ExpenseRow[]),
        listAllRepairs(controller.signal).catch(() => [] as RepairResponse[]),
      ]);
      if (dash) {
        setTodaySales(dash.todaySalesTotal);
        setCreditOpen(dash.creditOutstanding);
        setLow(dash.lowStockCount);
        setOpenRepairs(dash.openRepairs);
      }
      setTransfers(transferRows);
      setPendingTransfers(transferRows.filter((t) => t.status === "PENDING").length);
      setInvoices(invoiceRows);
      setReturns(returnRows);
      setExpenses(expenseRows);
      setRepairs(repairRows);
      setChart(
        analytics?.salesByDay?.length
          ? analytics.salesByDay.map((day) => ({ label: day.day, value: day.total }))
          : [],
      );
      setTopProducts(analytics?.topProducts ?? []);
      setLoading(false);
    })();
    return () => controller.abort();
  }, []);

  const today = useMemo(() => new Date(), []);
  const yesterday = useMemo(() => addDays(today, -1), [today]);

  const todayInvoices = useMemo(
    () => invoices.filter((row) => row.status === "COMPLETED" && isSameCalendarDay(row.createdAt, today)),
    [invoices, today],
  );
  const salesToday = todaySales || sumDay(invoices, today, (row) => row.total);
  const salesYesterday = sumDay(invoices, yesterday, (row) => row.total);
  const collectedToday = sumDay(invoices, today, (row) => row.paidAmount);
  const collectedYesterday = sumDay(invoices, yesterday, (row) => row.paidAmount);
  const creditToday = sumDay(invoices, today, (row) => row.creditAmount);
  const creditYesterday = sumDay(invoices, yesterday, (row) => row.creditAmount);
  const expenseToday = expenses
    .filter((row) => isSameCalendarDay(row.expenseDate, today))
    .reduce((sum, row) => sum + row.amount, 0);
  const repairsToday = countOnDay(repairs, today, (row) => row.receivedAt || row.createdAt);
  const repairsYesterday = countOnDay(repairs, yesterday, (row) => row.receivedAt || row.createdAt);
  const transfersToday = countOnDay(
    transfers.filter((row) => row.status === "PENDING"),
    today,
    (row) => row.createdAt,
  );
  const transfersYesterday = countOnDay(
    transfers.filter((row) => row.status === "PENDING"),
    yesterday,
    (row) => row.createdAt,
  );
  const returnsToday = countOnDay(returns, today, (row) => row.createdAt);
  const returnsYesterday = countOnDay(returns, yesterday, (row) => row.createdAt);
  const recentBills = invoices.slice(0, DASHBOARD_RECENT_INVOICES);
  const weekTotal = chart.reduce((sum, point) => sum + point.value, 0);

  const salesDelta = compareToPrevious(salesToday, salesYesterday);
  const collectedDelta = compareToPrevious(collectedToday, collectedYesterday);
  const creditDelta = compareToPrevious(creditToday, creditYesterday);

  const actions = [
    {
      label: "Low stock",
      value: low,
      hint: "Reorder SKUs",
      icon: PackageMinus,
      to: routes.productsLow,
      severity: (low ? "danger" : "ok") as "ok" | "warn" | "danger",
      delta: null,
    },
    {
      label: "Open repairs",
      value: openRepairs,
      hint: "Jobs still open",
      icon: Factory,
      to: routes.repair,
      severity: (openRepairs ? "warn" : "ok") as "ok" | "warn" | "danger",
      delta: compareToPrevious(repairsToday, repairsYesterday),
    },
    {
      label: "Pending transfers",
      value: pendingTransfers,
      hint: "Waiting receive",
      icon: ArrowLeftRight,
      to: routes.transfers,
      severity: (pendingTransfers ? "warn" : "ok") as "ok" | "warn" | "danger",
      delta: compareToPrevious(transfersToday, transfersYesterday),
    },
    {
      label: "Returns",
      value: returns.length,
      hint: "Tickets on file",
      icon: RotateCcw,
      to: routes.salesReturns,
      severity: (returns.length ? "warn" : "ok") as "ok" | "warn" | "danger",
      delta: compareToPrevious(returnsToday, returnsYesterday),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <PageHead title={DASHBOARD_COPY.title}>
        <p className="mr-auto text-[12px] font-medium text-muted">{weekdayLabel()}</p>
        <Button onClick={() => navigate(routes.reports)}>{DASHBOARD_COPY.reports}</Button>
        <Button variant="primary" icon={<Store size={14} />} onClick={() => navigate(routes.pos)}>
          {DASHBOARD_COPY.openPos}
        </Button>
      </PageHead>

      <div className="grid shrink-0 grid-cols-4 gap-2.5">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-[10px]" />
          ))
        ) : (
          <>
            <KpiCard
              label={DASHBOARD_KPI.sales.label}
              value={money(salesToday)}
              hint={DASHBOARD_KPI.sales.hint}
              tone="ok"
              icon={<Receipt size={16} />}
              delta={salesDelta}
              onClick={() => navigate(DASHBOARD_KPI.sales.to)}
            />
            <KpiCard
              label={DASHBOARD_KPI.collected.label}
              value={money(collectedToday)}
              hint={DASHBOARD_KPI.collected.hint}
              tone="ok"
              icon={<Wallet size={16} />}
              delta={collectedDelta}
              onClick={() => navigate(DASHBOARD_KPI.collected.to)}
            />
            <KpiCard
              label={DASHBOARD_KPI.credit.label}
              value={money(creditOpen)}
              hint={DASHBOARD_KPI.credit.hint}
              tone={creditOpen > 0 ? "warn" : "ok"}
              icon={<Wallet size={16} />}
              delta={creditDelta}
              invertDelta
              onClick={() => navigate(DASHBOARD_KPI.credit.to)}
            />
            <KpiCard
              label={DASHBOARD_KPI.low.label}
              value={low}
              hint={DASHBOARD_KPI.low.hint}
              tone={low ? "danger" : "ok"}
              icon={<PackageMinus size={16} />}
              onClick={() => navigate(DASHBOARD_KPI.low.to)}
            />
          </>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-4 gap-2.5">
        {[
          { label: "Bills today", value: String(todayInvoices.length), hint: "Completed" },
          { label: "This period", value: money(weekTotal), hint: "Sales by day" },
          { label: "Expenses today", value: money(expenseToday), hint: "Money out" },
          { label: "Open jobs", value: String(openRepairs), hint: "Repairs" },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center justify-between rounded-[10px] border border-line bg-paper px-3.5 py-2.5">
            <div>
              <p className="text-[11px] font-semibold text-muted">{stat.label}</p>
              <p className="mt-0.5 text-[13px] font-bold tabular-nums text-ink">{loading ? "—" : stat.value}</p>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid min-h-[280px] shrink-0 grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)] gap-2.5">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-line bg-paper">
          {loading ? (
            <div className="grid flex-1 place-items-center p-6">
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          ) : chart.length ? (
            <HubChart
              type="line"
              title={DASHBOARD_COPY.salesTrend}
              subtitle={DASHBOARD_COPY.salesTrendHint}
              data={chart}
              formatValue={money}
              maxItems={null}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-[12px] text-muted">{DASHBOARD_COPY.emptySales}</div>
          )}
        </section>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-line bg-paper">
          <div className="flex shrink-0 items-center justify-between gap-3 px-3.5 py-3">
            <h2 className="text-[13px] font-bold text-ink">{DASHBOARD_COPY.needsAction}</h2>
            <AlertTriangle size={14} className="text-gold" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-2">
            {actions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2.5 text-left text-ink hover:bg-bg"
                  onClick={() => navigate(item.to)}
                >
                  <span className={`attn-ico grid size-[30px] shrink-0 place-items-center rounded-lg is-${item.severity}`}>
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{item.label}</span>
                    <span className="mt-px block text-[11px] text-muted">{item.hint}</span>
                    {item.delta ? (
                      <span className={`attn-delta mt-0.5 block text-[10px] font-bold ${deltaClass(item.delta.direction, true)}`}>
                        {item.delta.text}
                      </span>
                    ) : null}
                  </span>
                  <Badge tone={item.value === 0 ? "ok" : item.severity === "danger" ? "danger" : "warn"}>{item.value}</Badge>
                  <ChevronRight size={14} className="text-muted" />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.35fr)_minmax(260px,0.85fr)] gap-2.5 pb-1">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-line bg-paper">
          <div className="flex shrink-0 items-center justify-between px-3.5 py-3">
            <h2 className="text-[13px] font-bold text-ink">{DASHBOARD_COPY.recentBills}</h2>
            <Button size="sm" onClick={() => navigate(routes.sales)}>
              View all
            </Button>
          </div>
          <Table>
            <THead>
              <tr>
                <Th>Invoice</Th>
                <Th>Status</Th>
                <Th>Total</Th>
                <Th>Paid</Th>
              </tr>
            </THead>
            <tbody>
              {loading ? (
                <EmptyRow cols={4} text="Loading…" />
              ) : recentBills.length === 0 ? (
                <EmptyRow cols={4} text={DASHBOARD_COPY.emptyBills} />
              ) : (
                recentBills.map((row) => (
                  <tr key={row.id} className="cursor-pointer" onClick={() => navigate(routes.sales)}>
                    <Td>
                      {row.invoiceNumber}
                      <span className="sub">{new Date(row.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </Td>
                    <Td>
                      <Badge tone={payTone(row.paymentStatus)}>{row.paymentStatus}</Badge>
                    </Td>
                    <Td numeric>{money(row.total)}</Td>
                    <Td numeric>{money(row.paidAmount)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-line bg-paper">
          {loading ? (
            <div className="p-4">
              <Skeleton className="h-48 rounded-lg" />
            </div>
          ) : topProducts.length ? (
            <HubChart
              type="bar"
              title={DASHBOARD_COPY.topProducts}
              subtitle="By revenue"
              data={topProducts.slice(0, DASHBOARD_TOP_PRODUCTS).map((row) => ({
                id: row.productId,
                label: row.productName,
                value: row.revenue,
                details: [
                  { label: "Revenue", value: money(row.revenue) },
                  { label: "Qty", value: String(row.quantity) },
                ],
              }))}
              formatValue={money}
              maxItems={DASHBOARD_TOP_PRODUCTS}
              onPointClick={() => navigate(routes.salesProducts)}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-[12px] text-muted">{DASHBOARD_COPY.emptyProducts}</div>
          )}
        </section>
      </div>
    </div>
  );
}
