import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Field,
  MoneyInput,
  SearchableSelect,
  Tabs,
  TextArea,
  TextInput,
  Toggle,
  toaster,
} from "@/components/common";
import { units as unitRows, suppliers, supplierName } from "@/shared/domain/mock";
import { productCategories } from "@/shared/mock";
import type { Product, ProductSellUnit } from "@/shared/types";
import { warrantyDaysOf, money } from "@/utils/format";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { blankProduct, fifoLot, fifoLots, lotTotals, openingLot, setLotDamage, setLotQty } from "@/pages/products/productLots";
import { LinkedUnitBoxes, UnitQtyFields } from "@/pages/products/LotFields";
import {
  baseUnit,
  biggerUnit,
  containsLabel,
  deriveAll,
  emptyPrices,
  extraKind,
  extraUnits,
  formatMixedQty,
  isBiggerSymbol,
  priceFromStock,
  pricePerStock,
  unitLabel,
} from "@/pages/products/productQty";

const SECTIONS = ["details", "units", "lots", "recipe", "warranty"] as const;
type Section = (typeof SECTIONS)[number];
type PriceKey = "cost" | "min" | "wholesale" | "price";
const KEEP_KEY = "pos.keepAddingProducts";

function numVal(raw: string) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function numStr(n: number) {
  return n ? String(n) : "";
}

function newExtraUnit(): ProductSellUnit {
  return {
    id: crypto.randomUUID(),
    name: "",
    symbol: "",
    kind: "smaller",
    contains: 0,
    ...emptyPrices(),
    barcode: "",
    priceManual: {},
  };
}

function normalizeKind(u: ProductSellUnit, product: Product): ProductSellUnit["kind"] {
  if (u.kind === "base" || u.kind === "bigger" || u.kind === "smaller") return u.kind;
  if (u.kind === "small") return "smaller";
  if (isBiggerSymbol(u.symbol) && u.symbol !== product.unit) return "bigger";
  if (u.symbol === product.unit || u.contains <= 1) return "base";
  return "smaller";
}

function defaultSellUnits(product: Product): ProductSellUnit[] {
  if (product.sellUnits?.length) {
    const mapped = product.sellUnits.map((u) => ({
      ...emptyPrices(),
      ...u,
      barcode: u.barcode ?? "",
      kind: normalizeKind(u, product),
      priceManual: u.priceManual ?? {},
    }));
    if (mapped.some((u) => u.kind === "base")) return mapped;
    const match = mapped.find((u) => u.symbol === product.unit) ?? mapped[0];
    return mapped.map((u) => (u.id === match.id ? { ...u, kind: "base" as const, contains: 1 } : u));
  }
  const packN = product.packQty && product.packQty > 1 ? product.packQty : null;
  const base: ProductSellUnit = {
    id: crypto.randomUUID(),
    name: unitLabel(product.unit),
    symbol: product.unit,
    kind: "base",
    contains: 1,
    cost: product.cost,
    min: product.min,
    wholesale: product.wholesale,
    price: product.retail,
    barcode: product.barcode ?? "",
    priceManual: {},
  };
  if (!packN) return [base];
  return [
    base,
    {
      id: crypto.randomUUID(),
      name: "Pack",
      symbol: "pk",
      kind: "bigger",
      contains: packN,
      cost: product.cost * packN,
      min: product.min * packN,
      wholesale: product.wholesale * packN,
      price: product.packPrice || product.retail * packN,
      barcode: "",
      priceManual: {},
    },
  ];
}

function focusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(
    "input:not([disabled]):not([type=hidden]):not([type=checkbox]), select:not([disabled]), textarea:not([disabled]), button.toggle, .product-inline-add",
  )].filter((el) => el.offsetParent !== null);
}

function focusField(root: HTMLElement, name: string) {
  const el = root.querySelector<HTMLElement>(`[data-field="${name}"]`);
  el?.focus();
  if (el instanceof HTMLInputElement) el.select();
}

export function ProductForm({
  product,
  catalog,
  onChange,
  onCommit,
  onClose,
}: {
  product: Product;
  catalog: Product[];
  onChange: (next: Product) => void;
  onCommit: (next: Product) => boolean;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>("details");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [keepAdding, setKeepAdding] = useState(() => sessionStorage.getItem(KEEP_KEY) === "1");
  const focusPane = useRef(false);
  const isNew = !catalog.some((r) => r.id === product.id);
  const { lots, setLots } = useProductsHub();
  const [lotDraft, setLotDraft] = useState(() => lots.filter((l) => l.productId === product.id));
  const [priceLotId, setPriceLotId] = useState("");
  const [lotOpened, setLotOpened] = useState<Record<string, number>>({});
  const sellUnits = defaultSellUnits(product);
  const base = baseUnit(sellUnits) ?? sellUnits[0];
  const pack = biggerUnit(sellUnits);
  const extras = extraUnits(sellUnits);
  const stockSymbol = product.unit || base.symbol || "pc";
  const priceLot = lotDraft.find((l) => l.id === priceLotId);
  const activeSuppliers = useMemo(() => {
    const ids = [...new Set(lotDraft.filter((l) => l.remainingQuantity > 0 && l.supplierId).map((l) => l.supplierId))];
    return ids.map((id) => ({
      id,
      name: supplierName(id) || id,
      lots: lotDraft.filter((l) => l.supplierId === id && l.remainingQuantity > 0).map((l) => l.lotNumber),
    }));
  }, [lotDraft]);
  const openPriceLots = lotDraft.filter((l) => l.remainingQuantity > 0 || l.damagedQuantity > 0);
  const sellingLot = fifoLot(lotDraft);
  const queuedLots = fifoLots(lotDraft).slice(1);
  const sections = useMemo(
    () =>
      SECTIONS.filter((id) => {
        if (id === "recipe") return product.isManufactured;
        if (id === "lots") return !isNew;
        return true;
      }),
    [product.isManufactured, isNew],
  );

  useEffect(() => {
    setSection("details");
    setError(null);
    const mine = lots.filter((l) => l.productId === product.id);
    if (mine.length) {
      setLotDraft(mine);
      setPriceLotId((mine.find((l) => l.remainingQuantity > 0) ?? mine[0]).id);
      setLotOpened(Object.fromEntries(mine.map((l) => [l.id, l.remainingQuantity])));
    } else if (!isNew && product.stock > 0) {
      const created = openingLot(product, lots);
      setLotDraft([created]);
      setPriceLotId(created.id);
      setLotOpened({ [created.id]: created.remainingQuantity });
    } else {
      setLotDraft([]);
      setPriceLotId("");
      setLotOpened({});
    }
    if (!product.sellUnits?.length) {
      onChange({ ...product, sellUnits: defaultSellUnits(product) });
    }
    requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      focusField(root, "name");
    });
  }, [product.id]);

  useEffect(() => {
    if (!sections.includes(section)) setSection("details");
  }, [sections, section]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(false), 1400);
    return () => window.clearTimeout(t);
  }, [flash]);

  function patch(next: Partial<Product>) {
    onChange({ ...product, sellUnits, ...next });
  }

  function setKeep(value: boolean) {
    setKeepAdding(value);
    sessionStorage.setItem(KEEP_KEY, value ? "1" : "0");
  }

  function setUnits(next: ProductSellUnit[]) {
    patch({ sellUnits: deriveAll(next) });
  }

  function setBaseUnit(v: string) {
    const next = deriveAll(
      sellUnits.map((row) =>
        row.id === base.id ? { ...row, symbol: v, name: unitLabel(v), kind: "base" as const } : row,
      ),
    );
    onChange({ ...product, sellUnits: next, unit: v, isLinear: v === "m" || v === "gaz" });
  }

  function setBaseField(key: PriceKey, value: number) {
    setUnits(sellUnits.map((u) => (u.id === base.id ? { ...u, [key]: value } : u)));
  }

  function setExtraField(id: string, patchRow: Partial<ProductSellUnit>, manual?: PriceKey) {
    setUnits(
      sellUnits.map((u) =>
        u.id === id
          ? {
              ...u,
              ...patchRow,
              priceManual: manual ? { ...u.priceManual, [manual]: true } : u.priceManual,
            }
          : u,
      ),
    );
  }

  function setUnitPrice(row: ProductSellUnit, key: PriceKey, value: number) {
    const isBase = row.kind === "base";
    if (priceLot && key === "cost") {
      setLotDraft((prev) =>
        prev.map((l) =>
          l.id === priceLot.id ? { ...l, purchasePrice: pricePerStock(sellUnits, stockSymbol, value, row) } : l,
        ),
      );
      return;
    }
    if (isBase) setBaseField(key, value);
    else setExtraField(row.id, { [key]: value }, key);
  }

  function unitPrice(row: ProductSellUnit, key: PriceKey) {
    if (priceLot && key === "cost") return priceFromStock(sellUnits, stockSymbol, priceLot.purchasePrice, row);
    return row[key];
  }

  function validate(): string | null {
    if (!product.name.trim()) return "name";
    if (!product.category) return "category";
    if (!(base?.symbol || product.unit)) return "unit";
    return null;
  }

  function save() {
    const field = validate();
    if (field) {
      setError(field);
      const jump: Record<string, Section> = { name: "details", category: "details", unit: "details" };
      setSection(jump[field] ?? "details");
      requestAnimationFrame(() => {
        if (rootRef.current) focusField(rootRef.current, field);
      });
      return;
    }
    const smaller = extras.filter((u) => u.kind === "smaller");
    const stock =
      smaller.find((u) => u.symbol === "m") ??
      smaller.find((u) => u.symbol === "gaz") ??
      (isBiggerSymbol(base.symbol) ? smaller[0] : base);
    const stockSymbol = stock?.symbol || base.symbol || product.unit;
    const packRow = pack ?? (isBiggerSymbol(base.symbol) ? base : undefined);
    const metersInPack = isBiggerSymbol(base.symbol)
      ? smaller.find((u) => u.symbol === "m" || u.symbol === stockSymbol)?.contains
      : packRow?.contains;
    const totals = isNew ? { stock: product.stock, damaged: product.damaged } : lotTotals(lotDraft);
    const next: Product = {
      ...product,
      name: product.name.trim(),
      sku: product.sku.trim(),
      barcode: product.barcode?.trim() ?? "",
      unit: stockSymbol,
      isLinear: stockSymbol === "m" || stockSymbol === "gaz",
      cost: stock?.cost ?? base.cost,
      min: stock?.min ?? base.min,
      wholesale: stock?.wholesale ?? base.wholesale,
      retail: stock?.price ?? base.price,
      packQty: metersInPack && metersInPack > 1 ? metersInPack : null,
      packPrice: packRow?.price ?? 0,
      stock: totals.stock,
      damaged: totals.damaged,
      sellUnits,
      warrantyEnabled: Boolean(product.warrantyEnabled && product.warrantyQty > 0),
      warrantyDays: product.warrantyEnabled ? warrantyDaysOf(product.warrantyQty, product.warrantyUnit) : 0,
      components: product.isManufactured ? product.components.filter((c) => c.productId && c.quantity > 0) : [],
    };
    const ok = onCommit(next);
    if (!ok) return;
    if (!isNew) {
      setLots((prev) => [...prev.filter((l) => l.productId !== product.id), ...lotDraft]);
    }
    if (keepAdding && isNew) {
      setFlash(true);
      setError(null);
      setSection("details");
      onChange(blankProduct());
      return;
    }
    toaster.success(isNew ? "Product added" : "Product saved");
    onClose();
  }

  function stepSection(dir: -1 | 1) {
    const i = sections.indexOf(section);
    const next = sections[i + dir];
    if (!next) return false;
    focusPane.current = true;
    setSection(next);
    return true;
  }

  useEffect(() => {
    if (!focusPane.current) return;
    focusPane.current = false;
    const pane = rootRef.current?.querySelector<HTMLElement>(".product-form-pane");
    if (!pane) return;
    const first = focusables(pane)[0];
    requestAnimationFrame(() => {
      first?.focus();
      if (first instanceof HTMLInputElement) first.select();
    });
  }, [section]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if ((e.target as HTMLElement).closest(".ui-combo-field.is-open")) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "F12" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        e.stopPropagation();
        save();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        e.stopPropagation();
        stepSection(e.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "n" || e.key === "N") && (section === "units" || section === "recipe")) {
        e.preventDefault();
        e.stopPropagation();
        if (section === "units") {
          setUnits([...sellUnits, newExtraUnit()]);
        } else {
          patch({ components: [...product.components, { id: crypto.randomUUID(), productId: "", quantity: 1 }] });
        }
        return;
      }

      const isEnter = e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey;
      if (!isEnter) return;
      const target = e.target as HTMLElement;
      if (target.closest("textarea") || target.closest(".ui-combo-field.is-open") || target.closest(".ui-combo-menu")) return;
      if (target.tagName === "BUTTON") return;

      const root = rootRef.current?.querySelector<HTMLElement>(".product-form-pane");
      if (!root) return;
      const items = focusables(root);
      const i = items.indexOf(target);
      e.preventDefault();
      e.stopPropagation();
      if (i < 0) {
        items[0]?.focus();
        return;
      }
      const next = items[i + (e.shiftKey ? -1 : 1)];
      if (next) {
        next.focus();
        if (next instanceof HTMLInputElement) next.select();
        return;
      }
      if (!stepSection(e.shiftKey ? -1 : 1)) {
        rootRef.current?.querySelector<HTMLButtonElement>(".product-form-actions .is-primary")?.focus();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const typeValue = product.isManufactured ? "manufactured" : "standard";

  return (
    <div className="product-form" ref={rootRef}>
      {flash ? (
        <p className="product-saved" role="status">
          <Check size={14} /> Product saved
        </p>
      ) : null}
      <div className="product-form-nav">
        <Tabs
          variant="line"
          skipTabOrder
          value={section}
          onChange={(id) => {
            if (id !== section) focusPane.current = true;
            setSection(id as Section);
          }}
          items={sections.map((id) => ({
            id,
            label:
              id === "details"
                ? "Details"
                : id === "units"
                  ? "Units & prices"
                  : id === "lots"
                    ? "Lots"
                    : id === "recipe"
                      ? "Recipe"
                      : "Warranty",
          }))}
        />
        <p className="product-nav-hint">
          <kbd className="ui-kbd">Ctrl</kbd>
          <kbd className="ui-kbd">←</kbd>
          <kbd className="ui-kbd">→</kbd>
          Switch
        </p>
      </div>

      {section === "details" ? (
        <div className="product-form-pane">
          <div className="product-form-grid">
            <Field label="Name" className="is-full" error={error === "name" ? "Name is required" : undefined}>
              <TextInput
                data-field="name"
                autoFocus
                placeholder="e.g. 1.5mm copper wire"
                value={product.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
            <Field label="Category" error={error === "category" ? "Choose a category" : undefined}>
              <SearchableSelect
                name="category"
                invalid={error === "category"}
                value={product.category}
                onChange={(v) => patch({ category: v })}
                placeholder="Choose category"
                searchPlaceholder="Type to search"
                options={productCategories.map((c) => ({ value: c, label: c }))}
                clearable={false}
              />
            </Field>
            <Field label="Unit" error={error === "unit" ? "Choose a unit" : undefined}>
              <SearchableSelect
                name="unit"
                invalid={error === "unit"}
                value={base?.symbol ?? product.unit}
                onChange={(v) => setBaseUnit(v)}
                placeholder="Choose unit"
                searchPlaceholder="Type to search"
                options={unitRows.map((u) => ({ value: u.symbol, label: u.name }))}
                clearable={false}
              />
            </Field>
            {isNew ? (
              <div className="product-qty-field is-full">
                <UnitQtyFields
                  label="Quantity"
                  units={sellUnits}
                  stockSymbol={product.unit || base.symbol || "pc"}
                  value={product.stock}
                  onChange={(n) => patch({ stock: n })}
                />
              </div>
            ) : (
              <div className="product-qty-field is-full">
                <LinkedUnitBoxes
                  label="Total quantity (all lots)"
                  units={sellUnits}
                  stockSymbol={stockSymbol}
                  stockQty={lotTotals(lotDraft).stock}
                />
              </div>
            )}
            {isNew ? (
              <Field label="Supplier">
                <SearchableSelect
                  value={product.supplierId ?? ""}
                  onChange={(v) => patch({ supplierId: v })}
                  placeholder="Optional"
                  searchPlaceholder="Type to search"
                  options={suppliers.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
            ) : (
              <div className="product-supplier-list is-full">
                <span className="field-label">Suppliers</span>
                {activeSuppliers.length === 0 ? (
                  <p className="product-note">No active lots. Suppliers show here when a lot still has quantity.</p>
                ) : (
                  <div className="ui-chip-row">
                    {activeSuppliers.map((s) => (
                      <span key={s.id} className="ui-chip">
                        <span className="ui-chip-label">{s.name}</span>
                        <span className="ui-chip-value">{s.lots.join(", ")}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isNew ? (
              <>
            <Field label="Purchase cost">
              <MoneyInput
                data-field="cost"
                placeholder="0.00"
                value={numStr(base?.cost ?? product.cost)}
                onChange={(e) => setBaseField("cost", numVal(e.target.value))}
              />
            </Field>
            <Field label="Min price">
              <MoneyInput
                data-field="min"
                placeholder="0.00"
                value={numStr(base?.min ?? product.min)}
                onChange={(e) => setBaseField("min", numVal(e.target.value))}
              />
            </Field>
            <Field label="Wholesale price">
              <MoneyInput
                data-field="wholesale"
                placeholder="0.00"
                value={numStr(base?.wholesale ?? product.wholesale)}
                onChange={(e) => setBaseField("wholesale", numVal(e.target.value))}
              />
            </Field>
            <Field label="Retail price">
              <MoneyInput
                data-field="retail"
                placeholder="0.00"
                value={numStr(base?.price ?? product.retail)}
                onChange={(e) => setBaseField("price", numVal(e.target.value))}
              />
            </Field>
              </>
            ) : (
              <div className="product-fifo is-full">
                {sellingLot ? (
                  <>
                    <p className="product-note">
                      <strong>{sellingLot.lotNumber} · FIFO selling now</strong>
                      <span>Received {sellingLot.receivedAt}</span>
                    </p>
                    <div className="product-fifo-meta">
                      <Field label="Current price">
                        <TextInput
                          disabled
                          value={`${money(sellingLot.purchasePrice)}/${unitLabel(stockSymbol)}`}
                        />
                      </Field>
                      <Field label="Lot supplier">
                        <TextInput disabled value={supplierName(sellingLot.supplierId) || "—"} />
                      </Field>
                    </div>
                    <div className="product-fifo-table">
                      <div className="product-fifo-row is-head">
                        <span>Unit</span>
                        <span>Cost</span>
                        <span>Min</span>
                        <span>Wholesale</span>
                        <span>Retail</span>
                      </div>
                      {sellUnits.map((row) => (
                        <div key={row.id} className="product-fifo-row">
                          <span>{row.name || unitLabel(row.symbol || product.unit)}</span>
                          <span>{money(priceFromStock(sellUnits, stockSymbol, sellingLot.purchasePrice, row))}</span>
                          <span>{money(row.min)}</span>
                          <span>{money(row.wholesale)}</span>
                          <span>{money(row.price)}</span>
                        </div>
                      ))}
                    </div>
                    {queuedLots.length > 0 ? (
                      <p className="product-note">
                        <span>
                          Next {queuedLots.map((l) => `${l.lotNumber} ${money(l.purchasePrice)}/${unitLabel(stockSymbol)}`).join(" · ")}
                        </span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="product-note">
                    <strong>FIFO prices</strong>
                    <span>No open lot. Receive stock to set the selling cost.</span>
                  </p>
                )}
              </div>
            )}
            <Field label="Product type">
              <SearchableSelect
                value={typeValue}
                onChange={(v) => patch({ isManufactured: v === "manufactured", components: v === "manufactured" ? product.components : [] })}
                placeholder="Standard"
                searchPlaceholder="Type to search"
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "manufactured", label: "Manufactured" },
                ]}
                clearable={false}
              />
            </Field>
          </div>
        </div>
      ) : null}

      {section === "units" ? (
        <div className="product-form-pane">
          {!isNew && openPriceLots.length > 0 ? (
            <Field label="Lot">
              <SearchableSelect
                value={priceLotId}
                onChange={setPriceLotId}
                placeholder="Choose lot"
                searchPlaceholder="Search lots"
                clearable={false}
                options={openPriceLots.map((l) => ({
                  value: l.id,
                  label: `${l.lotNumber} · ${supplierName(l.supplierId) || "No supplier"} · ${formatMixedQty(product, l.remainingQuantity)} left`,
                }))}
              />
            </Field>
          ) : null}
          {priceLot ? (
            <p className="product-note">
              <strong>{priceLot.lotNumber}</strong>
              <span>Supplier {supplierName(priceLot.supplierId) || "—"}. Cost is this lot’s buy price. Min / wholesale / retail are sell prices.</span>
            </p>
          ) : (
            <p className="product-note">
              <strong>Units & prices</strong>
              <span>Add a pack or another unit if you need it. Extra prices fill in from the product unit.</span>
            </p>
          )}
          <div className="product-small-list">
            {sellUnits.map((row) => {
              const isBase = row.kind === "base";
              return (
                <div key={row.id} className={isBase ? "product-small-card is-base" : "product-small-card"}>
                  <div className="product-small-top">
                    <Field label={isBase ? "Product unit" : "Sell as"}>
                      <SearchableSelect
                        value={row.symbol ?? ""}
                        onChange={(v) => {
                          if (isBase) {
                            setBaseUnit(v);
                            return;
                          }
                          setExtraField(row.id, { symbol: v, name: unitLabel(v), kind: extraKind(v) });
                        }}
                        placeholder="Pack, Meter, Gaz…"
                        searchPlaceholder="Type to search"
                        options={unitRows
                          .filter((u) => !sellUnits.some((other) => other.id !== row.id && other.symbol === u.symbol))
                          .map((u) => ({ value: u.symbol, label: u.name }))}
                        clearable={false}
                      />
                    </Field>
                    {isBase ? (
                      <Field label="Contains">
                        <TextInput value="1" disabled />
                      </Field>
                    ) : (
                      <Field label={containsLabel(base, pack, row)}>
                        <TextInput
                          inputMode="decimal"
                          placeholder="90"
                          value={numStr(row.contains)}
                          onChange={(e) => setExtraField(row.id, { contains: numVal(e.target.value) })}
                        />
                      </Field>
                    )}
                    {isBase ? <span /> : (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove unit"
                        onClick={() => setUnits(sellUnits.filter((u) => u.id !== row.id))}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                  <div className="product-small-prices">
                    {(
                      [
                        ["cost", "Cost"],
                        ["min", "Min"],
                        ["wholesale", "Wholesale"],
                        ["price", "Retail"],
                      ] as const
                    ).map(([key, label]) => (
                      <Field key={key} label={label}>
                        <MoneyInput
                          placeholder="0.00"
                          value={numStr(unitPrice(row, key))}
                          onChange={(e) => setUnitPrice(row, key, numVal(e.target.value))}
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            className="product-inline-add"
            icon={<Plus size={14} />}
            onClick={() => setUnits([...sellUnits, newExtraUnit()])}
          >
            Add unit
            <kbd className="ui-kbd">Ctrl+N</kbd>
          </Button>
        </div>
      ) : null}

      {section === "recipe" ? (
        <div className="product-form-pane">
          <p className="product-note">Components used to make this product. Quantity is in each component’s base unit.</p>
          <div className="product-unit-table is-recipe">
            <div className="product-unit-head">
              <span>Component</span>
              <span>Quantity</span>
              <span>Unit</span>
              <span />
            </div>
            {product.components.length === 0 ? (
              <p className="product-note">No components yet.</p>
            ) : (
              product.components.map((line) => {
                const part = catalog.find((r) => r.id === line.productId);
                return (
                  <div key={line.id} className="product-unit-row">
                    <SearchableSelect
                      value={line.productId}
                      onChange={(v) =>
                        patch({
                          components: product.components.map((c) => (c.id === line.id ? { ...c, productId: v } : c)),
                        })
                      }
                      placeholder="Choose item"
                      searchPlaceholder="Type to search"
                      options={catalog.filter((r) => r.id !== product.id).map((r) => ({ value: r.id, label: r.name }))}
                    />
                    <TextInput
                      inputMode="decimal"
                      placeholder="1"
                      value={numStr(line.quantity)}
                      onChange={(e) =>
                        patch({
                          components: product.components.map((c) =>
                            c.id === line.id ? { ...c, quantity: numVal(e.target.value) } : c,
                          ),
                        })
                      }
                    />
                    <TextInput value={part ? unitLabel(part.unit) : "—"} disabled />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remove component"
                      onClick={() => patch({ components: product.components.filter((c) => c.id !== line.id) })}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
          <Button
            className="product-inline-add"
            icon={<Plus size={14} />}
            onClick={() =>
              patch({ components: [...product.components, { id: crypto.randomUUID(), productId: "", quantity: 1 }] })
            }
          >
            Add component
            <kbd className="ui-kbd">Ctrl+N</kbd>
          </Button>
        </div>
      ) : null}

      {section === "lots" ? (
        <div className="product-form-pane">
          <p className="product-note">
            <strong>Open lots</strong>
            <span>Each lot has its own cost. Qty and damage can be Pack, Meter, Gaz — they convert to stock.</span>
          </p>
          <div className="product-small-list">
            {lotDraft.filter((l) => l.remainingQuantity > 0 || l.damagedQuantity > 0).length === 0 ? (
              <p className="product-note">No open lots. Receive stock from Products → Lots.</p>
            ) : (
              lotDraft
                .filter((l) => l.remainingQuantity > 0 || l.damagedQuantity > 0)
                .map((lot) => {
                  const opened = lotOpened[lot.id] ?? lot.remainingQuantity;
                  const changed = Math.abs(lot.remainingQuantity - opened) > 1e-6;
                  return (
                  <div key={lot.id} className="product-small-card">
                    <div className="product-lot-head">
                      <strong>{lot.lotNumber}</strong>
                      <span>{supplierName(lot.supplierId) || "No supplier"}</span>
                    </div>
                    <Field label="Supplier">
                      <SearchableSelect
                        value={lot.supplierId}
                        onChange={(v) =>
                          setLotDraft((prev) => prev.map((row) => (row.id === lot.id ? { ...row, supplierId: v } : row)))
                        }
                        placeholder="Choose supplier"
                        searchPlaceholder="Search suppliers"
                        options={suppliers.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name }))}
                        clearable={false}
                      />
                    </Field>
                    <UnitQtyFields
                      label="Qty left"
                      units={sellUnits}
                      stockSymbol={stockSymbol}
                      value={lot.remainingQuantity}
                      onChange={(n) =>
                        setLotDraft((prev) => prev.map((row) => (row.id === lot.id ? setLotQty(row, n) : row)))
                      }
                    />
                    {changed ? (
                      <p className="product-lot-adjusted">
                        Adjusted {formatMixedQty(product, opened)} → {formatMixedQty(product, lot.remainingQuantity)}
                      </p>
                    ) : null}
                    <UnitQtyFields
                      label="Damaged"
                      units={sellUnits}
                      stockSymbol={stockSymbol}
                      value={lot.damagedQuantity}
                      onChange={(n) =>
                        setLotDraft((prev) => prev.map((row) => (row.id === lot.id ? setLotDamage(row, n) : row)))
                      }
                    />
                  </div>
                  );
                })
            )}
          </div>
        </div>
      ) : null}

      {section === "warranty" ? (
        <div className="product-form-pane">
          <div className="product-flag">
            <Toggle
              checked={Boolean(product.warrantyEnabled)}
              onChange={(v) => patch({ warrantyEnabled: v, warrantyQty: v ? product.warrantyQty || 12 : 0 })}
              label="Warranty enabled"
            />
          </div>
          {product.warrantyEnabled ? (
            <div className="product-form-grid">
              <Field label="Duration">
                <TextInput
                  inputMode="numeric"
                  placeholder="12"
                  value={numStr(product.warrantyQty)}
                  onChange={(e) => patch({ warrantyQty: numVal(e.target.value) })}
                />
              </Field>
              <Field label="Unit">
                <SearchableSelect
                  value={product.warrantyUnit}
                  onChange={(v) => patch({ warrantyUnit: v as Product["warrantyUnit"] })}
                  placeholder="Months"
                  searchPlaceholder="Type to search"
                  options={[
                    { value: "months", label: "Months" },
                    { value: "days", label: "Days" },
                  ]}
                  clearable={false}
                />
              </Field>
              <Field label="Note" className="is-full">
                <TextArea
                  className="is-compact"
                  rows={2}
                  placeholder="Optional warranty note"
                  value={product.warrantyNote ?? ""}
                  onChange={(e) => patch({ warrantyNote: e.target.value })}
                />
              </Field>
            </div>
          ) : (
            <p className="product-note">Turn warranty on only when this product is covered.</p>
          )}
        </div>
      ) : null}

      <div className="product-form-foot">
        {isNew ? (
          <label className="product-keep">
            <Checkbox checked={keepAdding} onChange={(e) => setKeep(e.target.checked)} />
            <span>
              <strong>Keep adding after save</strong>
              <small>Save this product and immediately open a fresh form.</small>
            </span>
          </label>
        ) : (
          <span />
        )}
        <div className="product-form-actions">
          <Button onClick={onClose}>
            Cancel
            <kbd className="ui-kbd">Esc</kbd>
          </Button>
          <Button variant="primary" onClick={save}>
            Save product
            <kbd className="ui-kbd">F12</kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}
