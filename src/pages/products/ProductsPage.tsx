import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  FileSpreadsheet,
  FileText,
  Gift,
  Minus,
  Pencil,
  Plus,
  Printer,
  Receipt,
  ShieldCheck,
  Tags,
  Trash2,
} from "lucide-react";
import {
  Badge,
  BulkAction,
  BulkActions,
  Button,
  Checkbox,
  ColumnPicker,
  ConfirmDialog,
  Drawer,
  Field,
  FilterChips,
  FilterPicker,
  KpiCard,
  Menu,
  MenuItem,
  MoneyInput,
  Pagination,
  Popover,
  SearchInput,
  SelectInput,
  Table,
  Tabs,
  Td,
  TextInput,
  THead,
  Th,
  Toggle,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { productCategories, products as seed } from "@/shared/mock";
import { useSettings } from "@/shared/settings";
import type { Product } from "@/shared/types";
import { exportProductsCsv, exportProductsExcel, printProducts } from "@/utils/exportFile";
import { money, warrantyDaysOf } from "@/utils/format";

const blank: Product = {
  id: "",
  sku: "",
  name: "",
  category: "Wire",
  unit: "pc",
  isLinear: false,
  isManufactured: false,
  packQty: null,
  packPrice: 0,
  cost: 0,
  min: 0,
  wholesale: 0,
  retail: 0,
  warrantyQty: 0,
  warrantyUnit: "months",
  warrantyDays: 0,
  claims: 0,
  damaged: 0,
  stock: 0,
  components: [],
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

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

function numVal(raw: string) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function numStr(n: number) {
  return n ? String(n) : "";
}

const PAGE_SIZE = 10;

const COLUMNS = [
  { id: "name", label: "Name", locked: true },
  { id: "sku", label: "SKU" },
  { id: "category", label: "Category" },
  { id: "cost", label: "Cost" },
  { id: "retail", label: "Sell" },
  { id: "margin", label: "Margin" },
  { id: "stock", label: "Stock" },
  { id: "status", label: "Status" },
];

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

type HealthKpi = "healthy" | "risk" | "stale" | "dead" | "phantom";

function matchesHealth(row: Product, kpi: HealthKpi) {
  if (kpi === "healthy") return row.stock >= 20;
  if (kpi === "risk") return row.stock > 0 && row.stock < 20;
  if (kpi === "stale") return row.claims > 0 || row.damaged > 0;
  if (kpi === "dead") return row.stock <= 0;
  return row.isLinear;
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
  const [rows, setRows] = useState(seed);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [cols, setCols] = useState(COLUMNS.map((c) => c.id));
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<Product | null>(null);
  const [formTab, setFormTab] = useState("details");
  const [unitManual, setUnitManual] = useState(false);
  const [remove, setRemove] = useState<Product | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [kpi, setKpi] = useState<HealthKpi | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const text = `${r.name} ${r.sku} ${r.category}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (kpi && !matchesHealth(r, kpi)) return false;
      for (const chip of chips) {
        if (chip.field === "name" && !r.name.toLowerCase().includes(chip.value.toLowerCase())) return false;
        if (chip.field === "category" && r.category !== chip.value) return false;
        if (chip.field === "stock") {
          const tone = stockTone(r);
          if (chip.value === "In stock" && tone !== "ok") return false;
          if (chip.value === "Low stock" && tone !== "warn") return false;
          if (chip.value === "Out of stock" && tone !== "danger") return false;
        }
      }
      if (tab === "low") return r.stock > 0 && r.stock < 20;
      if (tab === "linear") return r.isLinear;
      if (tab === "claims") return r.claims > 0 || r.damaged > 0;
      return true;
    });
  }, [rows, q, tab, chips, kpi]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize);
  const show = (id: string) => cols.includes(id);
  const healthCounts: Record<HealthKpi, number> = {
    healthy: rows.filter((r) => matchesHealth(r, "healthy")).length,
    risk: rows.filter((r) => matchesHealth(r, "risk")).length,
    stale: rows.filter((r) => matchesHealth(r, "stale")).length,
    dead: rows.filter((r) => matchesHealth(r, "dead")).length,
    phantom: rows.filter((r) => matchesHealth(r, "phantom")).length,
  };
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  function toggleKpi(id: HealthKpi) {
    setKpi((cur) => (cur === id ? null : id));
    setTab("all");
    setPage(1);
  }

  function save() {
    if (!edit?.name.trim()) return;
    const next: Product = {
      ...edit,
      name: edit.name.trim(),
      sku: settings.autoSku && !edit.sku.trim() ? nextSku(rows.filter((r) => r.id !== edit.id)) : edit.sku.trim(),
      warrantyDays: warrantyDaysOf(edit.warrantyQty, edit.warrantyUnit),
      components: edit.isManufactured ? edit.components.filter((c) => c.productId && c.quantity > 0) : [],
      packQty: edit.packQty && edit.packQty > 0 ? edit.packQty : null,
      packPrice: edit.packQty && edit.packQty > 0 ? edit.packPrice : 0,
    };
    setRows((prev) => (prev.some((r) => r.id === next.id) ? prev.map((r) => (r.id === next.id ? next : r)) : [...prev, next]));
    setEdit(null);
  }

  const picked = rows.filter((r) => selected.includes(r.id));

  function openEdit(row: Product) {
    const auto = row.packQty && row.packPrice ? round2(row.packPrice / row.packQty) : null;
    setFormTab("details");
    setUnitManual(auto != null && Math.abs(auto - row.retail) > 0.009);
    setEdit(row);
  }

  function openNew() {
    openEdit({ ...blank, id: crypto.randomUUID() });
  }

  function patch(next: Partial<Product>) {
    setEdit((cur) => (cur ? { ...cur, ...next } : cur));
  }

  function setPackPrice(packPrice: number) {
    setEdit((cur) => {
      if (!cur) return cur;
      const next = { ...cur, packPrice };
      if (!unitManual && next.packQty && next.packQty > 0) next.retail = round2(packPrice / next.packQty);
      return next;
    });
  }

  function setPackQty(packQty: number | null) {
    setEdit((cur) => {
      if (!cur) return cur;
      const next = { ...cur, packQty };
      if (!unitManual && packQty && packQty > 0 && next.packPrice) next.retail = round2(next.packPrice / packQty);
      return next;
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "F2") return;
      e.preventDefault();
      e.stopPropagation();
      if (remove || blocked || edit) return;
      openNew();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [edit, remove, blocked]);

  return (
    <div className="ui-stack">
      <div className="ui-page-head">
        <h1 className="ui-page-title">Products</h1>
        <div className="ui-actions">
          <ExportMenu rows={filtered} shopName={settings.shopName} />
          <Button icon={<Plus size={14} />} onClick={openNew}>
            Add product
            <kbd className="ui-kbd">F2</kbd>
          </Button>
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
        </div>
      </div>

      <div className="ui-kpi-row">
        <KpiCard
          label="Healthy"
          value={healthCounts.healthy}
          hint="In stock"
          tone="ok"
          icon={<ShieldCheck size={16} />}
          active={kpi === "healthy"}
          onClick={() => toggleKpi("healthy")}
        />
        <KpiCard
          label="At risk"
          value={healthCounts.risk}
          hint="Low stock"
          tone="warn"
          icon={<AlertTriangle size={16} />}
          active={kpi === "risk"}
          onClick={() => toggleKpi("risk")}
        />
        <KpiCard
          label="Stale"
          value={healthCounts.stale}
          hint="Has claims"
          tone="stale"
          icon={<Clock size={16} />}
          active={kpi === "stale"}
          onClick={() => toggleKpi("stale")}
        />
        <KpiCard
          label="Dead"
          value={healthCounts.dead}
          hint="Out of stock"
          tone="danger"
          icon={<Trash2 size={16} />}
          active={kpi === "dead"}
          onClick={() => toggleKpi("dead")}
        />
        <KpiCard
          label="Phantom"
          value={healthCounts.phantom}
          hint="Sold by length"
          tone="phantom"
          icon={<Gift size={16} />}
          active={kpi === "phantom"}
          onClick={() => toggleKpi("phantom")}
        />
      </div>

      <Tabs
        value={tab}
        onChange={(id) => {
          setTab(id);
          setPage(1);
        }}
        items={[
          { id: "all", label: "All products" },
          { id: "low", label: "Low stock" },
          { id: "linear", label: "Sold by length" },
          { id: "claims", label: "Claims" },
        ]}
      />

      <Table
        toolbar={
          <>
            <div className="ui-toolbar-row">
              <div className="ui-toolbar-left" style={{ width: "100%" }}>
                <ColumnPicker columns={COLUMNS} value={cols} onChange={setCols} />
                <FilterPicker
                  chips={chips}
                  onApply={(chip) => {
                    setChips((prev) => [...prev.filter((c) => c.field !== chip.field), chip]);
                    setPage(1);
                  }}
                  fields={[
                    { id: "name", label: "Name" },
                    { id: "category", label: "Category", options: productCategories },
                    { id: "stock", label: "Stock", options: ["In stock", "Low stock", "Out of stock"] },
                  ]}
                />
                <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by name, SKU, category" />
              </div>
            </div>
            <FilterChips
              items={chips}
              onRemove={(field) => {
                setChips((prev) => prev.filter((c) => c.field !== field));
                setPage(1);
              }}
            />
          </>
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
            <Th>
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
            {show("stock") ? <Th>Stock</Th> : null}
            {show("status") ? <Th>Status</Th> : null}
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {shown.map((row) => {
            const tone = stockTone(row);
            const pct = marginPct(row);
            return (
              <tr key={row.id} className={`is-${tone}`}>
                <Td>
                  <Checkbox
                    checked={selected.includes(row.id)}
                    onChange={(e) => {
                      setSelected((s) => (e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id)));
                    }}
                  />
                </Td>
                <Td>
                  {row.name}
                  {row.isLinear ? <span className="sub">Sold by meter</span> : null}
                  {row.packQty ? <span className="sub">Pack of {row.packQty}</span> : null}
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
                {show("stock") ? (
                  <Td numeric>
                    {row.stock} {row.unit}
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
          })}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(edit)}
        title={edit?.name ? "Edit product" : "Add product"}
        wide
        form
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="product-form">
            <Tabs
              value={formTab}
              onChange={setFormTab}
              items={[
                { id: "details", label: "Details" },
                { id: "pack", label: "Pack" },
                { id: "recipe", label: "Recipe" },
                { id: "warranty", label: "Warranty" },
              ]}
            />
            {formTab === "details" ? (
              <div className="product-form-pane">
                <div className="product-form-grid">
                  <Field label="Name" className="is-full">
                    <TextInput
                      autoFocus
                      placeholder="e.g. 1.5mm copper wire"
                      value={edit.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="SKU"
                    hint={settings.autoSku ? "Assigned when you save." : "Leave blank if you do not use SKUs."}
                  >
                    <TextInput
                      placeholder={settings.autoSku ? "Assigned when saved" : "Optional"}
                      value={edit.sku}
                      disabled={settings.autoSku}
                      onChange={(e) => patch({ sku: e.target.value })}
                    />
                  </Field>
                  <Field label="Category">
                    <SelectInput value={edit.category} onChange={(e) => patch({ category: e.target.value })}>
                      {productCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Unit">
                    <SelectInput
                      value={edit.unit}
                      onChange={(e) => patch({ unit: e.target.value as Product["unit"] })}
                    >
                      <option value="pc">Piece</option>
                      <option value="m">Meter</option>
                    </SelectInput>
                  </Field>
                  <div className="product-flag is-full">
                    <Toggle
                      checked={edit.isLinear}
                      onChange={(v) => patch({ isLinear: v, unit: v ? "m" : "pc" })}
                      label="Sold by length (wire, pipe)"
                    />
                  </div>
                  <Field label="Cost">
                    <MoneyInput
                      placeholder="0.00"
                      value={numStr(edit.cost)}
                      onChange={(e) => patch({ cost: numVal(e.target.value) })}
                    />
                  </Field>
                  <Field label="Minimum">
                    <MoneyInput
                      placeholder="0.00"
                      value={numStr(edit.min)}
                      onChange={(e) => patch({ min: numVal(e.target.value) })}
                    />
                  </Field>
                  <Field label="Wholesale">
                    <MoneyInput
                      placeholder="0.00"
                      value={numStr(edit.wholesale)}
                      onChange={(e) => patch({ wholesale: numVal(e.target.value) })}
                    />
                  </Field>
                  {!edit.packQty ? (
                    <Field label="Retail">
                      <MoneyInput
                        placeholder="0.00"
                        value={numStr(edit.retail)}
                        onChange={(e) => patch({ retail: numVal(e.target.value) })}
                      />
                    </Field>
                  ) : null}
                </div>
              </div>
            ) : null}
            {formTab === "pack" ? (
              <div className="product-form-pane">
                <div className="product-flag">
                  <Toggle
                    checked={edit.packQty != null}
                    onChange={(v) => {
                      if (!v) {
                        setEdit((cur) => (cur ? { ...cur, packQty: null, packPrice: 0 } : cur));
                        return;
                      }
                      setUnitManual(false);
                      setPackQty(edit.isLinear ? 90 : 12);
                    }}
                    label="This product is sold in a pack"
                  />
                </div>
                {edit.packQty != null ? (
                  <div className="product-form-grid">
                    <Field label="Pack size" hint={edit.isLinear ? "Meters in one coil." : "Pieces in one pack."}>
                      <TextInput
                        inputMode="numeric"
                        placeholder={edit.isLinear ? "e.g. 90" : "e.g. 12"}
                        value={numStr(edit.packQty)}
                        onChange={(e) => setPackQty(e.target.value === "" ? 0 : numVal(e.target.value))}
                      />
                    </Field>
                    <Field label="Pack price">
                      <MoneyInput
                        placeholder="0.00"
                        value={numStr(edit.packPrice)}
                        onChange={(e) => setPackPrice(numVal(e.target.value))}
                      />
                    </Field>
                    <Field
                      label="Unit price"
                      hint="Filled from pack price ÷ size. You can change it."
                      className="is-full"
                    >
                      <MoneyInput
                        placeholder="0.00"
                        value={numStr(edit.retail)}
                        onChange={(e) => {
                          setUnitManual(true);
                          patch({ retail: numVal(e.target.value) });
                        }}
                      />
                    </Field>
                  </div>
                ) : (
                  <p className="product-note">Turn this on for cartons, coils, or boxes. Pack price and unit price both stay here.</p>
                )}
              </div>
            ) : null}
            {formTab === "recipe" ? (
              <div className="product-form-pane">
                <div className="product-flag">
                  <Toggle
                    checked={edit.isManufactured}
                    onChange={(v) => patch({ isManufactured: v, components: v ? edit.components : [] })}
                    label="This is a production product"
                  />
                </div>
                {edit.isManufactured ? (
                  <>
                    <div className="product-bom-head">
                      <h3>Items used to make it</h3>
                      <Button
                        icon={<Plus size={14} />}
                        onClick={() =>
                          patch({
                            components: [...edit.components, { id: crypto.randomUUID(), productId: "", quantity: 1 }],
                          })
                        }
                      >
                        Add item
                      </Button>
                    </div>
                    <div className="product-bom">
                      {edit.components.length === 0 ? (
                        <p className="product-note">Add the parts, wire, or hardware that go into this product.</p>
                      ) : (
                        edit.components.map((line) => (
                          <div key={line.id} className="product-bom-row">
                            <Field label="Item">
                              <SelectInput
                                value={line.productId}
                                onChange={(e) =>
                                  patch({
                                    components: edit.components.map((c) =>
                                      c.id === line.id ? { ...c, productId: e.target.value } : c,
                                    ),
                                  })
                                }
                              >
                                <option value="">Choose item</option>
                                {rows
                                  .filter((r) => r.id !== edit.id)
                                  .map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name}
                                    </option>
                                  ))}
                              </SelectInput>
                            </Field>
                            <Field label="Qty">
                              <TextInput
                                inputMode="decimal"
                                placeholder="1"
                                value={numStr(line.quantity)}
                                onChange={(e) =>
                                  patch({
                                    components: edit.components.map((c) =>
                                      c.id === line.id ? { ...c, quantity: numVal(e.target.value) } : c,
                                    ),
                                  })
                                }
                              />
                            </Field>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Remove item"
                              onClick={() => patch({ components: edit.components.filter((c) => c.id !== line.id) })}
                            >
                              <Minus size={14} />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <p className="product-note">Turn this on for assembled or manufactured items, then list the components on this tab.</p>
                )}
              </div>
            ) : null}
            {formTab === "warranty" ? (
              <div className="product-form-pane">
                <p className="product-note">Leave duration blank if there is no warranty. Months is the default.</p>
                <div className="product-form-grid">
                  <Field label="Duration">
                    <TextInput
                      inputMode="numeric"
                      placeholder="e.g. 12"
                      value={numStr(edit.warrantyQty)}
                      onChange={(e) =>
                        patch({
                          warrantyQty: numVal(e.target.value),
                          warrantyDays: warrantyDaysOf(numVal(e.target.value), edit.warrantyUnit),
                        })
                      }
                    />
                  </Field>
                  <Field label="Unit">
                    <SelectInput
                      value={edit.warrantyUnit}
                      onChange={(e) => {
                        const warrantyUnit = e.target.value as Product["warrantyUnit"];
                        patch({
                          warrantyUnit,
                          warrantyDays: warrantyDaysOf(edit.warrantyQty, warrantyUnit),
                        });
                      }}
                    >
                      <option value="months">Months</option>
                      <option value="days">Days</option>
                    </SelectInput>
                  </Field>
                </div>
              </div>
            ) : null}
          </div>
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
          }
          setRemove(null);
        }}
      />
    </div>
  );
}
