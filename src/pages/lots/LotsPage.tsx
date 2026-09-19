import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Pencil, Plus, TrendingUp, Trash2, X } from "lucide-react";
import {
  BulkAction,
  BulkActions,
  Button,
  Checkbox,
  ConfirmDialog,
  Drawer,
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
  toaster,
  dateInRange,
  rangeForPeriod,
} from "@/components/common";
import type { DateRangeFilter } from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { LotForm } from "@/pages/lots/LotForm";
import { nextLotNumber, syncProductStock } from "@/pages/products/productLots";
import { formatStockQty, priceBreakdown, qtyBreakdown } from "@/pages/products/productQty";
import type { Product } from "@/shared/types";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/constants/config";
import { LOT_TABLE_COLUMNS } from "@/shared/constants/products";
import type { ProductLotRow, SupplierRow } from "@/shared/domain/types";
import { money } from "@/utils/format";
import { listMasterRecords, createMasterRecord } from "@/services/masters";
import { receiveLot, receivePayloadFromLot } from "@/services/lots";

function newLot(rows: ProductLotRow[]): ProductLotRow {
  return {
    id: crypto.randomUUID(),
    productId: "",
    supplierId: "",
    lotNumber: nextLotNumber(rows),
    purchasePrice: 0,
    minimumPrice: 0,
    wholesalePrice: 0,
    retailPrice: 0,
    originalQuantity: 0,
    remainingQuantity: 0,
    damagedQuantity: 0,
    receivedAt: new Date().toISOString().slice(0, 10),
    expiryDate: null,
    createdBy: "u1",
  };
}

function LotQty({
  product,
  qty,
  tone,
}: {
  product?: Product;
  qty: number;
  tone?: "ok" | "danger";
}) {
  const rows = product ? qtyBreakdown(product, qty) : [{ id: "qty", name: "", qty }];
  return (
    <div className="product-qty [display:grid] [gap:1px] [justify-items:end] [font-variant-numeric:tabular-nums]">
      {rows.map((row) => (
        <span
          key={row.id || row.name}
          style={tone ? { color: tone === "danger" ? "var(--danger)" : "var(--sale)" } : undefined}
        >
          {formatStockQty(row.qty)}
          {row.name ? ` ${row.name}` : ""}
        </span>
      ))}
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

function LotCost({ product, price }: { product?: Product; price: number }) {
  if (!product) return money(price);
  return (
    <div className="product-unit-prices grid justify-items-end gap-1 [font-variant-numeric:tabular-nums]">
      {priceBreakdown(product, price).map((row) => (
        <span key={row.id} className="whitespace-nowrap">
          {money(row.value)} <small className="font-medium text-muted">/ {row.name}</small>
        </span>
      ))}
    </div>
  );
}

export function LotsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    setActions,
    sectionKpi,
    lots: rows,
    setLots: setRows,
    products,
    setProducts,
    refreshHub,
    refreshLots,
    refreshProducts,
    loading: hubLoading,
  } = useProductsHub();
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cols, setCols] = useState(LOT_TABLE_COLUMNS.map((c) => c.id));
  const [view, setView] = useState<HubView>("table");
  const [dateRange, setDateRange] = useState<DateRangeFilter>(() => rangeForPeriod("all"));
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<ProductLotRow | null>(null);
  const [remove, setRemove] = useState<ProductLotRow | null>(null);
  const [supplierRows, setSupplierRows] = useState<SupplierRow[]>([]);
  const [apiSupplierIds, setApiSupplierIds] = useState<Set<string>>(() => new Set());
  const [chartProductId, setChartProductId] = useState("");
  const [chartLotId, setChartLotId] = useState("");
  const [loading, setLoading] = useState({ suppliers: true, saving: false });

  useEffect(() => {
    const controller = new AbortController();
    listMasterRecords("suppliers", { perPage: MAX_PAGE_SIZE }, controller.signal)
      .then((response) => {
        setSupplierRows(
          response.data.map((record) => ({
            id: record.id,
            name: record.name,
            phone: record.phone ?? "",
            email: record.email ?? "",
            address: record.address ?? "",
            notes: record.notes ?? "",
            currentBalance: record.balance ?? 0,
            isActive: record.isActive,
          })),
        );
        setApiSupplierIds(new Set(response.data.map((record) => record.id)));
      })
      .catch(() => {
        setSupplierRows([]);
        setApiSupplierIds(new Set());
      })
      .finally(() => setLoading((current) => ({ ...current, suppliers: false })));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!chartProductId && products[0]) setChartProductId(products[0].id);
  }, [products, chartProductId]);

  function newLotForProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    const previous = [...rows]
      .filter((lot) => lot.productId === productId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    return {
      ...newLot(rows),
      productId,
      supplierId: previous?.supplierId ?? product?.supplierId ?? "",
      purchasePrice: previous?.purchasePrice ?? product?.cost ?? 0,
      minimumPrice: previous?.minimumPrice ?? product?.min ?? 0,
      wholesalePrice: previous?.wholesalePrice ?? product?.wholesale ?? 0,
      retailPrice: previous?.retailPrice ?? product?.retail ?? 0,
    };
  }

  useEffect(() => {
    const productId = (location.state as { addLotProductId?: string } | null)?.addLotProductId;
    if (!productId) return;
    setEdit(newLotForProduct(productId));
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [location.pathname, location.search, location.state]);

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

  function createSupplier(name: string) {
    const cleanName = name.trim();
    const existing = supplierRows.find(
      (supplier) => supplier.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );
    if (existing) return existing.id;
    const supplier: SupplierRow = {
      id: crypto.randomUUID(),
      name: cleanName,
      phone: "",
      email: "",
      address: "",
      notes: "Added while receiving stock",
      currentBalance: 0,
      isActive: true,
    };
    setSupplierRows((current) => [...current, supplier]);
    return supplier.id;
  }

  function writeLots(nextLots: ProductLotRow[], productIds: string[]) {
    setRows(nextLots);
    setProducts((prev) =>
      productIds.reduce((acc, id) => syncProductStock(acc, nextLots, id), prev),
    );
  }

  async function saveLot(lot: ProductLotRow) {
    const exists = rows.some((row) => row.id === lot.id);
    if (!exists) {
      if (loading.saving) return;
      setLoading((current) => ({ ...current, saving: true }));
      try {
        let supplierId = lot.supplierId;
        if (supplierId && !apiSupplierIds.has(supplierId)) {
          const local = supplierRows.find((row) => row.id === supplierId);
          if (local) {
            const created = await createMasterRecord("suppliers", {
              name: local.name,
              notes: local.notes || "Added while receiving stock",
              isActive: true,
            });
            supplierId = created.id;
            setApiSupplierIds((prev) => new Set([...prev, created.id]));
            setSupplierRows((current) =>
              current.map((row) =>
                row.id === local.id
                  ? {
                      id: created.id,
                      name: created.name,
                      phone: created.phone ?? "",
                      email: created.email ?? "",
                      address: created.address ?? "",
                      notes: created.notes ?? "",
                      currentBalance: created.balance ?? 0,
                      isActive: created.isActive,
                    }
                  : row,
              ),
            );
          }
        }
        await receiveLot(receivePayloadFromLot({ ...lot, supplierId }));
        await Promise.all([refreshLots(), refreshProducts()]);
        toaster.success("Lot added");
        setEdit(null);
      } catch (error) {
        toaster.error(error instanceof Error ? error.message : "Could not receive lot");
      } finally {
        setLoading((current) => ({ ...current, saving: false }));
      }
      return;
    }

    const damagedQuantity = Math.min(Math.max(0, lot.damagedQuantity), lot.originalQuantity);
    const next = {
      ...lot,
      damagedQuantity,
      remainingQuantity: Math.max(
        0,
        Math.min(lot.remainingQuantity, lot.originalQuantity - damagedQuantity),
      ),
    };
    const previous = rows.find((row) => row.id === next.id);
    const list = rows.map((row) => (row.id === next.id ? next : row));
    writeLots(list, [
      ...new Set([next.productId, previous?.productId].filter(Boolean) as string[]),
    ]);
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== next.productId) return product;
        return {
          ...product,
          supplierId: next.supplierId,
          cost: next.purchasePrice,
          min: next.minimumPrice,
          wholesale: next.wholesalePrice,
          retail: next.retailPrice,
          sellUnits: product.sellUnits?.map((unit) =>
            unit.kind === "base" || unit.symbol === product.unit
              ? {
                  ...unit,
                  cost: next.purchasePrice,
                  min: next.minimumPrice,
                  wholesale: next.wholesalePrice,
                  price: next.retailPrice,
                }
              : unit,
          ),
        };
      }),
    );
    toaster.success("Lot updated");
    setEdit(null);
    void refreshHub();
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
      <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit(newLot(rows))}>
        Add lot
        <kbd className="ui-kbd">F2</kbd>
      </Button>,
    );
    return () => setActions(null);
  }, [rows, setActions]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (edit || remove || event.key !== "F2") return;
      event.preventDefault();
      event.stopPropagation();
      setEdit(newLot(rows));
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [edit, remove, rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const status = chips.find((c) => c.field === "status")?.value;
    return rows.filter((r) => {
      if (!dateInRange(r.receivedAt, dateRange)) return false;
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
            filterFields={[{ id: "status", label: "Status", options: ["Remaining", "Empty"] }]}
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
                <tr key={row.id}>
                  <Td className="ui-check-col">
                    <Checkbox
                      checked={selected.includes(row.id)}
                      onChange={(e) => {
                        setSelected((s) =>
                          e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id),
                        );
                      }}
                    />
                  </Td>
                  <Td>{row.lotNumber}</Td>
                  {show("product") ? <Td>{productLabel(row.productId)}</Td> : null}
                  {show("supplier") ? <Td>{supplierLabel(row.supplierId)}</Td> : null}
                  {show("cost") ? (
                    <Td numeric>
                      <LotCost product={productOf(row.productId)} price={row.purchasePrice} />
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
                    <Menu>
                      <MenuItem icon={<Pencil size={14} />} onClick={() => setEdit(row)}>
                        Edit
                      </MenuItem>
                      <MenuItem danger icon={<Trash2 size={14} />} onClick={() => removeRow(row)}>
                        Delete
                      </MenuItem>
                    </Menu>
                  </Td>
                </tr>
              ))
            : null}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(edit)}
        size="xl"
        form
        dim={false}
        title={edit && rows.some((row) => row.id === edit.id) ? "Edit lot" : "Add lot"}
        subtitle={
          <p className="m-0 text-[10px] text-muted">
            Search and select a product, then complete the form using Enter.
          </p>
        }
        onClose={() => setEdit(null)}
      >
        {edit ? (
          <LotForm
            lot={edit}
            lots={rows}
            products={products}
            suppliers={supplierRows}
            isNew={!rows.some((row) => row.id === edit.id)}
            onCreateSupplier={createSupplier}
            onChange={setEdit}
            onSave={saveLot}
            onClose={() => setEdit(null)}
          />
        ) : null}
      </Drawer>

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
