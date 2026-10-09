import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pencil, Plus, ShoppingCart, TrendingUp, Trash2, X } from "lucide-react";
import { QuickReorderPopover } from "@/components/reorders/QuickReorderPopover";
import { REORDER_COPY } from "@/shared/constants/reorders";
import {
  BulkAction,
  BulkActions,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyRow,
  HubExportMenu,
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
  rangeForPeriod,
} from "@/components/common";
import type { DateRangeFilter } from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { applyFilterChip, chipValuesForField } from "@/utils/filterChips";
import { chipCsv, chipCsvFromNames, chipMinNumber } from "@/utils/filterQuery";
import { createLoadGuard, isAbortError } from "@/utils/async";
import { listAllLots, listLots, mapLotResponse } from "@/services/lots";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { LotDetailDrawer } from "@/pages/lots/LotDetailDrawer";
import { useLotDrawer } from "@/pages/lots/useLotDrawer";
import { syncProductStock } from "@/pages/products/productLots";
import { DetailQtyDisplay } from "@/pages/products/DetailQtyDisplay";
import { CostBreakdownTooltip } from "@/pages/products/ProductPricingTooltip";
import {
  hubCityOptions,
  hubSupplierOptions,
  supplierCityName,
  supplierLabel as hubSupplierLabel,
} from "@/pages/products/hubSupplierFilters";
import { lotCostInStockUnit } from "@/pages/products/productQty";
import type { Product } from "@/shared/types";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import { LOT_COPY, LOT_FILTER_FIELDS, LOT_TABLE_COLUMNS } from "@/shared/constants/products";
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

function lotValueLeft(product: Product | undefined, lot: ProductLotRow) {
  const unitCost = product ? lotCostInStockUnit(product, lot.purchasePrice) : lot.purchasePrice;
  return lot.remainingQuantity * unitCost;
}

function lotApiFilters(
  chips: FilterChip[],
  search: string,
  dateRange: DateRangeFilter,
  sectionKpi: string | null,
  products: Product[],
  suppliers: { id: string; name: string }[],
) {
  const statusFromChips = chipCsv(chips, "status");
  return {
    search: search.trim() || undefined,
    productId: chipCsvFromNames(
      chipValuesForField(chips, "product"),
      (name) => products.find((product) => product.name === name)?.id,
    ),
    supplierId: chipCsvFromNames(
      chipValuesForField(chips, "supplier"),
      (name) => suppliers.find((supplier) => supplier.name === name)?.id,
    ),
    city: chipCsv(chips, "city"),
    lotStatus:
      sectionKpi === "open" ? "Remaining" : sectionKpi === "empty" ? "Empty" : statusFromChips,
    occurredFrom: dateRange.from || undefined,
    occurredTo: dateRange.to || undefined,
    minValueLeft: chipMinNumber(chips, "valueLeft"),
  };
}

export function LotsPage() {
  const {
    setActions,
    sectionKpi,
    products,
    setProducts,
    setLots: syncHubLots,
    refreshLots,
    suppliers,
  } = useProductsHub();
  const [rows, setRows] = useState<ProductLotRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<ProductLotRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [filteredValueTotal, setFilteredValueTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { edit, nested, supplierRows, openCreate, openEdit, unlinkLot, lotDrawer } = useLotDrawer();
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
  const [reorderLotId, setReorderLotId] = useState<string | null>(null);
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
    return hubSupplierLabel(id, suppliers, supplierRows);
  }

  function cityLabel(id: string) {
    return supplierCityName(id, suppliers, supplierRows);
  }

  const apiFilters = useMemo(
    () => lotApiFilters(chips, q, dateRange, sectionKpi, products, suppliers),
    [chips, dateRange, products, q, sectionKpi, suppliers],
  );

  useEffect(() => {
    setPage(1);
  }, [apiFilters]);

  useEffect(() => {
    const controller = new AbortController();
    const guard = createLoadGuard();
    setLoading(true);
    const load =
      pageSize === PAGE_SIZE_ALL
        ? listAllLots(apiFilters, controller.signal).then((data) => ({
            rows: data,
            total: data.length,
            pages: 1,
          }))
        : listLots({ ...apiFilters, page, perPage: pageSize }, controller.signal).then(
            (response) => ({
              rows: response.data.map(mapLotResponse),
              total: response.meta.totalItems,
              pages: Math.max(1, response.meta.totalPages),
            }),
          );
    void load
      .then((response) => {
        if (!guard.isActive()) return;
        setRows(response.rows);
        setTotal(response.total);
        setPages(response.pages);
      })
      .catch((error) => {
        if (isAbortError(error) || !guard.isActive()) return;
        setRows([]);
        setTotal(0);
        setPages(1);
      })
      .finally(() => {
        if (guard.isActive()) setLoading(false);
      });
    return () => {
      guard.dispose();
      controller.abort();
    };
  }, [apiFilters, page, pageSize]);

  useEffect(() => {
    const controller = new AbortController();
    void listAllLots(apiFilters, controller.signal)
      .then((data) => {
        setFilteredRows(data);
        setFilteredValueTotal(
          data.reduce((sum, lot) => {
            const product = products.find((item) => item.id === lot.productId);
            return sum + lotValueLeft(product, lot);
          }, 0),
        );
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        setFilteredRows([]);
        setFilteredValueTotal(0);
      });
    return () => controller.abort();
  }, [apiFilters, products]);

  function writeLots(nextLots: ProductLotRow[], productIds: string[]) {
    setRows(nextLots);
    syncHubLots(nextLots);
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

  const supplierOptions = useMemo(
    () => hubSupplierOptions(suppliers, supplierRows),
    [suppliers, supplierRows],
  );
  const cityOptions = useMemo(
    () => hubCityOptions(suppliers, supplierRows),
    [suppliers, supplierRows],
  );
  const productFilterOptions = useMemo(
    () => [...products].map((product) => product.name).sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const filterFields = useMemo(
    () =>
      LOT_FILTER_FIELDS.map((field) => {
        if (field.id === "product") return { ...field, options: productFilterOptions };
        if (field.id === "supplier") return { ...field, options: supplierOptions };
        if (field.id === "city") return { ...field, options: cityOptions };
        return field;
      }),
    [cityOptions, productFilterOptions, supplierOptions],
  );

  const shown = rows;
  const listPages = pageSize === PAGE_SIZE_ALL ? 1 : pages;
  const listTotal = pageSize === PAGE_SIZE_ALL ? rows.length : total;

  useLayoutEffect(() => {
    setActions(
      <>
        <HubExportMenu
          filename="lots"
          sheetName="Lots"
          rows={filteredRows}
          columns={[
            { label: "Lot", value: (row) => row.lotNumber },
            { label: "Product", value: (row) => productLabel(row.productId) },
            { label: "Supplier", value: (row) => supplierLabel(row.supplierId) },
            { label: "City", value: (row) => cityLabel(row.supplierId) || "—" },
            { label: "Cost", value: (row) => row.purchasePrice },
            {
              label: LOT_COPY.valueLeftColumn,
              value: (row) => lotValueLeft(productOf(row.productId), row),
            },
            { label: "Original", value: (row) => row.originalQuantity },
            { label: "Remaining", value: (row) => row.remainingQuantity },
            { label: "Damaged", value: (row) => row.damagedQuantity },
            { label: "Received", value: (row) => row.receivedAt },
          ]}
        />
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => openCreate()}>
          Add lot
          <kbd className="ui-kbd">F2</kbd>
        </Button>
      </>,
    );
    return () => setActions(null);
  }, [filteredRows, openCreate, setActions]);

  const chartHistory = useMemo(() => {
    const lots = filteredRows
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
  }, [filteredRows, chartProductId]);

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
              setChips((prev) => applyFilterChip(prev, chip));
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
            filterFields={filterFields}
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search lot, product, supplier, city"
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
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-3 py-2 text-[12px] text-muted">
              <span>
                {LOT_COPY.filteredValueTotal}:{" "}
                <strong className="font-semibold text-ink tabular-nums">
                  {money(filteredValueTotal)}
                </strong>
              </span>
            </div>
            <Pagination
              page={Math.min(page, listPages)}
              pages={listPages}
              total={listTotal}
              pageSize={pageSize}
              onPageSize={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              onChange={setPage}
            />
          </div>
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
            {show("city") ? <Th>{LOT_COPY.filterCity}</Th> : null}
            {show("cost") ? <Th>Cost</Th> : null}
            {show("value") ? <Th>{LOT_COPY.valueLeftColumn}</Th> : null}
            {show("original") ? <Th>Original</Th> : null}
            {show("left") ? <Th>Left</Th> : null}
            {show("damaged") ? <Th>Damaged</Th> : null}
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {loading ? (
            <TableRowsSkeleton columnCount={cols.length} rows={6} selectable hasActions />
          ) : null}
          {!loading && shown.length === 0 ? <EmptyRow cols={cols.length + 2} /> : null}
          {!loading
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
                  {show("city") ? <Td>{cityLabel(row.supplierId) || "—"}</Td> : null}
                  {show("cost") ? (
                    <Td numeric>
                      {(() => {
                        const product = productOf(row.productId);
                        if (!product) return money(row.purchasePrice);
                        const stockCost = lotCostInStockUnit(product, row.purchasePrice);
                        return <CostBreakdownTooltip product={product} stockCost={stockCost} />;
                      })()}
                    </Td>
                  ) : null}
                  {show("value") ? (
                    <Td numeric>{money(lotValueLeft(productOf(row.productId), row))}</Td>
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
                    <div
                      className="relative flex items-center justify-end"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {reorderLotId === row.id && productOf(row.productId) ? (
                        <QuickReorderPopover
                          product={productOf(row.productId)!}
                          lots={rows}
                          suppliers={suppliers.length ? suppliers : supplierRows}
                          onClose={() => setReorderLotId(null)}
                          onCreated={() => setReorderLotId(null)}
                        />
                      ) : null}
                      <Menu>
                        <MenuItem
                          icon={<ShoppingCart size={14} />}
                          onClick={() => setReorderLotId(row.id)}
                        >
                          {REORDER_COPY.createAction}
                        </MenuItem>
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
        onReorder={(productId) => {
          setDetail(null);
          const lot = rows.find((row) => row.productId === productId);
          setReorderLotId(lot?.id ?? null);
        }}
        onUnlink={(lot) => {
          void unlinkLot(lot).then(() =>
            setDetail((current) =>
              current?.id === lot.id
                ? {
                    ...current,
                    purchaseOrderId: null,
                    purchaseOrderNumber: null,
                    purchaseOrderStatus: null,
                  }
                : current,
            ),
          );
        }}
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
