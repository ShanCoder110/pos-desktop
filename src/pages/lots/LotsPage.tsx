import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
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
  Table,
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
import { formatMixedQty, formatStockQty, unitLabel } from "@/pages/products/productQty";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { suppliers as initialSuppliers, userName } from "@/shared/domain/mock";
import type { ProductLotRow, SupplierRow } from "@/shared/domain/types";
import { money } from "@/utils/format";

const PAGE_SIZE = 10;
const COLUMNS = [
  { id: "lot", label: "Lot", locked: true },
  { id: "product", label: "Product" },
  { id: "supplier", label: "Supplier" },
  { id: "received", label: "Received" },
  { id: "cost", label: "Cost" },
  { id: "original", label: "Original" },
  { id: "left", label: "Left" },
  { id: "damaged", label: "Damaged" },
  { id: "by", label: "By" },
];

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

export function LotsPage() {
  const { setActions, sectionKpi, lots: rows, setLots: setRows, products, setProducts } = useProductsHub();
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [cols, setCols] = useState(COLUMNS.map((c) => c.id));
  const [view, setView] = useState<HubView>("table");
  const [dateRange, setDateRange] = useState<DateRangeFilter>(() => rangeForPeriod("all"));
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<ProductLotRow | null>(null);
  const [remove, setRemove] = useState<ProductLotRow | null>(null);
  const [supplierRows, setSupplierRows] = useState<SupplierRow[]>(() => initialSuppliers);

  function productOf(id: string) {
    return products.find((p) => p.id === id);
  }

  function mixedQty(productId: string, qty: number) {
    const p = productOf(productId);
    return p ? formatMixedQty(p, qty) : formatStockQty(qty);
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
      isActive: true,
    };
    setSupplierRows((current) => [...current, supplier]);
    return supplier.id;
  }

  function writeLots(nextLots: ProductLotRow[], productIds: string[]) {
    setRows(nextLots);
    setProducts((prev) => productIds.reduce((acc, id) => syncProductStock(acc, nextLots, id), prev));
  }

  function saveLot(lot: ProductLotRow) {
    const exists = rows.some((row) => row.id === lot.id);
    const damagedQuantity = Math.min(Math.max(0, lot.damagedQuantity), lot.originalQuantity);
    const next = {
      ...lot,
      damagedQuantity,
      remainingQuantity: exists
        ? Math.max(0, Math.min(lot.remainingQuantity, lot.originalQuantity - damagedQuantity))
        : Math.max(0, lot.originalQuantity - damagedQuantity),
    };
    const previous = rows.find((row) => row.id === next.id);
    const list = exists ? rows.map((row) => (row.id === next.id ? next : row)) : [...rows, next];
    writeLots(list, [...new Set([next.productId, previous?.productId].filter(Boolean) as string[])]);
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
    toaster.success(exists ? "Lot updated" : "Lot added");
    setEdit(null);
  }

  function removeRow(row: ProductLotRow) {
    if (row.remainingQuantity < row.originalQuantity) setRemove(row);
    else {
      writeLots(
        rows.filter((x) => x.id !== row.id),
        [row.productId],
      );
      setSelected((s) => s.filter((id) => id !== row.id));
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
        const text = `${r.lotNumber} ${productLabel(r.productId)} ${supplierLabel(r.supplierId)}`.toLowerCase();
        if (!text.includes(needle)) return false;
      }
      if (sectionKpi === "open") return r.remainingQuantity > 0;
      if (sectionKpi === "empty") return r.remainingQuantity <= 0;
      if (status === "Remaining") return r.remainingQuantity > 0;
      if (status === "Empty") return r.remainingQuantity <= 0;
      return true;
    });
  }, [rows, q, chips, sectionKpi, products, supplierRows, dateRange]);

  const chartData = useMemo(() => {
    const grouped = new Map<string, number>();
    filtered.forEach((row) => grouped.set(row.productId, (grouped.get(row.productId) ?? 0) + row.remainingQuantity * row.purchasePrice));
    return [...grouped.entries()]
      .map(([id, value]) => ({ id, label: productLabel(id), value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, products]);

  const pages = pageSize === PAGE_SIZE_ALL ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = pageSize === PAGE_SIZE_ALL ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const show = (id: string) => cols.includes(id);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      <Table
        toolbar={
          <HubToolbar
            columns={COLUMNS}
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
            trailing={
              selected.length > 0 ? (
                <BulkActions count={selected.length}>
                  <BulkAction
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() => {
                      const blocked = rows.find((r) => selected.includes(r.id) && r.remainingQuantity < r.originalQuantity);
                      if (blocked) {
                        setRemove(blocked);
                        return;
                      }
                      const ids = [...new Set(rows.filter((r) => selected.includes(r.id)).map((r) => r.productId))];
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
          view !== "table" ? (
            <HubChart
              type={view}
              title="Stock value by product"
              subtitle={`${filtered.length} lots after search, status, and date filters`}
              data={chartData}
              formatValue={money}
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
                  if (e.target.checked) setSelected((s) => [...new Set([...s, ...shown.map((r) => r.id)])]);
                  else setSelected((s) => s.filter((id) => !shown.some((r) => r.id === id)));
                }}
              />
            </Th>
            <Th>Lot</Th>
            {show("product") ? <Th>Product</Th> : null}
            {show("supplier") ? <Th>Supplier</Th> : null}
            {show("received") ? <Th>Received</Th> : null}
            {show("cost") ? <Th>Cost</Th> : null}
            {show("original") ? <Th>Original</Th> : null}
            {show("left") ? <Th>Left</Th> : null}
            {show("damaged") ? <Th>Damaged</Th> : null}
            {show("by") ? <Th>By</Th> : null}
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={cols.length + 2} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td className="ui-check-col">
                <Checkbox
                  checked={selected.includes(row.id)}
                  onChange={(e) => {
                    setSelected((s) => (e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id)));
                  }}
                />
              </Td>
              <Td>{row.lotNumber}</Td>
              {show("product") ? <Td>{productLabel(row.productId)}</Td> : null}
              {show("supplier") ? <Td>{supplierLabel(row.supplierId)}</Td> : null}
              {show("received") ? <Td>{row.receivedAt}</Td> : null}
              {show("cost") ? (
                <Td numeric>
                  {money(row.purchasePrice)}/{unitLabel(productOf(row.productId)?.unit ?? "")}
                </Td>
              ) : null}
              {show("original") ? <Td numeric>{mixedQty(row.productId, row.originalQuantity)}</Td> : null}
              {show("left") ? (
                <Td numeric>
                  <Badge tone={row.remainingQuantity <= 0 ? "danger" : "ok"}>{mixedQty(row.productId, row.remainingQuantity)}</Badge>
                </Td>
              ) : null}
              {show("damaged") ? <Td numeric>{mixedQty(row.productId, row.damagedQuantity)}</Td> : null}
              {show("by") ? <Td>{userName(row.createdBy)}</Td> : null}
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
          ))}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(edit)}
        wide
        form
        dim={false}
        className="is-lot"
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
