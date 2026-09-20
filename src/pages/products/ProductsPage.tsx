import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useLotDrawer } from "@/pages/lots/useLotDrawer";
import {
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  BulkAction,
  BulkActions,
  Button,
  Checkbox,
  ConfirmDialog,
  Drawer,
  HubChart,
  Menu,
  MenuItem,
  PAGE_SIZE_ALL,
  Pagination,
  Popover,
  SearchableSelect,
  Table,
  TableRowsSkeleton,
  Td,
  THead,
  Th,
  Tooltip,
  TruncatedTooltip,
  toaster,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { ProductDetailDrawer } from "@/pages/products/ProductDetailDrawer";
import { ProductForm } from "@/pages/products/ProductForm";
import { useDebounce } from "@/hooks/useDebounce";
import { blankProduct } from "@/pages/products/productLots";
import {
  formatStockQty,
  isLinearStockUnit,
  priceBreakdown,
  productBasePricing,
  qtyUnits,
  unitLabel,
} from "@/pages/products/productQty";
import { matchesHealth, useProductsHub } from "@/pages/products/ProductsLayout";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import {
  DEFAULT_PRODUCT_COLUMNS,
  DEFAULT_REORDER_COLUMNS,
  PRODUCT_COPY,
  PRODUCT_HEALTH_FROM_LABEL,
  PRODUCT_HEALTH_LABEL,
  PRODUCT_INSIGHT_METRICS,
  PRODUCT_TABLE_COLUMNS,
  REORDER_PRODUCT_COLUMNS,
  type ProductInsightMetric,
} from "@/shared/constants/products";
import { useSettings } from "@/shared/settings";
import type { Product } from "@/shared/types";
import type { InvoiceRow, ProductLotRow } from "@/shared/domain/types";
import { ensureSession } from "@/services/auth";
import { listAllRepairs, type RepairResponse } from "@/services/repairs";
import {
  createProduct,
  deleteProduct,
  searchAllProducts,
  updateProduct,
} from "@/services/products";
import {
  buildCreateProductPayload,
  buildUpdateProductPayload,
  resolveCategoryId,
} from "@/pages/products/productPayload";
import { listAllInvoices } from "@/services/sales";
import {
  buildProductSalesStats,
  formatInsightMetricValue,
  insightMetricDetails,
  insightMetricLabel,
  insightMetricValue,
  productSalesStats,
} from "@/pages/products/productSalesStats";
import { exportProductsCsv, exportProductsExcel, printProducts } from "@/utils/exportFile";
import { money, shortError } from "@/utils/format";
import { ProductCostDisplay } from "@/pages/products/ProductCostDisplay";
import { fifoCostForProduct, openLotStockValue } from "@/pages/products/productFifo";
import { branchStockTooltip, productTotalStock } from "@/utils/productStock";

type PriceField = "cost" | "min" | "wholesale" | "retail";

function unitPrices(row: Product, field: PriceField) {
  if (row.sellUnits?.length) {
    return qtyUnits(row.sellUnits).map((unit) => ({
      id: unit.id,
      name: unit.name || unitLabel(unit.symbol || row.unit),
      value: field === "retail" ? unit.price : unit[field],
    }));
  }

  const base = {
    id: `${row.id}-base`,
    name: unitLabel(row.unit),
    value: row[field],
  };
  if (!row.packQty || row.packQty <= 1) return [base];

  return [
    {
      id: `${row.id}-pack`,
      name: "Pack",
      value: field === "retail" && row.packPrice > 0 ? row.packPrice : row[field] * row.packQty,
    },
    base,
  ];
}

function UnitPrice({ row, field }: { row: Product; field: PriceField }) {
  return (
    <div className="product-unit-prices grid justify-items-end gap-1 [font-variant-numeric:tabular-nums]">
      {unitPrices(row, field).map((price) => (
        <span key={price.id} className="whitespace-nowrap">
          {money(price.value)} <small className="font-medium text-muted">/ {price.name}</small>
        </span>
      ))}
    </div>
  );
}

function marginPct(row: Product, lots: ProductLotRow[]) {
  const cost = fifoCostForProduct(row, lots);
  const { retail } = productBasePricing(row);
  if (cost <= 0) return 0;
  return ((retail - cost) / cost) * 100;
}

function unitProfit(row: Product, lots: ProductLotRow[]) {
  const cost = fifoCostForProduct(row, lots);
  const { retail } = productBasePricing(row);
  return retail - cost;
}

function compactFifoCost(row: Product, lots: ProductLotRow[]) {
  const cost = fifoCostForProduct(row, lots);
  return priceBreakdown(row, cost).map((price) => (
    <span key={price.id} className="block whitespace-nowrap">
      {money(price.value)} / {price.name}
    </span>
  ));
}

function compactPrices(row: Product, field: PriceField) {
  return unitPrices(row, field).map((price) => (
    <span key={price.id} className="block whitespace-nowrap">
      {money(price.value)} / {price.name}
    </span>
  ));
}

function pricingBreakdown(row: Product, salesProfit: number, lots: ProductLotRow[]) {
  const pct = marginPct(row, lots);
  const profit = unitProfit(row, lots);
  const rows: {
    label: string;
    field?: PriceField;
    fifo?: boolean;
    value?: string;
    tone?: "sale" | "danger";
  }[] = [
    { label: "Cost", fifo: true },
    { label: "Minimum", field: "min" },
    { label: "Wholesale", field: "wholesale" },
    { label: "Retail", field: "retail" },
    {
      label: PRODUCT_COPY.unitProfit,
      value: money(profit),
      tone: profit >= 0 ? "sale" : "danger",
    },
    {
      label: "Margin",
      value: `${profit >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      tone: profit >= 0 ? "sale" : "danger",
    },
    { label: PRODUCT_COPY.salesProfit, value: money(salesProfit) },
  ];

  return (
    <div className="grid min-w-[190px] gap-1.5 text-left">
      {rows.map((entry) => (
        <div key={entry.label} className="flex items-start justify-between gap-4">
          <span className="font-medium opacity-85">{entry.label}</span>
          <span
            className={
              entry.tone === "sale"
                ? "grid justify-items-end gap-0.5 font-bold tabular-nums text-[#86efac]"
                : entry.tone === "danger"
                  ? "grid justify-items-end gap-0.5 font-bold tabular-nums text-[#fca5a5]"
                  : "grid justify-items-end gap-0.5 font-semibold tabular-nums text-right"
            }
          >
            {entry.fifo
              ? compactFifoCost(row, lots)
              : entry.field
                ? compactPrices(row, entry.field)
                : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function PricingBreakdownTrigger({
  row,
  lots,
  salesProfit,
  children,
  className,
  showIcon = false,
}: {
  row: Product;
  lots: ProductLotRow[];
  salesProfit: number;
  children: ReactNode;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <Tooltip content={pricingBreakdown(row, salesProfit, lots)}>
      <span
        className={`inline-flex max-w-full min-w-0 cursor-help items-center gap-1 ${className ?? ""}`}
        title={PRODUCT_COPY.pricingHint}
      >
        {children}
        {showIcon ? <Info size={12} className="shrink-0 opacity-55" aria-hidden /> : null}
      </span>
    </Tooltip>
  );
}

function stockTone(row: Product): "ok" | "warn" | "danger" {
  if (row.stock <= 0) return "danger";
  if (row.stock < (row.minimumStock ?? 20)) return "warn";
  return "ok";
}

function stockLabel(row: Product) {
  if (row.stock <= 0) return "Out of stock";
  if (row.stock < (row.minimumStock ?? 20)) return "Low stock";
  return "In stock";
}

function minAmount(raw: string) {
  const n = Number(String(raw).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function ExportMenu({ rows, shopName }: { rows: Product[]; shopName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button onClick={() => setOpen((v) => !v)}>
          Export
          <ChevronDown size={14} />
        </Button>
      }
    >
      <div
        className="ui-pop-list [display:grid] [max-height:240px] [overflow:auto]"
        onClick={() => setOpen(false)}
      >
        <button
          type="button"
          className="ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer]"
          onClick={() => exportProductsCsv(rows)}
        >
          <FileText size={14} />
          CSV
        </button>
        <button
          type="button"
          className="ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer]"
          onClick={() => exportProductsExcel(rows)}
        >
          <FileSpreadsheet size={14} />
          Excel
        </button>
        <div className="ui-pop-sep [height:1px] [margin:6px_4px] [background:var(--line)]" />
        <button
          type="button"
          className="ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer]"
          onClick={() => printProducts(rows, "thermal", shopName)}
        >
          <Receipt size={14} />
          Thermal printer
        </button>
        <button
          type="button"
          className="ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer]"
          onClick={() => printProducts(rows, "a4", shopName)}
        >
          <Printer size={14} />
          A4
        </button>
      </div>
    </Popover>
  );
}

export function ProductsPage() {
  const { settings } = useSettings();
  const {
    setActions,
    health,
    setHealth,
    section,
    sectionKpi,
    lots,
    setLots,
    products: rows,
    categories,
    units,
    suppliers,
    loading,
    refreshHub,
  } = useProductsHub();
  const categoryOptions = categories.map((c) => c.name);
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "";
  const { edit: lotEdit, openCreate: openAddLot, lotDrawer } = useLotDrawer();

  const tab = section === "low" ? "low" : "all";
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cols, setCols] = useState<string[]>(
    tab === "low" ? DEFAULT_REORDER_COLUMNS : DEFAULT_PRODUCT_COLUMNS,
  );
  const [view, setView] = useState<HubView>("table");
  const [chartLimit, setChartLimit] = useState<"10" | "20" | "50" | "all">("10");
  const [chartProductId, setChartProductId] = useState("");
  const [remoteRows, setRemoteRows] = useState<Product[]>([]);
  const [insightMetric, setInsightMetric] = useState<ProductInsightMetric>("profit");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [repairJobs, setRepairJobs] = useState<RepairResponse[]>([]);
  const [productLoading, setProductLoading] = useState({ saving: false, deleting: false });
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<Product | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [remove, setRemove] = useState<Product | null>(null);
  const [blocked, setBlocked] = useState(false);
  const debouncedGlobalQuery = useDebounce(q.trim(), 320);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        await ensureSession();
        const [invoiceRows, repairs] = await Promise.all([
          listAllInvoices(controller.signal).catch(() => [] as InvoiceRow[]),
          listAllRepairs(controller.signal).catch(() => [] as RepairResponse[]),
        ]);
        if (controller.signal.aborted) return;
        setInvoices(invoiceRows);
        setRepairJobs(repairs);
      } catch {
        if (controller.signal.aborted) return;
      }
    })();
    return () => controller.abort();
  }, []);

  const salesStats = useMemo(
    () => buildProductSalesStats(rows, invoices, repairJobs),
    [rows, invoices, repairJobs],
  );

  useEffect(() => {
    if (debouncedGlobalQuery.length < 2) {
      setRemoteRows([]);
      return;
    }
    const controller = new AbortController();
    searchAllProducts(debouncedGlobalQuery, controller.signal)
      .then(setRemoteRows)
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setRemoteRows([]);
      });
    return () => controller.abort();
  }, [debouncedGlobalQuery]);

  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [tab, sectionKpi]);

  useEffect(() => {
    setCols(tab === "low" ? DEFAULT_REORDER_COLUMNS : DEFAULT_PRODUCT_COLUMNS);
  }, [tab]);

  useEffect(() => {
    setChips((prev) => {
      const without = prev.filter((c) => c.field !== "health");
      if (!health) return without;
      return [
        ...without,
        { field: "health", label: "Health", value: PRODUCT_HEALTH_LABEL[health] },
      ];
    });
    setPage(1);
  }, [health]);

  const searchRows = useMemo(() => {
    if (!q.trim() || !remoteRows.length) return rows;
    const merged = new Map(rows.map((product) => [product.id, product]));
    remoteRows.forEach((product) => merged.set(product.id, product));
    return [...merged.values()];
  }, [q, remoteRows, rows]);

  const filtered = useMemo(() => {
    const list = searchRows.filter((r) => {
      const text = `${r.name} ${r.sku} ${r.category}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      for (const chip of chips) {
        if (chip.field === "health") {
          const key = PRODUCT_HEALTH_FROM_LABEL[chip.value];
          if (!key || !matchesHealth(r, key)) return false;
        }
        if (chip.field === "name" && !r.name.toLowerCase().includes(chip.value.toLowerCase()))
          return false;
        if (chip.field === "sku" && !r.sku.toLowerCase().includes(chip.value.toLowerCase()))
          return false;
        if (chip.field === "category" && r.category !== chip.value) return false;
        if (chip.field === "sales") {
          if (productSalesStats(r.id, salesStats).sales < minAmount(chip.value)) return false;
        }
        if (chip.field === "cost" && fifoCostForProduct(r, lots) < minAmount(chip.value))
          return false;
        if (chip.field === "minimumPrice" && r.min < minAmount(chip.value)) return false;
        if (chip.field === "wholesale" && r.wholesale < minAmount(chip.value)) return false;
        if (chip.field === "retail" && r.retail < minAmount(chip.value)) return false;
        if (chip.field === "stockQty" && r.stock < minAmount(chip.value)) return false;
        if (
          chip.field === "stockValue" &&
          openLotStockValue(lots, rows, r.id) < minAmount(chip.value)
        )
          return false;
        if (chip.field === "margin" && marginPct(r, lots) < minAmount(chip.value)) return false;
        if (chip.field === "stock") {
          const tone = stockTone(r);
          if (chip.value === "In stock" && tone !== "ok") return false;
          if (chip.value === "Low stock" && tone !== "warn") return false;
          if (chip.value === "Out of stock" && tone !== "danger") return false;
        }
      }
      if (tab === "low") {
        const minimum = r.minimumStock ?? 20;
        if (sectionKpi === "below") return r.stock > 0 && r.stock < minimum;
        if (sectionKpi === "out") return r.stock <= 0;
        return r.stock < minimum;
      }
      return true;
    });
    return list;
  }, [searchRows, q, tab, chips, sectionKpi, salesStats, lots, rows]);

  const pageCount = pageSize === PAGE_SIZE_ALL ? Math.max(filtered.length, 1) : pageSize;
  const pages = Math.max(1, Math.ceil(filtered.length / pageCount));
  const shown =
    pageSize === PAGE_SIZE_ALL ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const chartData = useMemo(() => {
    return filtered
      .map((product) => {
        const stats = productSalesStats(product.id, salesStats);
        const value = insightMetricValue(product, stats, insightMetric);
        return {
          id: product.id,
          label: product.name,
          value,
          details: insightMetricDetails(product, stats),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [filtered, insightMetric, salesStats]);
  const chartProduct = searchRows.find((product) => product.id === chartProductId);
  const chartProductPoint = chartData.find((point) => point.id === chartProductId);
  const latestLot = (productId: string) =>
    [...lots]
      .filter((lot) => lot.productId === productId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
  const show = (id: string) => cols.includes(id);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  function removeChip(field: string) {
    if (field === "health") setHealth(null);
    setChips((prev) => prev.filter((c) => c.field !== field));
    setPage(1);
  }

  function clearChips() {
    setHealth(null);
    setChips([]);
    setPage(1);
  }

  async function commit(next: Product): Promise<boolean> {
    const isNewRow = !rows.some((r) => r.id === next.id);
    const category = resolveCategoryId(next, categories);
    if (!category) {
      toaster.error(PRODUCT_COPY.categoryRequired);
      return false;
    }
    if (!units.some((row) => row.symbol === next.unit)) {
      toaster.error(PRODUCT_COPY.unitRequired);
      return false;
    }
    setProductLoading((current) => ({ ...current, saving: true }));
    try {
      const session = await ensureSession();
      if (isNewRow) {
        const payload = buildCreateProductPayload(next, {
          categoryId: category.id,
          units,
          branchId: session?.branchId,
        });
        if (!payload) {
          toaster.error(PRODUCT_COPY.unitRequired);
          return false;
        }
        const created = await createProduct(payload);
        next.id = created.id;
        next.categoryId = created.categoryId;
        next.category = created.category;
        next.sku = created.sku;
      } else {
        const payload = buildUpdateProductPayload(next, {
          categoryId: category.id,
          units,
        });
        if (!payload) {
          toaster.error(PRODUCT_COPY.unitRequired);
          return false;
        }
        const updated = await updateProduct(next.id, payload);
        next.categoryId = updated.categoryId;
        next.category = updated.category;
        setLots((prev) => [...prev.filter((lot) => lot.productId !== next.id)]);
      }
      await refreshHub();
      return true;
    } catch (error) {
      toaster.error(shortError(error, PRODUCT_COPY.saveFailed));
      return false;
    } finally {
      setProductLoading((current) => ({ ...current, saving: false }));
    }
  }

  const picked = rows.filter((r) => selected.includes(r.id));

  function openEdit(row: Product) {
    setEdit({
      ...row,
      barcode: row.barcode ?? "",
      supplierId: row.supplierId ?? "",
      minimumStock: row.minimumStock ?? 0,
      warrantyEnabled: row.warrantyEnabled ?? row.warrantyQty > 0,
      warrantyNote: row.warrantyNote ?? "",
    });
  }

  function openNew() {
    setEdit(blankProduct());
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (edit || detail || lotEdit || remove || blocked) return;
      if (e.key === "F2") {
        e.preventDefault();
        e.stopPropagation();
        openNew();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [edit, lotEdit, remove, blocked]);

  useLayoutEffect(() => {
    setActions(
      <>
        <ExportMenu rows={filtered} shopName={settings.shopName} />
        <Button variant="primary" icon={<Plus size={14} />} onClick={openNew}>
          Add Product
          <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
            F2
          </kbd>
        </Button>
      </>,
    );
    return () => setActions(null);
  }, [filtered, settings.shopName, setActions]);

  const isNew = !edit || !rows.some((r) => r.id === edit.id);

  return (
    <div
      className={
        edit
          ? "products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden] is-drawer-open"
          : "products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]"
      }
    >
      <Table
        toolbar={
          <HubToolbar
            columns={tab === "low" ? REORDER_PRODUCT_COLUMNS : PRODUCT_TABLE_COLUMNS}
            cols={cols}
            onCols={setCols}
            chips={chips}
            onApply={(chip) => {
              setChips((prev) => [...prev.filter((c) => c.field !== chip.field), chip]);
              setPage(1);
            }}
            onRemove={removeChip}
            onClear={clearChips}
            filterFields={[
              { id: "name", label: "Name" },
              { id: "sku", label: "SKU" },
              { id: "category", label: "Category", options: categoryOptions, searchable: true },
              {
                id: "sales",
                label: "Total sales",
                placeholder: "Min amount e.g. 5000",
                numeric: true,
              },
              {
                id: "stock",
                label: "Stock status",
                options: ["In stock", "Low stock", "Out of stock"],
              },
              {
                id: "stockQty",
                label: "Stock quantity",
                placeholder: "Minimum quantity",
                numeric: true,
              },
              {
                id: "stockValue",
                label: "Stock value",
                placeholder: "Minimum stock value",
                numeric: true,
              },
              { id: "cost", label: "Cost price", placeholder: "Minimum cost", numeric: true },
              {
                id: "minimumPrice",
                label: "Minimum price",
                placeholder: "Minimum amount",
                numeric: true,
              },
              {
                id: "wholesale",
                label: "Wholesale price",
                placeholder: "Minimum wholesale",
                numeric: true,
              },
              { id: "retail", label: "Retail price", placeholder: "Minimum retail", numeric: true },
              {
                id: "margin",
                label: "Margin %",
                placeholder: "Minimum margin percentage",
                numeric: true,
              },
            ]}
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search by name, SKU, category"
            view={view}
            onView={setView}
            insightControls={
              <SearchableSelect
                className="w-[190px] [&_.ui-combo-field]:h-8 [&_.ui-combo-input]:text-[11px]"
                value={insightMetric}
                options={PRODUCT_INSIGHT_METRICS.map((metric) => ({
                  value: metric.id,
                  label: metric.label,
                }))}
                onChange={(value) => {
                  setInsightMetric(value as ProductInsightMetric);
                  setChartProductId("");
                }}
                clearable={false}
                searchable={false}
                placeholder="Metric"
              />
            }
            trailing={
              selected.length > 0 ? (
                <BulkActions count={selected.length}>
                  <BulkAction
                    icon={<FileText size={14} />}
                    onClick={() => exportProductsCsv(picked, "selected-products.csv")}
                  >
                    CSV
                  </BulkAction>
                  <BulkAction
                    icon={<FileSpreadsheet size={14} />}
                    onClick={() => exportProductsExcel(picked, "selected-products.xls")}
                  >
                    Excel
                  </BulkAction>
                  <BulkAction
                    icon={<Receipt size={14} />}
                    onClick={() => printProducts(picked, "thermal", settings.shopName)}
                  >
                    Thermal printer
                  </BulkAction>
                  <BulkAction
                    icon={<Printer size={14} />}
                    onClick={() => printProducts(picked, "a4", settings.shopName)}
                  >
                    A4
                  </BulkAction>
                  <BulkAction
                    icon={<Tags size={14} />}
                    onClick={() => {
                      const first = picked[0];
                      if (first) openEdit(first);
                    }}
                  >
                    Edit selected
                  </BulkAction>
                </BulkActions>
              ) : null
            }
          />
        }
        body={
          view === "insights" ? (
            <HubChart
              type="bar"
              title={insightMetricLabel(insightMetric)}
              subtitle={`${chartLimit === "all" ? "All" : chartLimit} of ${filtered.length} matching products · completed sales · click a bar for details`}
              data={chartData}
              maxItems={chartLimit === "all" ? null : Number(chartLimit)}
              formatValue={(value) => formatInsightMetricValue(insightMetric, value)}
              selectedId={chartProductId}
              onPointClick={(point) => setChartProductId(point.id ?? "")}
              controls={
                <div className="flex items-center gap-2">
                  <SearchableSelect
                    className="w-[130px] [&_.ui-combo-field]:h-8 [&_.ui-combo-input]:text-[11px]"
                    value={chartLimit}
                    options={[
                      { value: "10", label: "10 products" },
                      { value: "20", label: "20 products" },
                      { value: "50", label: "50 products" },
                      { value: "all", label: "All products" },
                    ]}
                    onChange={(value) => setChartLimit(value as "10" | "20" | "50" | "all")}
                    clearable={false}
                    searchable={false}
                    placeholder="Products"
                  />
                </div>
              }
              sidePanel={
                chartProduct ? (
                  <aside
                    key={chartProduct.id}
                    className="w-[320px] shrink-0 animate-[slideInRight_.2s_ease-out] bg-bg/20 p-4"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-accent-deep">
                          Product details
                        </span>
                        <h3 className="mt-1 truncate text-[16px] font-extrabold text-ink">
                          {chartProduct.name}
                        </h3>
                        <p className="mt-1 text-[10px] text-muted">
                          {chartProduct.sku} · {chartProduct.category}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Close product details"
                        onClick={() => setChartProductId("")}
                      >
                        <X size={15} />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(chartProductPoint?.details ?? []).map((detail) => (
                        <div
                          key={detail.label}
                          className="rounded-lg border border-line bg-bg/50 p-2.5"
                        >
                          <span className="block text-[9px] font-semibold text-muted">
                            {detail.label}
                          </span>
                          <strong className="mt-1 block text-[12px] tabular-nums text-ink">
                            {detail.value}
                          </strong>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl border border-line p-3">
                      <h4 className="mb-3 text-[11px] font-bold text-ink">Pricing</h4>
                      <div className="grid gap-2 text-[10px]">
                        {(() => {
                          const pricing = productBasePricing(chartProduct);
                          return [
                            ["Cost", fifoCostForProduct(chartProduct, lots)],
                            ["Minimum", chartProduct.min],
                            ["Wholesale", chartProduct.wholesale],
                            ["Retail", pricing.retail],
                            [PRODUCT_COPY.unitProfit, unitProfit(chartProduct, lots)],
                          ];
                        })().map(([label, value]) => (
                          <div key={String(label)} className="flex justify-between gap-4">
                            <span className="text-muted">{label}</span>
                            <b className="tabular-nums text-ink">{money(Number(value))}</b>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-line p-3 text-[10px]">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted">Status</span>
                        <Badge tone={stockTone(chartProduct)}>{stockLabel(chartProduct)}</Badge>
                      </div>
                      <div className="mt-2 flex justify-between gap-4">
                        <span className="text-muted">Minimum stock</span>
                        <b>{formatStockQty(chartProduct.minimumStock ?? 20)}</b>
                      </div>
                    </div>
                  </aside>
                ) : null
              }
            />
          ) : undefined
        }
        footer={
          <Pagination
            page={Math.min(page, pages)}
            pages={pages}
            total={filtered.length}
            pageSize={pageSize}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            onChange={setPage}
          />
        }
      >
        <THead>
          <tr>
            <Th className="ui-check-col">
              <Checkbox
                checked={allShownSelected}
                onChange={(e) => {
                  if (e.target.checked)
                    setSelected((s) => [...new Set([...s, ...shown.map((r) => r.id)])]);
                  else setSelected((s) => s.filter((id) => !shown.some((r) => r.id === id)));
                }}
              />
            </Th>
            <Th>Name</Th>
            {show("sku") ? <Th>SKU</Th> : null}
            {show("category") ? <Th>Category</Th> : null}
            {show("supplier") ? <Th>Last supplier</Th> : null}
            {show("cost") ? <Th>Cost</Th> : null}
            {show("min") ? <Th>Minimum</Th> : null}
            {show("wholesale") ? <Th>Wholesale</Th> : null}
            {show("retail") ? <Th>Retail</Th> : null}
            {show("margin") ? <Th>Margin</Th> : null}
            {show("sales") ? <Th>Total sales</Th> : null}
            {show("stock") ? <Th>Qty</Th> : null}
            {show("minStock") ? <Th>Minimum qty</Th> : null}
            {show("recommended") ? <Th>Recommended order</Th> : null}
            {show("lastCost") ? <Th>Last cost</Th> : null}
            {show("status") ? <Th>Status</Th> : null}
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {loading.hub ? (
            <TableRowsSkeleton
              columnCount={cols.length}
              rows={
                pageSize === PAGE_SIZE_ALL ? Math.min(Math.max(filtered.length, 6), 12) : pageSize
              }
              selectable
              hasActions
            />
          ) : (
            shown.map((row) => {
              const tone = stockTone(row);
              const pct = marginPct(row, lots);
              const lastLot = latestLot(row.id);
              const minimumStock = row.minimumStock ?? 20;
              const recommended = Math.max(0, minimumStock * 2 - row.stock);
              return (
                <tr
                  key={row.id}
                  className={`is-${tone} cursor-pointer`}
                  onClick={() => setDetail(row)}
                >
                  <Td className="ui-check-col">
                    <div onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selected.includes(row.id)}
                        onChange={(e) => {
                          setSelected((s) =>
                            e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id),
                          );
                        }}
                      />
                    </div>
                  </Td>
                  <Td>
                    <TruncatedTooltip text={row.name} />
                    {isLinearStockUnit(row.unit) ? (
                      <span className="sub">Sold by {unitLabel(row.unit)}</span>
                    ) : null}
                    {row.isManufactured ? <span className="sub">Production</span> : null}
                  </Td>
                  {show("sku") ? <Td>{row.sku || "—"}</Td> : null}
                  {show("category") ? <Td>{row.category}</Td> : null}
                  {show("supplier") ? (
                    <Td>{lastLot ? supplierName(lastLot.supplierId) || "—" : "—"}</Td>
                  ) : null}
                  {show("cost") ? (
                    <Td numeric>
                      <PricingBreakdownTrigger
                        row={row}
                        lots={lots}
                        salesProfit={productSalesStats(row.id, salesStats).profit}
                        className="justify-end"
                      >
                        <ProductCostDisplay
                          product={row}
                          stockCost={fifoCostForProduct(row, lots)}
                        />
                      </PricingBreakdownTrigger>
                    </Td>
                  ) : null}
                  {show("min") ? (
                    <Td numeric>
                      <PricingBreakdownTrigger
                        row={row}
                        lots={lots}
                        salesProfit={productSalesStats(row.id, salesStats).profit}
                        className="justify-end"
                      >
                        <UnitPrice row={row} field="min" />
                      </PricingBreakdownTrigger>
                    </Td>
                  ) : null}
                  {show("wholesale") ? (
                    <Td numeric>
                      <PricingBreakdownTrigger
                        row={row}
                        lots={lots}
                        salesProfit={productSalesStats(row.id, salesStats).profit}
                        className="justify-end"
                      >
                        <UnitPrice row={row} field="wholesale" />
                      </PricingBreakdownTrigger>
                    </Td>
                  ) : null}
                  {show("retail") ? (
                    <Td numeric>
                      <PricingBreakdownTrigger
                        row={row}
                        lots={lots}
                        salesProfit={productSalesStats(row.id, salesStats).profit}
                        className="justify-end"
                        showIcon
                      >
                        <UnitPrice row={row} field="retail" />
                      </PricingBreakdownTrigger>
                    </Td>
                  ) : null}
                  {show("margin") ? (
                    <Td numeric>
                      <span
                        className="font-bold tabular-nums"
                        style={{
                          color: pct >= 0 ? "var(--sale)" : "var(--danger)",
                        }}
                      >
                        {pct >= 0 ? "+" : ""}
                        {pct.toFixed(1)}%
                      </span>
                    </Td>
                  ) : null}
                  {show("sales") ? (
                    <Td numeric>{money(productSalesStats(row.id, salesStats).sales)}</Td>
                  ) : null}
                  {show("stock") ? (
                    <Td numeric>
                      <Tooltip
                        content={branchStockTooltip(row)
                          .split("\n")
                          .map((line) => (
                            <span key={line} className="block">
                              {line}
                            </span>
                          ))}
                      >
                        <div className="product-qty [display:grid] [gap:1px] [justify-items:end] [font-variant-numeric:tabular-nums] [cursor:help]">
                          <span>
                            {formatStockQty(productTotalStock(row))} {unitLabel(row.unit)}
                          </span>
                          {(row.branchStock?.length ?? 0) > 1 ? (
                            <small className="text-muted">
                              {row.branchStock?.filter((entry) => entry.quantity > 0).length ?? 0}{" "}
                              branches
                            </small>
                          ) : null}
                        </div>
                      </Tooltip>
                    </Td>
                  ) : null}
                  {show("minStock") ? <Td numeric>{formatStockQty(minimumStock)}</Td> : null}
                  {show("recommended") ? (
                    <Td numeric>
                      <strong>{formatStockQty(recommended)}</strong>
                    </Td>
                  ) : null}
                  {show("lastCost") ? (
                    <Td numeric>
                      <ProductCostDisplay product={row} stockCost={fifoCostForProduct(row, lots)} />
                    </Td>
                  ) : null}
                  {show("status") ? (
                    <Td>
                      <Badge tone={tone}>{stockLabel(row)}</Badge>
                    </Td>
                  ) : null}
                  <Td>
                    <div onClick={(event) => event.stopPropagation()}>
                      {tab === "low" ? (
                        <Button size="sm" variant="primary" onClick={() => openAddLot(row.id)}>
                          Add lot
                        </Button>
                      ) : (
                        <Menu>
                          <MenuItem icon={<Layers size={14} />} onClick={() => openAddLot(row.id)}>
                            Add lot
                          </MenuItem>
                          <MenuItem icon={<Pencil size={14} />} onClick={() => openEdit(row)}>
                            Edit
                          </MenuItem>
                          <MenuItem
                            danger
                            icon={<Trash2 size={14} />}
                            onClick={() => {
                              if (row.stock > 0 || row.claims > 0) setBlocked(true);
                              else setRemove(row);
                            }}
                          >
                            Delete
                          </MenuItem>
                        </Menu>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      <ProductDetailDrawer
        product={detail}
        lots={lots}
        salesProfit={detail ? productSalesStats(detail.id, salesStats).profit : 0}
        salesTotal={detail ? productSalesStats(detail.id, salesStats).sales : 0}
        salesQty={detail ? productSalesStats(detail.id, salesStats).quantity : 0}
        supplierLabel={
          detail ? supplierName(latestLot(detail.id)?.supplierId ?? "") || undefined : undefined
        }
        supplierName={supplierName}
        onClose={() => setDetail(null)}
        onEdit={(row) => {
          setDetail(null);
          openEdit(row);
        }}
        onAddLot={(productId) => {
          setDetail(null);
          openAddLot(productId);
        }}
      />

      <Drawer
        open={Boolean(edit)}
        size="lg"
        form
        dim={false}
        title={isNew ? "Add Product" : "Edit Product"}
        subtitle={
          <p className="product-keys [display:flex] [flex-wrap:wrap] [gap:8px_12px] [margin:0] [font-size:11px] [color:var(--muted)]">
            <span>
              <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
                Tab
              </kbd>{" "}
              Move
            </span>
            <span>
              <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
                Shift + Tab
              </kbd>{" "}
              Back
            </span>
            <span>
              <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
                Enter
              </kbd>{" "}
              Select
            </span>
            <span>
              <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
                F12
              </kbd>{" "}
              Save
            </span>
            <span>
              <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
                Esc
              </kbd>{" "}
              Close
            </span>
          </p>
        }
        onClose={() => setEdit(null)}
      >
        {edit ? (
          <ProductForm
            product={edit}
            catalog={rows}
            onChange={setEdit}
            onCommit={commit}
            onClose={() => setEdit(null)}
            saving={productLoading.saving}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={blocked}
        title="Cannot delete"
        body="This product still has lots or sales history. Clear those first."
        danger={false}
        confirmLabel="OK"
        onCancel={() => setBlocked(false)}
        onConfirm={() => setBlocked(false)}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete product?"
        body={`${remove?.name ?? "This product"} will be removed from the catalog.`}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) {
            setRemove(null);
            return;
          }
          setProductLoading((current) => ({ ...current, deleting: true }));
          void deleteProduct(remove.id)
            .then(() => refreshHub())
            .then(() => {
              setSelected((selectedIds) => selectedIds.filter((id) => id !== remove.id));
              toaster.success(PRODUCT_COPY.deleted);
              setRemove(null);
            })
            .catch((error) => {
              toaster.error(shortError(error, PRODUCT_COPY.deleteFailed));
            })
            .finally(() => {
              setProductLoading((current) => ({ ...current, deleting: false }));
            });
        }}
      />
      {lotDrawer}
    </div>
  );
}
