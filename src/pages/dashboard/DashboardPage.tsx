import { useEffect, useState } from "react";
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
  EmptyState,
  HubChart,
  KpiCard,
  PageHead,
  Skeleton,
  Table,
  TableRowsSkeleton,
  Td,
  THead,
  Th,
} from "@/components/common";
import {
  DASHBOARD_COPY,
  DASHBOARD_KPI,
  DASHBOARD_TOP_PRODUCTS,
  compareToPrevious,
} from "@/shared/constants/dashboard";
import { productsHref } from "@/shared/constants/products";
import { routes } from "@/shared/constants/routes";
import { formatTableDateTime, money } from "@/utils/format";
import { paymentStatusTone } from "@/utils/paymentStatus";
import { reportsAnalytics, reportsDashboard, type DashboardReport } from "@/services/finance";
import { createLoadGuard } from "@/utils/async";

function weekdayLabel(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function deltaClass(direction: "up" | "down" | "flat" | "new", invert?: boolean) {
  if (direction === "flat" || direction === "new") return "is-flat";
  if (invert) return direction === "up" ? "is-down" : "is-up";
  return direction === "up" ? "is-up" : "is-down";
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState({ page: true });
  const [summary, setSummary] = useState<DashboardReport | null>(null);
  const [chart, setChart] = useState<{ label: string; value: number }[]>([]);
  const [topProducts, setTopProducts] = useState<
    { productId: string; productName: string; quantity: number; revenue: number }[]
  >([]);

  useEffect(() => {
    const controller = new AbortController();
    const guard = createLoadGuard();
    void (async () => {
      try {
        const [dash, analytics] = await Promise.all([
          reportsDashboard(controller.signal).catch(() => null),
          reportsAnalytics({}, controller.signal).catch(() => null),
        ]);
        if (!guard.isActive()) return;
        setSummary(dash);
        setChart(
          analytics?.salesByDay?.length
            ? analytics.salesByDay.map((day) => ({ label: day.day, value: day.total }))
            : [],
        );
        setTopProducts(analytics?.topProducts ?? []);
      } finally {
        if (guard.isActive()) {
          setLoading((current) => ({ ...current, page: false }));
        }
      }
    })();
    return () => {
      guard.dispose();
      controller.abort();
    };
  }, []);

  const todaySales = summary?.todaySalesTotal ?? 0;
  const creditOpen = summary?.creditOutstanding ?? 0;
  const low = summary?.lowStockCount ?? 0;
  const openRepairs = summary?.openRepairs ?? 0;
  const pendingTransfers = summary?.pendingTransfers ?? 0;
  const invoiceTotalToday = summary?.invoiceTotalToday ?? 0;
  const todayBillCount = summary?.billsToday ?? 0;
  const salesToday = todaySales || invoiceTotalToday;
  const salesYesterday = summary?.salesYesterday ?? 0;
  const collectedToday = summary?.collectedToday ?? 0;
  const collectedYesterday = summary?.collectedYesterday ?? 0;
  const creditToday = summary?.creditToday ?? 0;
  const creditYesterday = summary?.creditYesterday ?? 0;
  const expenseToday = summary?.expensesToday ?? 0;
  const repairsToday = summary?.repairsToday ?? 0;
  const repairsYesterday = summary?.repairsYesterday ?? 0;
  const transfersToday = summary?.transfersToday ?? 0;
  const transfersYesterday = summary?.transfersYesterday ?? 0;
  const returnsToday = summary?.returnsToday ?? 0;
  const returnsYesterday = summary?.returnsYesterday ?? 0;
  const returnsTotal = summary?.returnsTotal ?? 0;
  const recentBills = summary?.recentBills ?? [];
  const salesMismatch = todaySales > 0 && Math.abs(todaySales - invoiceTotalToday) > 0.02;
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
      to: productsHref("low"),
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
      to: productsHref("transfers"),
      severity: (pendingTransfers ? "warn" : "ok") as "ok" | "warn" | "danger",
      delta: compareToPrevious(transfersToday, transfersYesterday),
    },
    {
      label: "Returns",
      value: returnsTotal,
      hint: "Tickets on file",
      icon: RotateCcw,
      to: routes.salesReturns,
      severity: (returnsTotal ? "warn" : "ok") as "ok" | "warn" | "danger",
      delta: compareToPrevious(returnsToday, returnsYesterday),
    },
  ];

  return (
    <div className="dashboard-page flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <PageHead title={DASHBOARD_COPY.title}>
        <p className="mr-auto text-[12px] font-medium text-muted">{weekdayLabel()}</p>
        <Button onClick={() => navigate(routes.reports)}>{DASHBOARD_COPY.reports}</Button>
        <Button variant="primary" icon={<Store size={14} />} onClick={() => navigate(routes.pos)}>
          {DASHBOARD_COPY.openPos}
        </Button>
      </PageHead>

      {!loading.page && salesMismatch ? (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-ink">
          Reconciliation: API today sales {money(todaySales)} vs invoices loaded{" "}
          {money(invoiceTotalToday)} ({todayBillCount} bill
          {todayBillCount === 1 ? "" : "s"}). Check branch filter or completed_at dates.
        </p>
      ) : null}

      <div className="ui-kpi-row grid shrink-0 grid-cols-4 gap-2.5">
        {loading.page ? (
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-[10px]" />
          ))
        ) : (
          <>
            <KpiCard
              label={DASHBOARD_KPI.sales.label}
              value={money(salesToday)}
              hint={DASHBOARD_KPI.sales.hint}
              tone="info"
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
              tone="warn"
              icon={<Wallet size={16} />}
              delta={creditDelta}
              invertDelta
              onClick={() => navigate(DASHBOARD_KPI.credit.to)}
            />
            <KpiCard
              label={DASHBOARD_KPI.low.label}
              value={low}
              hint={DASHBOARD_KPI.low.hint}
              tone="danger"
              icon={<PackageMinus size={16} />}
              onClick={() => navigate(DASHBOARD_KPI.low.to)}
            />
          </>
        )}
      </div>

      <div className="dashboard-mini-grid grid shrink-0 grid-cols-4 gap-2.5">
        {[
          {
            label: "Bills today",
            value: String(todayBillCount),
            hint: "Completed",
            tone: "blue",
          },
          { label: "This period", value: money(weekTotal), hint: "Sales by day", tone: "violet" },
          {
            label: "Expenses today",
            value: money(expenseToday),
            hint: "Money out",
            tone: "orange",
          },
          { label: "Open jobs", value: String(openRepairs), hint: "Repairs", tone: "rose" },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`dashboard-mini is-${stat.tone} flex items-center justify-between rounded-[10px] border border-line bg-paper px-3.5 py-2.5`}
          >
            <div>
              <p className="text-[11px] font-semibold text-muted">{stat.label}</p>
              <p className="mt-0.5 text-[13px] font-bold tabular-nums text-ink">
                {loading.page ? "—" : stat.value}
              </p>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {stat.hint}
            </p>
          </div>
        ))}
      </div>

      <div className="grid min-h-[280px] shrink-0 grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)] gap-2.5">
        <section className="dashboard-panel is-chart flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-line bg-paper">
          {loading.page ? (
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
            <EmptyState title={DASHBOARD_COPY.emptySales} />
          )}
        </section>

        <section className="dashboard-panel is-action flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-line bg-paper">
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
                  <span
                    className={`attn-ico grid size-[30px] shrink-0 place-items-center rounded-lg is-${item.severity}`}
                  >
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{item.label}</span>
                    <span className="mt-px block text-[11px] text-muted">{item.hint}</span>
                    {item.delta ? (
                      <span
                        className={`attn-delta mt-0.5 block text-[10px] font-bold ${deltaClass(item.delta.direction, true)}`}
                      >
                        {item.delta.text}
                      </span>
                    ) : null}
                  </span>
                  <Badge
                    tone={item.value === 0 ? "ok" : item.severity === "danger" ? "danger" : "warn"}
                  >
                    {item.value}
                  </Badge>
                  <ChevronRight size={14} className="text-muted" />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.35fr)_minmax(260px,0.85fr)] gap-2.5 pb-1">
        <section className="dashboard-panel is-bills flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-line bg-paper">
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
              {loading.page ? (
                <TableRowsSkeleton columnCount={4} rows={5} />
              ) : recentBills.length === 0 ? (
                <EmptyRow cols={4} text={DASHBOARD_COPY.emptyBills} />
              ) : (
                recentBills.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => navigate(routes.sales)}
                  >
                    <Td>
                      {row.invoiceNumber}
                      <span className="sub">{formatTableDateTime(row.createdAt)}</span>
                    </Td>
                    <Td>
                      <Badge tone={paymentStatusTone(row.paymentStatus)}>{row.paymentStatus}</Badge>
                    </Td>
                    <Td numeric>{money(row.total)}</Td>
                    <Td numeric>{money(row.paidAmount)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </section>

        <section className="dashboard-panel is-products flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-line bg-paper">
          {loading.page ? (
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
            <EmptyState title={DASHBOARD_COPY.emptyProducts} />
          )}
        </section>
      </div>
    </div>
  );
}
