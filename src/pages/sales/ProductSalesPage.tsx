import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  Badge,
  Button,
  DateRangePeriodPicker,
  HubChart,
  SearchInput,
  SearchableSelect,
  dateInRange,
  rangeForPeriod,
  type DateRangeFilter,
} from "@/components/common";
import { formatStockQty, unitLabel } from "@/pages/products/productQty";
import { invoices } from "@/shared/domain/mock";
import { products, repairJobs } from "@/shared/mock";
import { money } from "@/utils/format";

type SalesFilter = "topProfit" | "bestSelling" | "worst";
type ChartLimit = "10" | "20" | "50" | "all";
type SalesSource = "all" | "paid" | "credit" | "partial" | "repair";

function stockTone(stock: number): "ok" | "warn" | "danger" {
  if (stock <= 0) return "danger";
  if (stock < 20) return "warn";
  return "ok";
}

export function ProductSalesPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SalesFilter>("topProfit");
  const [limit, setLimit] = useState<ChartLimit>("10");
  const [source, setSource] = useState<SalesSource>("all");
  const [dateRange, setDateRange] = useState<DateRangeFilter>(() => rangeForPeriod("30d"));
  const [selectedId, setSelectedId] = useState("");

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(needle));
  }, [query]);

  const completed = useMemo(
    () => invoices.filter((invoice) => {
      if (invoice.status !== "COMPLETED" || !dateInRange(invoice.createdAt, dateRange)) return false;
      if (source === "paid") return invoice.paymentStatus === "PAID";
      if (source === "credit") return invoice.paymentStatus === "CREDIT";
      if (source === "partial") return invoice.paymentStatus === "PARTIAL";
      return source === "all";
    }),
    [dateRange, source],
  );

  const repairSales = useMemo(
    () => source === "all" || source === "repair"
      ? repairJobs.filter((job) => dateInRange(job.date, dateRange))
      : [],
    [dateRange, source],
  );

  const chartData = useMemo(() => {
    const points = visibleProducts.map((product) => {
      let sales = 0;
      let quantity = 0;
      completed.forEach((invoice) => invoice.items.forEach((item) => {
        if (item.productId !== product.id) return;
        sales += item.total;
        quantity += item.baseQuantity;
      }));
      repairSales.forEach((job) => job.parts.forEach((part) => {
        if (part.productId !== product.id) return;
        sales += part.qty * part.price;
        quantity += part.qty;
      }));
      const profit = sales - quantity * product.cost;
      return {
        id: product.id,
        label: product.name,
        value: filter === "bestSelling" ? sales : profit,
        details: [
          { label: "Profit earned", value: money(profit) },
          { label: "Total sales", value: money(sales) },
          { label: "Stock value remaining", value: money(product.stock * product.cost) },
          { label: "Quantity remaining", value: `${formatStockQty(product.stock)} ${unitLabel(product.unit)}` },
        ],
      };
    });
    points.sort((a, b) => filter === "worst" ? a.value - b.value : b.value - a.value);
    return points;
  }, [completed, filter, repairSales, visibleProducts]);

  const selected = products.find((product) => product.id === selectedId);
  const selectedPoint = chartData.find((point) => point.id === selectedId);

  return (
    <div className="products-hub-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="ui-table-card flex min-h-0 flex-1 flex-col overflow-visible rounded-[10px] border border-line bg-paper shadow-sm">
        <div className="ui-table-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-line px-3 py-2.5">
          <SearchInput value={query} onChange={setQuery} placeholder="Search products by name, SKU, category" searchable />
          <div className="flex items-center gap-2">
            <SearchableSelect
              className="w-[190px] [&_.ui-combo-field]:h-8 [&_.ui-combo-input]:text-[11px]"
              value={source}
              options={[
                { value: "all", label: "All sales" },
                { value: "paid", label: "Paid / cash invoices" },
                { value: "credit", label: "Credit invoices" },
                { value: "partial", label: "Partial invoices" },
                { value: "repair", label: "Repair shop parts" },
              ]}
              onChange={(value) => { setSource(value as SalesSource); setSelectedId(""); }}
              clearable={false}
              searchable={false}
            />
            <DateRangePeriodPicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>
        <HubChart
          type="bar"
          title={filter === "topProfit" ? "Top profit products" : filter === "bestSelling" ? "Best-selling products" : "Worst-performing products"}
          subtitle={`${limit === "all" ? "All" : limit} of ${visibleProducts.length} products · ${source === "all" ? "all sales channels" : source === "repair" ? "repair shop parts" : `${source} invoices`}`}
          data={chartData}
          maxItems={limit === "all" ? null : Number(limit)}
          formatValue={money}
          selectedId={selectedId}
          onPointClick={(point) => setSelectedId(point.id ?? "")}
          controls={
            <div className="flex items-center gap-2">
              <SearchableSelect
                className="w-[220px] [&_.ui-combo-field]:h-8 [&_.ui-combo-input]:text-[11px]"
                value={filter}
                options={[
                  { value: "topProfit", label: "Top Profit Products" },
                  { value: "bestSelling", label: "Best-Selling Products" },
                  { value: "worst", label: "Worst-Performing Products" },
                ]}
                onChange={(value) => { setFilter(value as SalesFilter); setSelectedId(""); }}
                clearable={false}
                searchable={false}
              />
              <SearchableSelect
                className="w-[130px] [&_.ui-combo-field]:h-8 [&_.ui-combo-input]:text-[11px]"
                value={limit}
                options={[
                  { value: "10", label: "10 products" },
                  { value: "20", label: "20 products" },
                  { value: "50", label: "50 products" },
                  { value: "all", label: "All products" },
                ]}
                onChange={(value) => setLimit(value as ChartLimit)}
                clearable={false}
                searchable={false}
              />
            </div>
          }
          sidePanel={selected ? (
            <aside key={selected.id} className="w-[320px] shrink-0 animate-[slideInRight_.2s_ease-out] bg-bg/20 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-accent-deep">Product details</span>
                  <h3 className="mt-1 truncate text-[16px] font-extrabold text-ink">{selected.name}</h3>
                  <p className="mt-1 text-[10px] text-muted">{selected.sku} · {selected.category}</p>
                </div>
                <Button size="icon" variant="ghost" aria-label="Close product details" onClick={() => setSelectedId("")}><X size={15} /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(selectedPoint?.details ?? []).map((detail) => (
                  <div key={detail.label} className="rounded-lg border border-line bg-paper/70 p-2.5">
                    <span className="block text-[9px] font-semibold text-muted">{detail.label}</span>
                    <strong className="mt-1 block text-[12px] tabular-nums text-ink">{detail.value}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-line bg-paper/60 p-3">
                <h4 className="mb-3 text-[11px] font-bold text-ink">Pricing</h4>
                <div className="grid gap-2 text-[10px]">
                  {[["Cost", selected.cost], ["Minimum", selected.min], ["Wholesale", selected.wholesale], ["Retail", selected.retail]].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between gap-4"><span className="text-muted">{label}</span><b>{money(Number(value))}</b></div>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-paper/60 p-3 text-[10px]">
                <span className="text-muted">Stock status</span>
                <Badge tone={stockTone(selected.stock)}>{selected.stock <= 0 ? "Out of stock" : selected.stock < 20 ? "Low stock" : "In stock"}</Badge>
              </div>
            </aside>
          ) : null}
        />
      </div>
    </div>
  );
}
