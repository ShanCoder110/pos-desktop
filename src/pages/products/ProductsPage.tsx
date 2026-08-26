import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Tags,
  Trash2,
} from "lucide-react";
import {
  Badge,
  BulkAction,
  BulkActions,
  Button,
  Checkbox,
  ConfirmDialog,
  Drawer,
  Menu,
  MenuItem,
  PAGE_SIZE_ALL,
  Pagination,
  Popover,
  Table,
  TableRowsSkeleton,
  Td,
  THead,
  Th,
  TruncatedTooltip,
  toaster,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { HubToolbar } from "@/pages/products/HubToolbar";
import { ProductForm } from "@/pages/products/ProductForm";
import { blankProduct, lotTotals, openingLot } from "@/pages/products/productLots";
import { formatStockQty, stockBreakdown } from "@/pages/products/productQty";
import {
  HEALTH_FROM_LABEL,
  HEALTH_LABEL,
  matchesHealth,
  useProductsHub,
} from "@/pages/products/ProductsLayout";
import { productCategories, topSelling } from "@/shared/mock";
import { useSettings } from "@/shared/settings";
import type { Product } from "@/shared/types";
import { exportProductsCsv, exportProductsExcel, printProducts } from "@/utils/exportFile";
import { money } from "@/utils/format";

const PAGE_SIZE = 10;

function nextSku(existing: Product[]) {
  const used = new Set(existing.map((r) => r.sku));
  let i = existing.length + 1;
  let sku = `P-${String(i).padStart(4, "0")}`;
  while (used.has(sku)) {
    i += 1;
    sku = `P-${String(i).padStart(4, "0")}`;
  }
  return sku;
}

const COLUMNS = [
  { id: "name", label: "Name", locked: true },
  { id: "sku", label: "SKU" },
  { id: "category", label: "Category" },
  { id: "cost", label: "Cost" },
  { id: "retail", label: "Sell" },
  { id: "margin", label: "Margin" },
  { id: "sales", label: "Total sales" },
  { id: "profit", label: "Profit" },
  { id: "stock", label: "Qty" },
  { id: "status", label: "Status" },
];

const DEFAULT_COLS = ["name", "category", "cost", "retail", "margin", "sales", "profit", "stock", "status"];

function marginPct(row: Product) {
  if (!row.cost) return 0;
  return ((row.retail - row.cost) / row.cost) * 100;
}

function stockTone(row: Product): "ok" | "warn" | "danger" {
  if (row.stock <= 0) return "danger";
  if (row.stock < 20) return "warn";
  return "ok";
}

function stockLabel(row: Product) {
  if (row.stock <= 0) return "Out of stock";
  if (row.stock < 20) return "Low stock";
  return "In stock";
}

const soldById = new Map(topSelling.map((t) => [t.productId, t]));

function soldQty(id: string) {
  return soldById.get(id)?.qty ?? 0;
}

function salesAmount(id: string) {
  return soldById.get(id)?.amount ?? 0;
}

function profitOf(row: Product) {
  return (row.retail - row.cost) * soldQty(row.id);
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
      <div className="ui-pop-list" onClick={() => setOpen(false)}>
        <button type="button" className="ui-pop-item" onClick={() => exportProductsCsv(rows)}>
          <FileText size={14} />
          CSV
        </button>
        <button type="button" className="ui-pop-item" onClick={() => exportProductsExcel(rows)}>
          <FileSpreadsheet size={14} />
          Excel
        </button>
        <div className="ui-pop-sep" />
        <button type="button" className="ui-pop-item" onClick={() => printProducts(rows, "thermal", shopName)}>
          <Receipt size={14} />
          Thermal printer
        </button>
        <button type="button" className="ui-pop-item" onClick={() => printProducts(rows, "a4", shopName)}>
          <Printer size={14} />
          A4
        </button>
      </div>
    </Popover>
  );
}

export function ProductsPage() {
  const { settings } = useSettings();
  const { setActions, health, setHealth, sectionKpi, lots, setLots, products: rows, setProducts: setRows } = useProductsHub();
  const location = useLocation();
  const tab = location.pathname.endsWith("/sold")
    ? "sold"
    : location.pathname.endsWith("/low")
      ? "low"
      : "all";
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<Product | null>(null);
  const [remove, setRemove] = useState<Product | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 450);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [tab, sectionKpi]);

  useEffect(() => {
    setChips((prev) => {
      const without = prev.filter((c) => c.field !== "health");
      if (!health) return without;
      return [...without, { field: "health", label: "Health", value: HEALTH_LABEL[health] }];
    });
    setPage(1);
  }, [health]);

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      const text = `${r.name} ${r.sku} ${r.category}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      for (const chip of chips) {
        if (chip.field === "health") {
          const key = HEALTH_FROM_LABEL[chip.value];
          if (!key || !matchesHealth(r, key)) return false;
        }
        if (chip.field === "name" && !r.name.toLowerCase().includes(chip.value.toLowerCase())) return false;
        if (chip.field === "sku" && !r.sku.toLowerCase().includes(chip.value.toLowerCase())) return false;
        if (chip.field === "category" && r.category !== chip.value) return false;
        if (chip.field === "sales") {
          if (salesAmount(r.id) < minAmount(chip.value)) return false;
        }
        if (chip.field === "profit") {
          if (profitOf(r) < minAmount(chip.value)) return false;
        }
        if (chip.field === "stock") {
          const tone = stockTone(r);
          if (chip.value === "In stock" && tone !== "ok") return false;
          if (chip.value === "Low stock" && tone !== "warn") return false;
          if (chip.value === "Out of stock" && tone !== "danger") return false;
        }
      }
      if (tab === "sold") return soldQty(r.id) > 0;
      if (tab === "low") {
        if (sectionKpi === "below") return r.stock > 0 && r.stock < 20;
        if (sectionKpi === "out") return r.stock <= 0;
        return r.stock < 20;
      }
      return true;
    });
    if (tab === "sold") {
      return [...list].sort((a, b) => soldQty(b.id) - soldQty(a.id));
    }
    return list;
  }, [rows, q, tab, chips, sectionKpi]);

  const pageCount = pageSize === PAGE_SIZE_ALL ? Math.max(filtered.length, 1) : pageSize;
  const pages = Math.max(1, Math.ceil(filtered.length / pageCount));
  const shown =
    pageSize === PAGE_SIZE_ALL
      ? filtered
      : filtered.slice((page - 1) * pageSize, page * pageSize);
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

  function commit(next: Product) {
    const isNewRow = !rows.some((r) => r.id === next.id);
    const saved: Product = {
      ...next,
      sku: settings.autoSku && !next.sku.trim() ? nextSku(rows.filter((r) => r.id !== next.id)) : next.sku.trim(),
    };
    if (isNewRow && saved.stock > 0) {
      const lot = openingLot(saved, lots);
      setLots((prev) => [...prev, lot]);
      const totals = lotTotals([lot]);
      saved.stock = totals.stock;
      saved.damaged = totals.damaged;
    }
    setRows((prev) => (prev.some((r) => r.id === saved.id) ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved]));
    return true;
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
      if (edit || remove || blocked) return;
      if (e.key === "F2") {
        e.preventDefault();
        e.stopPropagation();
        openNew();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [edit, remove, blocked]);

  useLayoutEffect(() => {
    setActions(
      <>
        <ExportMenu rows={filtered} shopName={settings.shopName} />
        <Button variant="primary" icon={<Plus size={14} />} onClick={openNew}>
          Add Product
          <kbd className="ui-kbd">F2</kbd>
        </Button>
      </>,
    );
    return () => setActions(null);
  }, [filtered, settings.shopName, setActions]);

  const isNew = !edit || !rows.some((r) => r.id === edit.id);

  return (
    <div className={edit ? "products-hub-panel is-drawer-open" : "products-hub-panel"}>
      <Table
        toolbar={
          <HubToolbar
            columns={COLUMNS}
            cols={cols}
            onCols={setCols}
            chips={chips}
            onApply={(chip) => {
              setLoading(true);
              setChips((prev) => [...prev.filter((c) => c.field !== chip.field), chip]);
              setPage(1);
              window.setTimeout(() => setLoading(false), 220);
            }}
            onRemove={removeChip}
            onClear={clearChips}
            filterFields={[
              { id: "name", label: "Name" },
              { id: "sku", label: "SKU" },
              { id: "category", label: "Category", options: productCategories, searchable: true },
              { id: "sales", label: "Total sales", placeholder: "Min amount e.g. 5000", numeric: true },
              { id: "profit", label: "Profit", placeholder: "Min amount e.g. 1000", numeric: true },
              { id: "stock", label: "Qty", options: ["In stock", "Low stock", "Out of stock"] },
            ]}
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search by name, SKU, category"
            trailing={
              selected.length > 0 ? (
                <BulkActions count={selected.length}>
                  <BulkAction icon={<FileText size={14} />} onClick={() => exportProductsCsv(picked, "selected-products.csv")}>
                    CSV
                  </BulkAction>
                  <BulkAction icon={<FileSpreadsheet size={14} />} onClick={() => exportProductsExcel(picked, "selected-products.xls")}>
                    Excel
                  </BulkAction>
                  <BulkAction icon={<Receipt size={14} />} onClick={() => printProducts(picked, "thermal", settings.shopName)}>
                    Thermal printer
                  </BulkAction>
                  <BulkAction icon={<Printer size={14} />} onClick={() => printProducts(picked, "a4", settings.shopName)}>
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
            <Th>Name</Th>
            {show("sku") ? <Th>SKU</Th> : null}
            {show("category") ? <Th>Category</Th> : null}
            {show("cost") ? <Th>Cost</Th> : null}
            {show("retail") ? <Th>Sell</Th> : null}
            {show("margin") ? <Th>Margin</Th> : null}
            {show("sales") ? <Th>Total sales</Th> : null}
            {show("profit") ? <Th>Profit</Th> : null}
            {show("stock") ? <Th>Qty</Th> : null}
            {show("status") ? <Th>Status</Th> : null}
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {loading ? (
            <TableRowsSkeleton
              columnCount={cols.length}
              rows={pageSize === PAGE_SIZE_ALL ? Math.min(Math.max(filtered.length, 6), 12) : pageSize}
              selectable
              hasActions
            />
          ) : (
            shown.map((row) => {
            const tone = stockTone(row);
            const pct = marginPct(row);
            return (
              <tr key={row.id} className={`is-${tone}`}>
                <Td className="ui-check-col">
                  <Checkbox
                    checked={selected.includes(row.id)}
                    onChange={(e) => {
                      setSelected((s) => (e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id)));
                    }}
                  />
                </Td>
                <Td>
                  <TruncatedTooltip text={row.name} />
                  {row.isLinear ? <span className="sub">Sold by meter</span> : null}
                  {row.isManufactured ? <span className="sub">Production</span> : null}
                </Td>
                {show("sku") ? <Td>{row.sku || "—"}</Td> : null}
                {show("category") ? <Td>{row.category}</Td> : null}
                {show("cost") ? <Td numeric>{money(row.cost)}</Td> : null}
                {show("retail") ? <Td numeric>{money(row.retail)}</Td> : null}
                {show("margin") ? (
                  <Td numeric>
                    <span style={{ color: pct >= 0 ? "var(--sale)" : "var(--danger)", fontWeight: 700 }}>
                      {pct >= 0 ? "+" : ""}
                      {pct.toFixed(1)}%
                    </span>
                  </Td>
                ) : null}
                {show("sales") ? <Td numeric>{money(salesAmount(row.id))}</Td> : null}
                {show("profit") ? (
                  <Td numeric>
                    <span style={{ color: profitOf(row) >= 0 ? "var(--sale)" : "var(--danger)", fontWeight: 700 }}>
                      {money(profitOf(row))}
                    </span>
                  </Td>
                ) : null}
                {show("stock") ? (
                  <Td numeric>
                    <div className="product-qty">
                      {stockBreakdown(row).map((q) => (
                        <span key={q.name}>
                          {formatStockQty(q.qty)} {q.name}
                        </span>
                      ))}
                    </div>
                  </Td>
                ) : null}
                {show("status") ? (
                  <Td>
                    <div className="ui-actions">
                      <Badge tone={tone}>{stockLabel(row)}</Badge>
                      {row.stock > 0 ? <Badge tone="ok">Sellable</Badge> : <Badge>Held</Badge>}
                    </div>
                  </Td>
                ) : null}
                <Td>
                  <Menu>
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
                </Td>
              </tr>
            );
          })
          )}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(edit)}
        wide
        form
        dim={false}
        title={isNew ? "Add Product" : "Edit Product"}
        subtitle={
          <p className="product-keys">
            <span>
              <kbd className="ui-kbd">Tab</kbd> Move
            </span>
            <span>
              <kbd className="ui-kbd">Shift + Tab</kbd> Back
            </span>
            <span>
              <kbd className="ui-kbd">Enter</kbd> Select
            </span>
            <span>
              <kbd className="ui-kbd">F12</kbd> Save
            </span>
            <span>
              <kbd className="ui-kbd">Esc</kbd> Close
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
          if (remove) {
            setRows((p) => p.filter((r) => r.id !== remove.id));
            setSelected((s) => s.filter((id) => id !== remove.id));
            toaster.success("Product deleted");
          }
          setRemove(null);
        }}
      />
    </div>
  );
}
