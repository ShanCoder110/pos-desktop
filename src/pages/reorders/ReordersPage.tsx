import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Ban, PackagePlus, ShoppingCart } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyRow,
  HubExportMenu,
  PAGE_SIZE_ALL,
  Pagination,
  Table,
  TableRowsSkeleton,
  Td,
  THead,
  Th,
  rangeForPeriod,
  toaster,
} from "@/components/common";
import type { DateRangeFilter } from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { applyFilterChip, chipValuesForField } from "@/utils/filterChips";
import { chipCsv, chipCsvFromNames, chipMinNumber, chipStatusCsv } from "@/utils/filterQuery";
import { HubToolbar } from "@/pages/products/HubToolbar";
import {
  hubCityOptions,
  hubSupplierOptions,
  supplierCityName,
  supplierLabel,
} from "@/pages/products/hubSupplierFilters";
import { useLotDrawer } from "@/pages/lots/useLotDrawer";
import { ReorderCreateDrawer } from "@/pages/reorders/ReorderCreateDrawer";
import { ReorderDetailDrawer } from "@/pages/reorders/ReorderDetailDrawer";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { CostBreakdownTooltip } from "@/pages/products/ProductPricingTooltip";
import { formatStockQty } from "@/pages/products/productQty";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import {
  REORDER_COPY,
  REORDER_FILTER_FIELDS,
  REORDER_STATUS_LABEL,
  type ReorderStatus,
} from "@/shared/constants/reorders";
import {
  cancelPurchaseOrder,
  getPurchaseOrder,
  listAllPurchaseOrders,
  listPurchaseOrders,
  type PurchaseOrder,
} from "@/services/purchasing";
import { money, shortError } from "@/utils/format";

const COLUMNS = [
  { id: "product", label: "Product" },
  { id: "supplier", label: "Supplier" },
  { id: "city", label: REORDER_COPY.cityColumn },
  { id: "ordered", label: "Qty ordered" },
  { id: "received", label: "Qty received" },
  { id: "status", label: "Status" },
  { id: "date", label: "Date" },
  { id: "unitCost", label: REORDER_COPY.unitCostColumn },
  { id: "lineTotal", label: REORDER_COPY.lineTotalColumn },
];

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "RECEIVED") return "ok";
  if (status === "PARTIALLY_RECEIVED") return "warn";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

function isOpen(row: PurchaseOrder) {
  return row.status === "PENDING" || row.status === "PARTIALLY_RECEIVED";
}

const REORDER_STATUS_FROM_LABEL = Object.fromEntries(
  Object.entries(REORDER_STATUS_LABEL).map(([status, label]) => [label, status]),
) as Record<string, ReorderStatus>;

function reorderApiFilters(
  chips: FilterChip[],
  search: string,
  dateRange: DateRangeFilter,
  sectionKpi: string | null,
  suppliers: { id: string; name: string }[],
  products: { id: string; name: string }[],
) {
  const statusFromChips = chipStatusCsv(
    chips,
    "status",
    (label) => REORDER_STATUS_FROM_LABEL[label],
  );
  return {
    search: search.trim() || undefined,
    status: sectionKpi || statusFromChips,
    supplierId: chipCsvFromNames(
      chipValuesForField(chips, "supplier"),
      (name) => suppliers.find((row) => row.name === name)?.id,
    ),
    productId: chipCsvFromNames(
      chipValuesForField(chips, "product"),
      (name) => products.find((row) => row.name === name)?.id,
    ),
    city: chipCsv(chips, "city"),
    minTotal: chipMinNumber(chips, "lineTotal"),
    occurredFrom: dateRange.from || undefined,
    occurredTo: dateRange.to || undefined,
  };
}

export function ReordersPage() {
  const { setActions, products, suppliers, lots, sectionKpi, purchaseOrders, refreshHub } =
    useProductsHub();
  const { openCreate, lotDrawer } = useLotDrawer();
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeFilter>(() => rangeForPeriod("all"));
  const [cols] = useState(COLUMNS.map((col) => col.id));
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [filteredTotalCost, setFilteredTotalCost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cancelRow, setCancelRow] = useState<PurchaseOrder | null>(null);
  const [viewRow, setViewRow] = useState<PurchaseOrder | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const apiFilters = useMemo(
    () => reorderApiFilters(chips, search, dateRange, sectionKpi, suppliers, products),
    [chips, dateRange, products, search, sectionKpi, suppliers],
  );

  useEffect(() => {
    setPage(1);
  }, [sectionKpi, chips, search, dateRange]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void listPurchaseOrders({ ...apiFilters, page, perPage: pageSize }, controller.signal)
      .then((response) => {
        setRows(response.data);
        setTotal(response.meta.totalItems);
        setPages(Math.max(1, response.meta.totalPages));
      })
      .catch((error) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        setRows([]);
        setTotal(0);
        setPages(1);
        toaster.error(shortError(error, REORDER_COPY.createFailed));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [apiFilters, page, pageSize, purchaseOrders]);

  useEffect(() => {
    const controller = new AbortController();
    void listAllPurchaseOrders(apiFilters, controller.signal)
      .then((data) => setFilteredTotalCost(data.reduce((sum, row) => sum + row.total, 0)))
      .catch(() => setFilteredTotalCost(0));
    return () => controller.abort();
  }, [apiFilters, purchaseOrders]);

  const productName = (id: string) => products.find((row) => row.id === id)?.name ?? id;
  const supplierOptions = useMemo(() => hubSupplierOptions(suppliers), [suppliers]);
  const cityOptions = useMemo(() => hubCityOptions(suppliers), [suppliers]);
  const productOptions = useMemo(
    () => [...products].map((product) => product.name).sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const receive = useCallback(
    (row: PurchaseOrder) => {
      const item = row.items[0];
      if (!item) return;
      openCreate(item.productId, {
        productId: item.productId,
        supplierId: row.supplierId,
        quantity:
          Math.max(0, item.orderedBaseQuantity - item.receivedBaseQuantity) || item.orderedQuantity,
        cost: item.expectedUnitCost,
        purchaseOrderId: row.id,
      });
    },
    [openCreate],
  );

  const shown = rows;
  const listPages = pageSize === PAGE_SIZE_ALL ? 1 : pages;
  const listTotal = pageSize === PAGE_SIZE_ALL ? rows.length : total;

  useEffect(() => {
    if (!shown.length) {
      setFocusedId(null);
      return;
    }
    setFocusedId((current) => {
      if (current && shown.some((row) => row.id === current)) return current;
      return shown[0]?.id ?? null;
    });
  }, [shown]);

  useEffect(() => {
    if (!focusedId) return;
    document
      .querySelector(`[data-reorder-row="${focusedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  useEffect(() => {
    function typing(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      return Boolean(el?.closest("input, textarea, select, [contenteditable='true']"));
    }
    function onKey(event: KeyboardEvent) {
      if (cancelRow) {
        if (event.key === "Escape") {
          event.preventDefault();
          setCancelRow(null);
        }
        return;
      }
      if (typing(event.target)) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!shown.length) return;
        const index = shown.findIndex((row) => row.id === focusedId);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next =
          (((index < 0 ? 0 : index + delta) % shown.length) + shown.length) % shown.length;
        setFocusedId(shown[next]?.id ?? null);
        return;
      }
      if ((event.key === "Enter" || event.key === "r" || event.key === "R") && focusedId) {
        const row = shown.find((item) => item.id === focusedId);
        if (!row || !isOpen(row)) return;
        event.preventDefault();
        receive(row);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancelRow, focusedId, receive, shown]);

  const [exportRows, setExportRows] = useState<
    {
      orderNumber: string;
      product: string;
      supplier: string;
      city: string;
      ordered: number;
      received: number;
      status: string;
      date: string;
      unitCost: number;
      total: number;
    }[]
  >([]);

  useEffect(() => {
    const controller = new AbortController();
    void listAllPurchaseOrders(apiFilters, controller.signal)
      .then((data) =>
        setExportRows(
          data.map((row) => {
            const item = row.items[0];
            return {
              orderNumber: row.orderNumber,
              product: item
                ? products.find((row) => row.id === item.productId)?.name ?? item.productId
                : "—",
              supplier: supplierLabel(row.supplierId, suppliers),
              city: supplierCityName(row.supplierId, suppliers) || "—",
              ordered: item?.orderedBaseQuantity ?? 0,
              received: item?.receivedBaseQuantity ?? 0,
              status: REORDER_STATUS_LABEL[row.status as ReorderStatus] ?? row.status,
              date: row.orderDate,
              unitCost: item?.expectedUnitCost ?? 0,
              total: row.total,
            };
          }),
        ),
      )
      .catch(() => setExportRows([]));
    return () => controller.abort();
  }, [apiFilters, products, purchaseOrders, suppliers]);

  const filterFields = useMemo(
    () =>
      REORDER_FILTER_FIELDS.map((field) => {
        if (field.id === "supplier") return { ...field, options: supplierOptions };
        if (field.id === "product") return { ...field, options: productOptions };
        if (field.id === "city") return { ...field, options: cityOptions };
        return field;
      }),
    [cityOptions, productOptions, supplierOptions],
  );

  useLayoutEffect(() => {
    setActions(
      <>
        <span className="text-[11px] text-muted">{REORDER_COPY.reordersShortcutHint}</span>
        <HubExportMenu
          filename="reorders"
          sheetName="Reorders"
          rows={exportRows}
          columns={[
            { label: "PO", value: (row) => row.orderNumber },
            { label: "Product", value: (row) => row.product },
            { label: "Supplier", value: (row) => row.supplier },
            { label: "City", value: (row) => row.city },
            { label: "Qty ordered", value: (row) => row.ordered },
            { label: "Qty received", value: (row) => row.received },
            { label: "Status", value: (row) => row.status },
            { label: "Date", value: (row) => row.date },
            { label: REORDER_COPY.unitCostColumn, value: (row) => row.unitCost },
            { label: REORDER_COPY.lineTotalColumn, value: (row) => row.total },
          ]}
        />
        <Button
          variant="primary"
          icon={<ShoppingCart size={14} />}
          onClick={() => setCreateOpen(true)}
        >
          {REORDER_COPY.createAction}
        </Button>
      </>,
    );
    return () => setActions(null);
  }, [exportRows, setActions]);

  function openDetail(row: PurchaseOrder) {
    setViewRow(row);
    const controller = new AbortController();
    void getPurchaseOrder(row.id, controller.signal)
      .then((fresh) => setViewRow(fresh))
      .catch(() => undefined);
  }

  return (
    <div className="products-hub-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Table
        toolbar={
          <HubToolbar
            columns={COLUMNS}
            cols={cols}
            onCols={() => undefined}
            chips={chips}
            onApply={(chip) => {
              setChips((prev) => applyFilterChip(prev, chip));
              setPage(1);
            }}
            onRemove={(field) => {
              setChips((prev) => prev.filter((chip) => chip.field !== field));
              setPage(1);
            }}
            onClear={() => {
              setChips([]);
              setPage(1);
            }}
            filterFields={filterFields}
            search={search}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder="Search PO, product, supplier, city"
            dateRange={dateRange}
            onDateRange={(range) => {
              setDateRange(range);
              setPage(1);
            }}
          />
        }
        footer={
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-3 py-2 text-[12px] text-muted">
              <span>
                {REORDER_COPY.filteredTotalCost}:{" "}
                <strong className="font-semibold text-ink tabular-nums">
                  {money(filteredTotalCost)}
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
            <Th>PO</Th>
            <Th>Product</Th>
            <Th>Supplier</Th>
            <Th>{REORDER_COPY.cityColumn}</Th>
            <Th>Qty ordered</Th>
            <Th>Qty received</Th>
            <Th>Status</Th>
            <Th>Date</Th>
            <Th>{REORDER_COPY.unitCostColumn}</Th>
            <Th>{REORDER_COPY.lineTotalColumn}</Th>
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {loading ? (
            <TableRowsSkeleton columnCount={10} rows={8} hasActions />
          ) : shown.length === 0 ? (
            <EmptyRow cols={10} text={REORDER_COPY.empty} />
          ) : (
            shown.map((row) => {
              const item = row.items[0];
              const open = isOpen(row);
              const canCancel = row.status === "PENDING" && (item?.receivedBaseQuantity ?? 0) === 0;
              const product = item
                ? products.find((entry) => entry.id === item.productId)
                : undefined;
              return (
                <tr
                  key={row.id}
                  data-reorder-row={row.id}
                  className={`cursor-pointer ${focusedId === row.id ? "bg-[var(--soft)]" : ""}`}
                  onClick={() => {
                    setFocusedId(row.id);
                    openDetail(row);
                  }}
                >
                  <Td>{row.orderNumber}</Td>
                  <Td>{item ? productName(item.productId) : "—"}</Td>
                  <Td>{supplierLabel(row.supplierId, suppliers)}</Td>
                  <Td>{supplierCityName(row.supplierId, suppliers) || "—"}</Td>
                  <Td numeric>{formatStockQty(item?.orderedBaseQuantity ?? 0)}</Td>
                  <Td numeric>{formatStockQty(item?.receivedBaseQuantity ?? 0)}</Td>
                  <Td>
                    <Badge tone={statusTone(row.status)}>
                      {REORDER_STATUS_LABEL[row.status as ReorderStatus] ?? row.status}
                    </Badge>
                  </Td>
                  <Td>{row.orderDate}</Td>
                  <Td numeric>
                    {product && item ? (
                      <CostBreakdownTooltip
                        product={product}
                        stockCost={item.expectedUnitCost}
                        lineTotal={row.total}
                      />
                    ) : (
                      money(item?.expectedUnitCost ?? 0)
                    )}
                  </Td>
                  <Td numeric>{money(row.total)}</Td>
                  <Td>
                    <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
                      {open ? (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<PackagePlus size={14} />}
                          onClick={() => receive(row)}
                        >
                          {REORDER_COPY.receiveAction}
                        </Button>
                      ) : null}
                      {canCancel ? (
                        <Button
                          size="sm"
                          icon={<Ban size={14} />}
                          onClick={() => setCancelRow(row)}
                        >
                          {REORDER_COPY.cancelAction}
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
      {lotDrawer}
      <ReorderCreateDrawer
        open={createOpen}
        products={products}
        lots={lots}
        suppliers={suppliers}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void refreshHub();
        }}
      />
      <ReorderDetailDrawer
        order={viewRow}
        products={products}
        supplierName={viewRow ? supplierLabel(viewRow.supplierId, suppliers) : ""}
        onClose={() => setViewRow(null)}
        onReceive={receive}
        onCancel={setCancelRow}
      />
      <ConfirmDialog
        open={Boolean(cancelRow)}
        title={REORDER_COPY.cancelAction}
        body={cancelRow ? `Cancel ${cancelRow.orderNumber}?` : ""}
        danger
        confirmLabel={REORDER_COPY.cancelAction}
        onCancel={() => setCancelRow(null)}
        onConfirm={() => {
          if (!cancelRow) return;
          void cancelPurchaseOrder(cancelRow.id)
            .then(() => {
              toaster.success(REORDER_COPY.cancelled);
              setCancelRow(null);
              void refreshHub();
            })
            .catch((error) => toaster.error(shortError(error, REORDER_COPY.cancelFailed)));
        }}
      />
    </div>
  );
}
