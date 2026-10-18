import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  EmptyRow,
  HubExportMenu,
  HubChart,
  PAGE_SIZE_ALL,
  Pagination,
  Table,
  TableRowsSkeleton,
  Td,
  THead,
  Th,
  rangeForPeriod,
} from "@/components/common";
import type { DateRangeFilter } from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { applyFilterChip } from "@/utils/filterChips";
import { chipStatusCsv } from "@/utils/filterQuery";
import { createLoadGuard, isAbortError } from "@/utils/async";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { TransferDetailDrawer } from "@/pages/transfers/TransferDetailDrawer";
import { TRANSFER_FORM_ID, TransferForm } from "@/pages/transfers/TransferForm";
import type { StockTransferRow, TransferStatus } from "@/shared/domain/types";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import {
  DEFAULT_TRANSFER_COLUMNS,
  TRANSFER_COPY,
  TRANSFER_TABLE_COLUMNS,
} from "@/shared/constants/products";
import { ensureSession } from "@/services/auth";
import { getTransfer, listAllTransfers, listTransfers, mapTransfer } from "@/services/transfers";
import { listAllBranches, type BranchResponse } from "@/services/org";
import {
  TransferFromStockCell,
  TransferMovedCell,
  TransferProductCell,
  TransferToStockCell,
} from "@/pages/transfers/TransferTableCells";
import {
  transferBranchStockSummary,
  transferProductLabel,
  transferTotalMoved,
} from "@/pages/transfers/transferDetail";
import { formatTableDateTime } from "@/utils/format";

function mapStatus(status: string): TransferStatus {
  if (status === "RECEIVED" || status === "COMPLETED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  return "PENDING";
}

function tone(s: TransferStatus) {
  if (s === "COMPLETED") return "ok" as const;
  if (s === "PENDING") return "warn" as const;
  return "danger" as const;
}

function statusLabel(status: TransferStatus) {
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  return "Pending";
}

function transferApiFilters(
  chips: FilterChip[],
  search: string,
  dateRange: DateRangeFilter,
  sectionKpi: string | null,
) {
  const statusFromChips = chipStatusCsv(chips, "status", (label) => {
    if (label === "Pending") return "PENDING";
    if (label === "Completed") return "COMPLETED";
    if (label === "Cancelled") return "CANCELLED";
    return undefined;
  });
  return {
    search: search.trim() || undefined,
    status:
      sectionKpi === "PENDING" || sectionKpi === "COMPLETED" || sectionKpi === "CANCELLED"
        ? sectionKpi
        : statusFromChips,
    occurredFrom: dateRange.from || undefined,
    occurredTo: dateRange.to || undefined,
  };
}

export function TransfersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setActions, sectionKpi, products, lots, refreshHub } = useProductsHub();
  const [rows, setRows] = useState<StockTransferRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<StockTransferRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cols, setCols] = useState(DEFAULT_TRANSFER_COLUMNS);
  const [view, setView] = useState<HubView>("table");
  const [dateRange, setDateRange] = useState<DateRangeFilter>(() => rangeForPeriod("all"));
  const [selected, setSelected] = useState<string[]>([]);
  const [viewTransfer, setViewTransfer] = useState<StockTransferRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState({ page: true });

  const prefilledProductId = searchParams.get("productId") ?? undefined;
  const prefilledLotId = searchParams.get("lotId") ?? undefined;

  const branchNames = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((b) => {
      map[b.id] = b.name;
    });
    return map;
  }, [branches]);

  const apiFilters = useMemo(
    () => transferApiFilters(chips, q, dateRange, sectionKpi),
    [chips, dateRange, q, sectionKpi],
  );

  useEffect(() => {
    setPage(1);
  }, [apiFilters, sectionKpi]);

  useEffect(() => {
    const controller = new AbortController();
    void ensureSession(controller.signal)
      .then(() => listAllBranches(controller.signal))
      .then((branchRows) => setBranches(branchRows))
      .catch(() => setBranches([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const guard = createLoadGuard();
    setLoading({ page: true });
    const load =
      pageSize === PAGE_SIZE_ALL
        ? listAllTransfers(apiFilters, controller.signal).then((data) => ({
            rows: data,
            total: data.length,
            pages: 1,
          }))
        : listTransfers({ ...apiFilters, page, perPage: pageSize }, controller.signal).then(
            (response) => ({
              rows: response.data.map(mapTransfer),
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
        if (guard.isActive()) setLoading({ page: false });
      });
    return () => {
      guard.dispose();
      controller.abort();
    };
  }, [apiFilters, page, pageSize, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    void listAllTransfers(apiFilters, controller.signal)
      .then(setFilteredRows)
      .catch((error) => {
        if (isAbortError(error)) return;
        setFilteredRows([]);
      });
    return () => controller.abort();
  }, [apiFilters, reloadKey]);

  useEffect(() => {
    if (prefilledProductId || prefilledLotId) {
      setCreateOpen(true);
    }
  }, [prefilledProductId, prefilledLotId]);

  const openCreate = useCallback(() => {
    setCreateOpen(true);
  }, []);

  function closeCreate() {
    setCreateOpen(false);
    if (prefilledProductId || prefilledLotId) {
      setSearchParams({}, { replace: true });
    }
  }

  function openTransfer(row: StockTransferRow) {
    setViewTransfer(row);
    const controller = new AbortController();
    void getTransfer(row.id, controller.signal)
      .then((fresh) => setViewTransfer(fresh))
      .catch(() => undefined);
  }

  const shown = rows;
  const listPages = pageSize === PAGE_SIZE_ALL ? 1 : pages;
  const listTotal = pageSize === PAGE_SIZE_ALL ? rows.length : total;

  useLayoutEffect(() => {
    setActions(
      <>
        <HubExportMenu
          filename="transfers"
          sheetName="Transfers"
          rows={filteredRows}
          columns={[
            { label: "From", value: (row) => branchNames[row.fromBranchId] ?? row.fromBranchId },
            { label: "To", value: (row) => branchNames[row.toBranchId] ?? row.toBranchId },
            { label: "Product", value: (row) => transferProductLabel(row, products) },
            { label: "Moved", value: (row) => transferTotalMoved(row) },
            { label: "Status", value: (row) => statusLabel(mapStatus(row.status)) },
            { label: "Created", value: (row) => formatTableDateTime(row.createdAt) },
            { label: "Completed", value: (row) => formatTableDateTime(row.completedAt) },
          ]}
        />
        <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
          Add transfer
        </Button>
      </>,
    );
    return () => setActions(null);
  }, [branchNames, filteredRows, openCreate, products, setActions]);

  const chartData = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredRows.forEach((row) => {
      const label = statusLabel(mapStatus(row.status));
      grouped.set(label, (grouped.get(label) ?? 0) + row.items.length);
    });
    return [...grouped.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredRows]);
  const show = (id: string) => cols.includes(id);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      <Table
        toolbar={
          <HubToolbar
            columns={TRANSFER_TABLE_COLUMNS}
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
            filterFields={[
              { id: "status", label: "Status", options: ["Pending", "Completed", "Cancelled"] },
            ]}
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search transfers"
            view={view}
            onView={setView}
            dateRange={dateRange}
            onDateRange={(range) => {
              setDateRange(range);
              setPage(1);
            }}
          />
        }
        body={
          view === "insights" ? (
            <HubChart
              type="donut"
              title="Transferred items by status"
              subtitle={`${listTotal} transfers after search, status, and date filters`}
              data={chartData}
            />
          ) : undefined
        }
        footer={
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
            {show("from") ? <Th>From</Th> : null}
            {show("to") ? <Th>To</Th> : null}
            {show("product") ? <Th>Product</Th> : null}
            {show("moved") ? <Th>{TRANSFER_COPY.detailMovedQty}</Th> : null}
            {show("fromStock") ? <Th>From stock</Th> : null}
            {show("toStock") ? <Th>To stock</Th> : null}
            {show("status") ? <Th>Status</Th> : null}
            {show("created") ? <Th>Created</Th> : null}
            {show("completed") ? <Th>Completed</Th> : null}
            {show("items") ? <Th>Lines</Th> : null}
            <Th className="ui-actions-col">Actions</Th>
          </tr>
        </THead>
        <tbody>
          {loading.page ? (
            <TableRowsSkeleton columnCount={cols.length} rows={6} selectable hasActions />
          ) : null}
          {!loading.page && shown.length === 0 ? <EmptyRow cols={cols.length + 2} /> : null}
          {!loading.page
            ? shown.map((row) => {
                const primaryProductId = row.items[0]?.productId;
                const primaryProduct = primaryProductId
                  ? products.find((p) => p.id === primaryProductId)
                  : undefined;
                const stockSummary = transferBranchStockSummary(row, lots);
                const movedQty = transferTotalMoved(row);
                const singleProduct =
                  row.items.length > 0 &&
                  row.items.every((item) => item.productId === primaryProductId)
                    ? primaryProduct
                    : undefined;

                return (
                  <tr key={row.id} className="cursor-pointer" onClick={() => openTransfer(row)}>
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
                    {show("from") ? (
                      <Td>
                        <span className="transfer-table-branch">
                          {branchNames[row.fromBranchId] ?? row.fromBranchId}
                        </span>
                      </Td>
                    ) : null}
                    {show("to") ? (
                      <Td>
                        <span className="transfer-table-branch">
                          {branchNames[row.toBranchId] ?? row.toBranchId}
                        </span>
                      </Td>
                    ) : null}
                    {show("product") ? (
                      <Td>
                        <TransferProductCell label={transferProductLabel(row, products)} />
                      </Td>
                    ) : null}
                    {show("moved") ? (
                      <Td numeric>
                        <TransferMovedCell movedQty={movedQty} product={singleProduct} />
                      </Td>
                    ) : null}
                    {show("fromStock") ? (
                      <Td>
                        <TransferFromStockCell summary={stockSummary} product={singleProduct} />
                      </Td>
                    ) : null}
                    {show("toStock") ? (
                      <Td>
                        <TransferToStockCell summary={stockSummary} product={singleProduct} />
                      </Td>
                    ) : null}
                    {show("status") ? (
                      <Td>
                        <Badge tone={tone(mapStatus(row.status))}>
                          {statusLabel(mapStatus(row.status))}
                        </Badge>
                      </Td>
                    ) : null}
                    {show("created") ? (
                      <Td className="transfer-table-when">{formatTableDateTime(row.createdAt)}</Td>
                    ) : null}
                    {show("completed") ? (
                      <Td className="transfer-table-when">
                        {formatTableDateTime(row.completedAt)}
                      </Td>
                    ) : null}
                    {show("items") ? <Td numeric>{row.items.length}</Td> : null}
                    <Td className="ui-actions-col">
                      <div onClick={(event) => event.stopPropagation()}>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openTransfer(row)}
                          aria-label="View transfer details"
                        >
                          <Eye size={15} />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })
            : null}
        </tbody>
      </Table>

      <Drawer
        open={createOpen}
        size="xl"
        form
        title={TRANSFER_COPY.addTitle}
        subtitle={<p className="ui-drawer-subtitle">{TRANSFER_COPY.addSubtitle}</p>}
        onClose={closeCreate}
        footer={
          <>
            <Button onClick={closeCreate} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" form={TRANSFER_FORM_ID} variant="primary" disabled={creating}>
              {creating ? "Saving…" : TRANSFER_COPY.saveAction}
            </Button>
          </>
        }
      >
        <TransferForm
          products={products}
          lots={lots}
          branches={branches}
          initialProductId={prefilledProductId}
          initialLotId={prefilledLotId}
          onClose={closeCreate}
          onSavingChange={setCreating}
          onSaved={() => {
            setReloadKey((key) => key + 1);
            void refreshHub();
          }}
        />
      </Drawer>

      <TransferDetailDrawer
        transfer={viewTransfer}
        products={products}
        lots={lots}
        branches={branches}
        onClose={() => setViewTransfer(null)}
      />
    </div>
  );
}
