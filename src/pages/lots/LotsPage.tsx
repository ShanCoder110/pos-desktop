import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pencil, Plus, TrendingUp, Trash2, X } from "lucide-react";
import {
  BulkAction,
  BulkActions,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyRow,
  HubChart,
  Menu,
  MenuItem,
  PAGE_SIZE_ALL,
  Pagination,
  SearchableSelect,
  Table,
  TableRowsSkeleton,
  Td,
  THead,
  Th,
  dateInRange,
  rangeForPeriod,
} from "@/components/common";
import type { DateRangeFilter } from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { LotDetailDrawer } from "@/pages/lots/LotDetailDrawer";
import { useLotDrawer } from "@/pages/lots/useLotDrawer";
import { syncProductStock } from "@/pages/products/productLots";
import { DetailQtyDisplay } from "@/pages/products/DetailQtyDisplay";
import { ProductCostDisplay } from "@/pages/products/ProductCostDisplay";
import { lotCostInStockUnit } from "@/pages/products/productQty";
import type { Product } from "@/shared/types";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import { LOT_COPY, LOT_TABLE_COLUMNS } from "@/shared/constants/products";
import type { ProductLotRow } from "@/shared/domain/types";
import { money } from "@/utils/format";

function LotQty({
  product,
  qty,
  tone,
}: {
  product?: Product;
  qty: number;
  tone?: "ok" | "danger";
}) {
  return (
    <div
      className="product-qty [display:grid] [gap:1px] [justify-items:end] [font-variant-numeric:tabular-nums]"
      style={tone ? { color: tone === "danger" ? "var(--danger)" : "var(--sale)" } : undefined}
    >
      <DetailQtyDisplay product={product} qty={qty} />
    </div>
  );
}

function shortDate(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function signedMoney(value: number) {
  if (!value) return money(0);
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

export function LotsPage() {
  const {
    setActions,
    sectionKpi,
    lots: rows,
    setLots: setRows,
    products,
    setProducts,
    refreshLots,
    loading: hubLoading,
  } = useProductsHub();
  const { edit, nested, supplierRows, openCreate, openEdit, lotDrawer } = useLotDrawer();
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cols, setCols] = useState(LOT_TABLE_COLUMNS.map((c) => c.id));
  const [view, setView] = useState<HubView>("table");
  const [dateRange, setDateRange] = useState<DateRangeFilter>(() => rangeForPeriod("all"));
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<ProductLotRow | null>(null);
  const [remove, setRemove] = useState<ProductLotRow | null>(null);
  const [chartProductId, setChartProductId] = useState("");
  const [chartLotId, setChartLotId] = useState("");

  useEffect(() => {
    if (!chartProductId && products[0]) setChartProductId(products[0].id);
  }, [products, chartProductId]);

  useEffect(() => {
    setChartLotId("");
  }, [chartProductId]);

  function productOf(id: string) {
    return products.find((p) => p.id === id);
  }

  function productLabel(id: string) {
    return productOf(id)?.name ?? id;
  }

  function supplierLabel(id: string) {
    return supplierRows.find((supplier) => supplier.id === id)?.name ?? id;
  }

  function writeLots(nextLots: ProductLotRow[], productIds: string[]) {
    setRows(nextLots);
    setProducts((prev) =>
      productIds.reduce((acc, id) => syncProductStock(acc, nextLots, id), prev),
    );
  }

  function removeRow(row: ProductLotRow) {
    // Backend has no lot delete; remove locally for UX then reload from API.
    if (row.remainingQuantity < row.originalQuantity) setRemove(row);
    else {
      writeLots(
        rows.filter((x) => x.id !== row.id),
        [row.productId],
      );
      setSelected((s) => s.filter((id) => id !== row.id));
      void refreshLots();
    }
  }

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  useLayoutEffect(() => {
    setActions(
      <Button variant="primary" icon={<Plus size={14} />} onClick={() => openCreate()}>
        Add lot
        <kbd className="ui-kbd">F2</kbd>
      </Button>,
    );
    return () => setActions(null);
  }, [openCreate, setActions]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (edit || detail || remove || nested || event.key !== "F2") return;
      event.preventDefault();
      event.stopPropagation();
      openCreate();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [detail, edit, nested, openCreate, remove]);

  const productFilterOptions = useMemo(
    () => [...products].map((product) => product.name).sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const status = chips.find((c) => c.field === "status")?.value;
    const productFilter = chips.find((c) => c.field === "product")?.value;
    const productId = productFilter
      ? products.find((product) => product.name === productFilter)?.id
      : undefined;
    return rows.filter((r) => {
      if (!dateInRange(r.receivedAt, dateRange)) return false;
      if (productId && r.productId !== productId) return false;
      if (needle) {
        const text =
          `${r.lotNumber} ${productLabel(r.productId)} ${supplierLabel(r.supplierId)}`.toLowerCase();
        if (!text.includes(needle)) return false;
      }
      if (sectionKpi === "open") return r.remainingQuantity > 0;
      if (sectionKpi === "empty") return r.remainingQuantity <= 0;
      if (status === "Remaining") return r.remainingQuantity > 0;
      if (status === "Empty") return r.remainingQuantity <= 0;
      return true;
    });
  }, [rows, q, chips, sectionKpi, products, supplierRows, dateRange]);

  const chartHistory = useMemo(() => {
    const lots = filtered
      .filter((lot) => lot.productId === chartProductId)
      .slice()
      .sort(
        (a, b) =>
          a.receivedAt.localeCompare(b.receivedAt) || a.lotNumber.localeCompare(b.lotNumber),
      );
    return lots.map((lot, index) => {
      const previous = lots[index - 1];
      const change = previous ? lot.purchasePrice - previous.purchasePrice : 0;
      return { lot, change, previous };
    });
  }, [filtered, chartProductId]);

  const chartData = useMemo(
    () =>
      chartHistory.map(({ lot, change, previous }) => ({
        id: lot.id,
        label: lot.receivedAt,
        value: lot.purchasePrice,
        up: change > 0,
        details: [
          { label: "Lot", value: lot.lotNumber },
          { label: "Supplier", value: supplierLabel(lot.supplierId) },
          { label: "Cost", value: money(lot.purchasePrice) },
          {
            label: "Change",
            value: previous ? `${signedMoney(change)} vs ${previous.lotNumber}` : "First lot",
          },
        ],
      })),
    [chartHistory, supplierRows],
  );

  const chartIncreases = chartHistory.filter((row) => row.change > 0);
  const lastIncrease = chartIncreases[chartIncreases.length - 1];
  const chartProduct = productOf(chartProductId);

  const pages = pageSize === PAGE_SIZE_ALL ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown =
    pageSize === PAGE_SIZE_ALL ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const show = (id: string) => cols.includes(id);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      <Table
        toolbar={
          <HubToolbar
            columns={LOT_TABLE_COLUMNS}
            cols={cols}
            onCols={setCols}
            chips={chips}
            onApply={(chip) => {
              setChips((prev) => [...prev.filter((c) => c.field !== chip.field), chip]);
              setPage(1);
            }}
            onRemove={(field) => {
              setChips((c) => c.filter((x) => x.field !== field));
              setPage(1);
            }}
            onClear={() => {
              setChips([]);
              setPage(1);
            }}
            filterFields={[
              {
                id: "product",
                label: LOT_COPY.filterProduct,
                options: productFilterOptions,
                searchable: true,
              },
              {
                id: "status",
                label: LOT_COPY.filterStatus,
                options: ["Remaining", "Empty"],
              },
            ]}
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search lots"
            view={view}
            onView={setView}
            dateRange={dateRange}
            onDateRange={(range) => {
              setDateRange(range);
              setPage(1);
            }}
            insightControls={
              view === "insights" ? (
                <SearchableSelect
                  className="w-[240px] [&_.ui-combo-field]:h-8 [&_.ui-combo-input]:text-[11px]"
                  value={chartProductId}
                  options={products.map((product) => ({
                    value: product.id,
                    label: `${product.name} · ${product.sku}`,
                  }))}
                  onChange={setChartProductId}
                  placeholder="Choose product"
                  searchPlaceholder="Search products"
                  clearable={false}
                />
              ) : null
            }
            trailing={
              selected.length > 0 ? (
                <BulkActions count={selected.length}>
                  <BulkAction
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() => {
                      const blocked = rows.find(
                        (r) => selected.includes(r.id) && r.remainingQuantity < r.originalQuantity,
                      );
                      if (blocked) {
                        setRemove(blocked);
                        return;
                      }
                      const ids = [
                        ...new Set(
                          rows.filter((r) => selected.includes(r.id)).map((r) => r.productId),
                        ),
                      ];
                      writeLots(
                        rows.filter((r) => !selected.includes(r.id)),
                        ids,
                      );
                      setSelected([]);
                    }}
                  >
                    Delete
                  </BulkAction>
                </BulkActions>
              ) : null
            }
          />
        }
        body={
          view === "insights" ? (
            <HubChart
              type="line"
              title={`${chartProduct?.name ?? "Product"} lot cost`}
              subtitle={
                lastIncrease
                  ? `${chartHistory.length} lots · ${chartIncreases.length} increase${chartIncreases.length === 1 ? "" : "s"} · last up ${signedMoney(lastIncrease.change)} on ${shortDate(lastIncrease.lot.receivedAt)}`
                  : `${chartHistory.length} lots in the selected dates · no price increase yet`
              }
              data={chartData}
              formatValue={money}
              selectedId={chartLotId}
              onPointClick={(point) => setChartLotId(point.id ?? "")}
              sidePanel={
                chartProduct ? (
                  <aside className="w-[320px] shrink-0 bg-bg/20 p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-accent-deep">
                          Price history
                        </span>
                        <h3 className="mt-1 truncate text-[16px] font-extrabold text-ink">
                          {chartProduct.name}
                        </h3>
                        <p className="mt-1 text-[10px] text-muted">
                          {chartProduct.sku} · cost per {chartProduct.unit || "unit"}
                        </p>
                      </div>
                      {chartLotId ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Clear lot"
                          onClick={() => setChartLotId("")}
                        >
                          <X size={15} />
                        </Button>
                      ) : null}
                    </div>
                    {chartIncreases.length ? (
                      <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-2 text-[10px]">
                        <TrendingUp size={14} style={{ color: "var(--danger)" }} />
                        <span className="text-muted">
                          {chartIncreases
                            .map(
                              (row) =>
                                `${row.lot.lotNumber} ${shortDate(row.lot.receivedAt)} ${signedMoney(row.change)}`,
                            )
                            .join(" · ")}
                        </span>
                      </div>
                    ) : null}
                    <div className="grid gap-2">
                      {chartHistory.length === 0 ? (
                        <p className="m-0 text-[11px] text-muted">
                          No lots for this product in the current filters.
                        </p>
                      ) : (
                        chartHistory.map(({ lot, change, previous }) => {
                          const active = chartLotId === lot.id;
                          return (
                            <button
                              key={lot.id}
                              type="button"
                              className={`grid gap-1 rounded-lg border p-2.5 text-left ${active ? "border-accent bg-accent-bg/70" : "border-line bg-paper"}`}
                              onClick={() => setChartLotId(lot.id)}
                            >
                              <span className="flex items-center justify-between gap-3">
                                <strong className="text-[11px] text-ink">{lot.lotNumber}</strong>
                                <b className="text-[11px] tabular-nums text-ink">
                                  {money(lot.purchasePrice)}
                                </b>
                              </span>
                              <span className="flex items-center justify-between gap-3 text-[10px] text-muted">
                                <span>
                                  {shortDate(lot.receivedAt)} · {supplierLabel(lot.supplierId)}
                                </span>
                                <span
                                  style={{
                                    color:
                                      change > 0
                                        ? "var(--danger)"
                                        : change < 0
                                          ? "var(--sale)"
                                          : undefined,
                                    fontWeight: change > 0 ? 700 : undefined,
                                  }}
                                >
                                  {previous ? signedMoney(change) : "Opening"}
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </aside>
                ) : undefined
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
            <Th>Lot</Th>
            {show("product") ? <Th>Product</Th> : null}
            {show("supplier") ? <Th>Supplier</Th> : null}
            {show("cost") ? <Th>Cost</Th> : null}
            {show("original") ? <Th>Original</Th> : null}
            {show("left") ? <Th>Left</Th> : null}
            {show("damaged") ? <Th>Damaged</Th> : null}
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {hubLoading.hub || hubLoading.lots ? (
            <TableRowsSkeleton columnCount={cols.length} rows={6} selectable hasActions />
          ) : null}
          {!hubLoading.hub && !hubLoading.lots && shown.length === 0 ? (
            <EmptyRow cols={cols.length + 2} />
          ) : null}
          {!hubLoading.hub && !hubLoading.lots
            ? shown.map((row) => (
                <tr key={row.id} className="cursor-pointer" onClick={() => setDetail(row)}>
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
                  <Td>{row.lotNumber}</Td>
                  {show("product") ? <Td>{productLabel(row.productId)}</Td> : null}
                  {show("supplier") ? <Td>{supplierLabel(row.supplierId)}</Td> : null}
                  {show("cost") ? (
                    <Td numeric>
                      {(() => {
                        const product = productOf(row.productId);
                        if (!product) return money(row.purchasePrice);
                        return (
                          <ProductCostDisplay
                            product={product}
                            stockCost={lotCostInStockUnit(product, row.purchasePrice)}
                          />
                        );
                      })()}
                    </Td>
                  ) : null}
                  {show("original") ? (
                    <Td numeric>
                      <LotQty product={productOf(row.productId)} qty={row.originalQuantity} />
                    </Td>
                  ) : null}
                  {show("left") ? (
                    <Td numeric>
                      <LotQty
                        product={productOf(row.productId)}
                        qty={row.remainingQuantity}
                        tone={row.remainingQuantity <= 0 ? "danger" : "ok"}
                      />
                    </Td>
                  ) : null}
                  {show("damaged") ? (
                    <Td numeric>
                      <LotQty product={productOf(row.productId)} qty={row.damagedQuantity} />
                    </Td>
                  ) : null}
                  <Td>
                    <div onClick={(event) => event.stopPropagation()}>
                      <Menu>
                        <MenuItem icon={<Pencil size={14} />} onClick={() => openEdit(row)}>
                          Edit
                        </MenuItem>
                        <MenuItem danger icon={<Trash2 size={14} />} onClick={() => removeRow(row)}>
                          Delete
                        </MenuItem>
                      </Menu>
                    </div>
                  </Td>
                </tr>
              ))
            : null}
        </tbody>
      </Table>

      {lotDrawer}

      <LotDetailDrawer
        lot={detail}
        product={detail ? productOf(detail.productId) : undefined}
        supplierLabel={detail ? supplierLabel(detail.supplierId) : undefined}
        onClose={() => setDetail(null)}
        onEdit={(row) => {
          setDetail(null);
          openEdit(row);
        }}
        onReorder={(productId) => openCreate(productId)}
      />

      <ConfirmDialog
        open={Boolean(remove)}
        title="Cannot delete lot"
        body="Sales already used this lot. Remaining stock must stay for history."
        danger={false}
        confirmLabel="OK"
        onCancel={() => setRemove(null)}
        onConfirm={() => setRemove(null)}
      />
    </div>
  );
}
