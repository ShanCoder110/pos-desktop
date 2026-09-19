import { useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import {
  Badge,
  Button,
  DateRangePeriodPicker,
  EmptyRow,
  HubChart,
  HubChartGrid,
  KpiCard,
  PageHead,
  Skeleton,
  Table,
  TabSheet,
  Tabs,
  Td,
  THead,
  Th,
  dateInRange,
  rangeForPeriod,
  type DateRangeFilter,
} from "@/components/common";
import {
  REPORT_COPY,
  REPORT_TABS,
  comparePeriods,
  priorRange,
  rangeLabel,
} from "@/shared/constants/reports";
import { useQueryTab } from "@/hooks/useQueryTab";
import type { DomainCustomer, ExpenseRow, InvoiceRow, PaymentStatus } from "@/shared/domain/types";
import { useSettings } from "@/shared/settings";
import { money } from "@/utils/format";
import { exportReportPdf } from "@/utils/exportFile";
import { ensureSession } from "@/services/auth";
import { listCustomersWithBalances } from "@/services/credit";
import { listAllExpenses, listExpenseCategories, reportsAnalytics } from "@/services/finance";
import { listAllInvoices } from "@/services/sales";
import { listAllStockMovementDetails, type StockMovementResponse } from "@/services/stock";

function payTone(status: PaymentStatus) {
  if (status === "PAID") return "ok" as const;
  if (status === "PARTIAL") return "warn" as const;
  return "danger" as const;
}

function inRange(iso: string, range: DateRangeFilter) {
  return dateInRange(iso, range);
}

function totalsOf(invoices: InvoiceRow[]) {
  return invoices.reduce(
    (sum, row) => {
      sum.billed += row.total;
      sum.paid += row.paidAmount;
      sum.credit += row.creditAmount;
      return sum;
    },
    { billed: 0, paid: 0, credit: 0 },
  );
}

function salesByDay(invoices: InvoiceRow[]) {
  const map = new Map<string, number>();
  invoices.forEach((row) => {
    const day = row.createdAt.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + row.total);
  });
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));
}

function paymentMix(invoices: InvoiceRow[]) {
  const mix = { PAID: 0, PARTIAL: 0, CREDIT: 0 };
  invoices.forEach((row) => {
    if (row.paymentStatus === "PAID") mix.PAID += row.total;
    else if (row.paymentStatus === "PARTIAL") mix.PARTIAL += row.total;
    else mix.CREDIT += row.total;
  });
  return [
    { id: "paid", label: "Paid", value: mix.PAID },
    { id: "partial", label: "Partial", value: mix.PARTIAL },
    { id: "credit", label: "Credit", value: mix.CREDIT },
  ].filter((point) => point.value > 0);
}

function topProductsFrom(invoices: InvoiceRow[]) {
  const map = new Map<string, { name: string; qty: number; revenue: number }>();
  invoices.forEach((invoice) => {
    invoice.items.forEach((item) => {
      const current = map.get(item.productId) ?? { name: item.productId, qty: 0, revenue: 0 };
      current.qty += item.baseQuantity;
      current.revenue += item.total;
      map.set(item.productId, current);
    });
  });
  return [...map.entries()]
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}

export function AnalyticsPage() {
  const { settings } = useSettings();
  const [tab, setTab] = useQueryTab(REPORT_TABS, "sales");
  const [range, setRange] = useState<DateRangeFilter>(() => rangeForPeriod("30d"));
  const [loading, setLoading] = useState({ report: true });
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [customers, setCustomers] = useState<DomainCustomer[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [movements, setMovements] = useState<StockMovementResponse[]>([]);
  const [apiTop, setApiTop] = useState<
    { productId: string; productName: string; quantity: number; revenue: number }[]
  >([]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading((current) => ({ ...current, report: true }));
      const session = await ensureSession(controller.signal);
      const analyticsParams = range.period === "all" ? {} : { from: range.from, to: range.to };
      const [invoiceRows, customerRows, expenseRows, cats, stock, analytics] = await Promise.all([
        listAllInvoices(controller.signal, session?.branchId).catch(() => [] as InvoiceRow[]),
        listCustomersWithBalances(controller.signal).catch(() => [] as DomainCustomer[]),
        listAllExpenses(controller.signal).catch(() => [] as ExpenseRow[]),
        listExpenseCategories(controller.signal).catch(() => [] as { id: string; name: string }[]),
        listAllStockMovementDetails({}, controller.signal).catch(
          () => [] as StockMovementResponse[],
        ),
        reportsAnalytics(analyticsParams, controller.signal).catch(() => null),
      ]);
      setInvoices(invoiceRows);
      setCustomers(customerRows);
      setExpenses(expenseRows);
      setCategories(Object.fromEntries((cats ?? []).map((row) => [row.id, row.name])));
      setMovements(stock);
      setApiTop(analytics?.topProducts ?? []);
      setLoading((current) => ({ ...current, report: false }));
    })();
    return () => controller.abort();
  }, [range.from, range.to, range.period]);

  const prior = priorRange(range);
  const sold = useMemo(
    () => invoices.filter((row) => row.status === "COMPLETED" && inRange(row.createdAt, range)),
    [invoices, range],
  );
  const priorSold = useMemo(
    () =>
      prior
        ? invoices.filter((row) => row.status === "COMPLETED" && inRange(row.createdAt, prior))
        : [],
    [invoices, prior],
  );
  const periodExpenses = useMemo(
    () => expenses.filter((row) => inRange(row.expenseDate, range)),
    [expenses, range],
  );
  const priorExpenses = useMemo(
    () => (prior ? expenses.filter((row) => inRange(row.expenseDate, prior)) : []),
    [expenses, prior],
  );
  const periodMoves = useMemo(
    () => movements.filter((row) => inRange(row.occurredAt || row.createdAt, range)),
    [movements, range],
  );
  const current = totalsOf(sold);
  const previous = totalsOf(priorSold);
  const expenseTotal = periodExpenses.reduce((sum, row) => sum + row.amount, 0);
  const priorExpenseTotal = priorExpenses.reduce((sum, row) => sum + row.amount, 0);
  const net = current.paid - expenseTotal;
  const avgTicket = sold.length ? current.billed / sold.length : 0;
  const owed = customers.filter((row) => row.currentBalance > 0);
  const dayChart = salesByDay(sold);
  const mix = paymentMix(sold);
  const products = useMemo(() => {
    const fromItems = topProductsFrom(sold);
    if (fromItems.length)
      return fromItems.map((row) => ({
        id: row.id,
        label: row.name,
        qty: row.qty,
        revenue: row.revenue,
      }));
    return apiTop.map((row) => ({
      id: row.productId,
      label: row.productName,
      qty: row.quantity,
      revenue: row.revenue,
    }));
  }, [sold, apiTop]);

  function exportPdf() {
    exportReportPdf({
      shopName: settings.shopName || "Shop",
      rangeLabel: rangeLabel(range),
      kpis: [
        { label: "Billed", value: money(current.billed) },
        { label: "Collected", value: money(current.paid) },
        { label: "Credit billed", value: money(current.credit) },
        { label: "Expenses", value: money(expenseTotal) },
        { label: "Net cash", value: money(net) },
        { label: "Bills", value: String(sold.length) },
      ],
      invoices: sold.slice(0, 80).map((row) => ({
        number: row.invoiceNumber,
        when: new Date(row.createdAt).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: row.paymentStatus,
        total: money(row.total),
        paid: money(row.paidAmount),
        credit: money(row.creditAmount),
      })),
      products: products.slice(0, 15).map((row) => ({
        name: row.label,
        qty: String(row.qty),
        revenue: money(row.revenue),
      })),
      expenses: periodExpenses.slice(0, 40).map((row) => ({
        when: row.expenseDate.slice(0, 10),
        description: row.description || categories[row.categoryId] || "Expense",
        amount: money(row.amount),
      })),
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <PageHead title={REPORT_COPY.title}>
        <DateRangePeriodPicker value={range} onChange={setRange} />
        <Button variant="primary" icon={<FileDown size={14} />} onClick={exportPdf}>
          {REPORT_COPY.exportPdf}
        </Button>
      </PageHead>
      <p className="ui-note text-[12px] leading-snug text-muted">{REPORT_COPY.hint}</p>

      <div className="grid shrink-0 grid-cols-5 gap-2.5">
        {loading.report ? (
          Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-[10px]" />
          ))
        ) : (
          <>
            <KpiCard
              label="Billed"
              value={money(current.billed)}
              hint={`${sold.length} bills`}
              tone="info"
              delta={prior ? comparePeriods(current.billed, previous.billed) : undefined}
            />
            <KpiCard
              label="Collected"
              value={money(current.paid)}
              hint="Cash and bank"
              tone="ok"
              delta={prior ? comparePeriods(current.paid, previous.paid) : undefined}
            />
            <KpiCard
              label="Credit billed"
              value={money(current.credit)}
              hint="Credit sales in period"
              tone="warn"
              invertDelta
              delta={prior ? comparePeriods(current.credit, previous.credit) : undefined}
            />
            <KpiCard
              label="Expenses"
              value={money(expenseTotal)}
              hint="Money out"
              tone="danger"
              invertDelta
              delta={prior ? comparePeriods(expenseTotal, priorExpenseTotal) : undefined}
            />
            <KpiCard
              label="Net cash"
              value={money(net)}
              hint="Collected minus expenses"
              tone={net >= 0 ? "ok" : "danger"}
            />
          </>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-4 gap-2.5">
        {[
          { label: "Average ticket", value: money(avgTicket) },
          {
            label: "Open balance",
            value: money(owed.reduce((sum, row) => sum + row.currentBalance, 0)),
          },
          { label: "Stock moves", value: String(periodMoves.length) },
          { label: "Expense lines", value: String(periodExpenses.length) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center justify-between rounded-[10px] border border-line bg-paper px-3.5 py-2.5"
          >
            <p className="text-[11px] font-semibold text-muted">{stat.label}</p>
            <p className="text-[13px] font-bold tabular-nums text-ink">
              {loading.report ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      <section className="min-h-[260px] shrink-0 overflow-hidden rounded-[10px] border border-line bg-paper">
        {loading.report ? (
          <div className="p-4">
            <Skeleton className="h-48 rounded-lg" />
          </div>
        ) : (
          <HubChartGrid>
            <HubChart
              type="line"
              title="Sales by day"
              subtitle={rangeLabel(range)}
              data={dayChart}
              formatValue={money}
              maxItems={null}
            />
            <HubChart
              type="donut"
              title="Payment mix"
              subtitle="Billed amount"
              data={mix}
              formatValue={money}
            />
          </HubChartGrid>
        )}
      </section>

      <section className="min-h-[220px] shrink-0 overflow-hidden rounded-[10px] border border-line bg-paper">
        {loading.report ? (
          <div className="p-4">
            <Skeleton className="h-40 rounded-lg" />
          </div>
        ) : (
          <HubChart
            type="bar"
            title="Top products"
            subtitle="Revenue in this range"
            data={products.map((row) => ({
              id: row.id,
              label: row.label,
              value: row.revenue,
              details: [
                { label: "Revenue", value: money(row.revenue) },
                { label: "Qty", value: String(row.qty) },
              ],
            }))}
            formatValue={money}
            maxItems={8}
          />
        )}
      </section>

      <TabSheet tabs={<Tabs value={tab} onChange={setTab} items={[...REPORT_TABS]} />}>
        {tab === "sales" ? (
          <Table>
            <THead>
              <tr>
                <Th>Invoice</Th>
                <Th>Payment</Th>
                <Th>Total</Th>
                <Th>Paid</Th>
                <Th>Credit</Th>
              </tr>
            </THead>
            <tbody>
              {sold.length === 0 ? <EmptyRow cols={5} text={REPORT_COPY.empty} /> : null}
              {sold.map((row) => (
                <tr key={row.id}>
                  <Td>
                    {row.invoiceNumber}
                    <span className="sub">
                      {new Date(row.createdAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={payTone(row.paymentStatus)}>{row.paymentStatus}</Badge>
                  </Td>
                  <Td numeric>{money(row.total)}</Td>
                  <Td numeric>{money(row.paidAmount)}</Td>
                  <Td numeric>{money(row.creditAmount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        {tab === "expenses" ? (
          <Table>
            <THead>
              <tr>
                <Th>When</Th>
                <Th>Category</Th>
                <Th>Description</Th>
                <Th>Amount</Th>
              </tr>
            </THead>
            <tbody>
              {periodExpenses.length === 0 ? <EmptyRow cols={4} text={REPORT_COPY.empty} /> : null}
              {periodExpenses.map((row) => (
                <tr key={row.id}>
                  <Td>{row.expenseDate.slice(0, 10)}</Td>
                  <Td>{categories[row.categoryId] || "—"}</Td>
                  <Td>{row.description || "—"}</Td>
                  <Td numeric>{money(row.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        {tab === "stock" ? (
          <Table>
            <THead>
              <tr>
                <Th>When</Th>
                <Th>Product</Th>
                <Th>Type</Th>
                <Th>Qty</Th>
                <Th>Ref</Th>
              </tr>
            </THead>
            <tbody>
              {periodMoves.length === 0 ? <EmptyRow cols={5} text={REPORT_COPY.empty} /> : null}
              {periodMoves.map((m) => (
                <tr key={m.id}>
                  <Td>{(m.occurredAt || m.createdAt).slice(0, 16).replace("T", " ")}</Td>
                  <Td>{m.productName || m.productId}</Td>
                  <Td>
                    <Badge tone={m.baseQuantityDelta < 0 ? "danger" : "ok"}>{m.movementType}</Badge>
                  </Td>
                  <Td numeric>{m.baseQuantityDelta}</Td>
                  <Td>
                    {m.referenceType} {m.referenceId.slice(0, 8)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        {tab === "balance" ? (
          <Table>
            <THead>
              <tr>
                <Th>Customer</Th>
                <Th>Phone</Th>
                <Th>Balance</Th>
              </tr>
            </THead>
            <tbody>
              {owed.length === 0 ? <EmptyRow cols={3} text={REPORT_COPY.empty} /> : null}
              {owed.map((row) => (
                <tr key={row.id}>
                  <Td>{row.name}</Td>
                  <Td>{row.phone || "—"}</Td>
                  <Td numeric>{money(row.currentBalance)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </TabSheet>
    </div>
  );
}
