import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Factory, Package, Check, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Field,
  MoneyInput,
  ProductQuantityPicker,
  SearchableSelect,
  Tabs,
  TextArea,
  TextInput,
  Toggle,
  toaster,
} from "@/components/common";
import { STORAGE_KEYS, MAX_PAGE_SIZE } from "@/shared/constants/config";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import {
  PRODUCT_COPY,
  PRODUCT_FORM_SECTIONS,
  type ProductFormSection,
} from "@/shared/constants/products";
import { listAllBranches } from "@/services/org";
import type { Product, ProductSellUnit } from "@/shared/types";
import { money, shortError, warrantyDaysOf } from "@/utils/format";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import {
  blankProduct,
  fifoLot,
  fifoLots,
  lotTotals,
  openingLot,
  setLotDamage,
  setLotQty,
} from "@/pages/products/productLots";
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
  formatStockQty,
  isBiggerSymbol,
  priceFromStock,
  pricePerStock,
  productSellUnits,
  qtyUnits,
  unitInStock,
  unitLabel,
} from "@/pages/products/productQty";
import { createMasterRecord, listMasterRecords } from "@/services/masters";

type PriceKey = "cost" | "min" | "wholesale" | "price";

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
    return mapped.map((u) =>
      u.id === match.id ? { ...u, kind: "base" as const, contains: 1 } : u,
    );
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
  return [
    ...root.querySelectorAll<HTMLElement>(
      "input:not([disabled]):not([type=hidden]):not([type=checkbox]), select:not([disabled]), textarea:not([disabled]), button.toggle, .product-inline-add",
    ),
  ].filter((el) => el.offsetParent !== null);
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
  saving = false,
}: {
  product: Product;
  catalog: Product[];
  onChange: (next: Product) => void;
  onCommit: (
    next: Product,
    branchQuantities?: Record<string, number>,
  ) => boolean | Promise<boolean>;
  onClose: () => void;
  saving?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<ProductFormSection>("details");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [keepAdding, setKeepAdding] = useState(
    () => sessionStorage.getItem(STORAGE_KEYS.keepAddingProducts) === "1",
  );
  const focusPane = useRef(false);
  const unitCards = useRef<Record<string, HTMLDivElement | null>>({});
  const unitPositions = useRef(new Map<string, DOMRect>());
  const changedUnitId = useRef<string | null>(null);
  const isNew = !catalog.some((r) => r.id === product.id);
  const {
    lots,
    setLots,
    categories: hubCategories,
    units: hubUnits,
    suppliers: hubSuppliers,
    refreshHub,
  } = useProductsHub();
  const [localCategories, setLocalCategories] = useState<{ id: string; name: string }[]>([]);
  const [localUnits, setLocalUnits] = useState<{ id: string; name: string; symbol: string }[]>([]);
  const [localSuppliers, setLocalSuppliers] = useState<
    { id: string; name: string; isActive: boolean }[]
  >([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchQuantities, setBranchQuantities] = useState<Record<string, number>>({});
  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of [...hubCategories, ...localCategories]) names.add(row.name);
    if (product.category) names.add(product.category);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [hubCategories, localCategories, product.category]);
  const unitRows = hubUnits.length ? hubUnits : localUnits;
  const suppliers = hubSuppliers.length ? hubSuppliers : localSuppliers;
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "";

  useEffect(() => {
    if (hubCategories.length && hubUnits.length && hubSuppliers.length) return;
    const controller = new AbortController();
    void Promise.all([
      listMasterRecords("categories", { perPage: MAX_PAGE_SIZE, isActive: true }, controller.signal)
        .then((r) => setLocalCategories(r.data.map(({ id, name }) => ({ id, name }))))
        .catch(() => undefined),
      listMasterRecords("units", { perPage: MAX_PAGE_SIZE, isActive: true }, controller.signal)
        .then((r) =>
          setLocalUnits(r.data.map(({ id, name, symbol }) => ({ id, name, symbol: symbol ?? "" }))),
        )
        .catch(() => undefined),
      listMasterRecords("suppliers", { perPage: MAX_PAGE_SIZE }, controller.signal)
        .then((r) =>
          setLocalSuppliers(r.data.map(({ id, name, isActive }) => ({ id, name, isActive }))),
        )
        .catch(() => undefined),
    ]);
    return () => controller.abort();
  }, [hubCategories.length, hubUnits.length, hubSuppliers.length]);

  const [lotDraft, setLotDraft] = useState(() => lots.filter((l) => l.productId === product.id));
  const [priceLotId, setPriceLotId] = useState("");
  const [lotOpened, setLotOpened] = useState<Record<string, number>>({});
  const sellUnits = qtyUnits(defaultSellUnits(product));
  const unitLayoutKey = sellUnits
    .map((unit) => `${unit.id}:${unit.kind}:${unit.contains}`)
    .join("|");
  const base = baseUnit(sellUnits) ?? sellUnits[0];
  const pack = biggerUnit(sellUnits);
  const extras = extraUnits(sellUnits);
  const stockSymbol = product.unit || base.symbol || "pc";
  const priceLot = lotDraft.find((l) => l.id === priceLotId);
  const activeSuppliers = useMemo(() => {
    const ids = [
      ...new Set(
        lotDraft.filter((l) => l.remainingQuantity > 0 && l.supplierId).map((l) => l.supplierId),
      ),
    ];
    return ids.map((id) => ({
      id,
      name: supplierName(id) || id,
      lots: lotDraft
        .filter((l) => l.supplierId === id && l.remainingQuantity > 0)
        .map((l) => l.lotNumber),
    }));
  }, [lotDraft, suppliers]);
  const openPriceLots = lotDraft.filter((l) => l.remainingQuantity > 0 || l.damagedQuantity > 0);
  const sellingLot = fifoLot(lotDraft);
  const queuedLots = fifoLots(lotDraft).slice(1);
  const branchTotal = useMemo(
    () =>
      Object.values(branchQuantities).reduce(
        (sum, qty) => sum + (Number.isFinite(qty) ? qty : 0),
        0,
      ),
    [branchQuantities],
  );

  const sections = useMemo(
    () =>
      PRODUCT_FORM_SECTIONS.filter((id) => {
        if (id === "recipe") return product.isManufactured;
        if (id === "lots") return !isNew;
        if (id === "branches") return isNew;
        return true;
      }),
    [product.isManufactured, isNew],
  );

  useEffect(() => {
    const controller = new AbortController();
    listAllBranches(controller.signal)
      .then((rows) =>
        setBranches(
          rows.filter((row) => row.isActive).map((row) => ({ id: row.id, name: row.name })),
        ),
      )
      .catch(() => setBranches([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isNew) return;
    setBranchQuantities((current) => {
      const next: Record<string, number> = {};
      for (const branch of branches) {
        next[branch.id] = current[branch.id] ?? 0;
      }
      return next;
    });
  }, [branches, isNew, product.id]);

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

  useLayoutEffect(() => {
    if (section !== "units") {
      unitPositions.current.clear();
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextPositions = new Map<string, DOMRect>();
    sellUnits.forEach((unit) => {
      const element = unitCards.current[unit.id];
      if (!element) return;
      const next = element.getBoundingClientRect();
      nextPositions.set(unit.id, next);
      const previous = unitPositions.current.get(unit.id);
      if (!previous || reducedMotion) return;
      const deltaY = previous.top - next.top;
      if (Math.abs(deltaY) < 1) return;
      const changed = changedUnitId.current === unit.id;
      element.animate(
        [
          {
            transform: `translateY(${deltaY}px)`,
            boxShadow: changed
              ? "0 0 0 2px var(--accent), 0 10px 24px rgba(15, 159, 143, 0.18)"
              : "none",
          },
          {
            transform: "translateY(0)",
            boxShadow: changed ? "0 0 0 0 transparent, 0 0 0 transparent" : "none",
          },
        ],
        { duration: changed ? 360 : 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });
    unitPositions.current = nextPositions;
    changedUnitId.current = null;
  }, [section, unitLayoutKey]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(false), 1400);
    return () => window.clearTimeout(t);
  }, [flash]);

  function patch(next: Partial<Product>) {
    onChange({ ...product, sellUnits, ...next });
  }

  async function addCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed || creatingCategory) return;
    setCreatingCategory(true);
    try {
      const created = await createMasterRecord("categories", { name: trimmed, isActive: true });
      setLocalCategories((current) =>
        current.some((row) => row.id === created.id)
          ? current
          : [...current, { id: created.id, name: created.name }],
      );
      await refreshHub();
      patch({ category: created.name, categoryId: created.id });
      toaster.success("Category added");
    } catch (error) {
      toaster.error(shortError(error, "Could not add category"));
    } finally {
      setCreatingCategory(false);
    }
  }

  function setKeep(value: boolean) {
    setKeepAdding(value);
    sessionStorage.setItem(STORAGE_KEYS.keepAddingProducts, value ? "1" : "0");
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
    if (patchRow.kind || patchRow.symbol || patchRow.contains !== undefined)
      changedUnitId.current = id;
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
          l.id === priceLot.id
            ? { ...l, purchasePrice: pricePerStock(sellUnits, stockSymbol, value, row) }
            : l,
        ),
      );
      return;
    }
    if (isBase) setBaseField(key, value);
    else setExtraField(row.id, { [key]: value }, key);
  }

  function unitPrice(row: ProductSellUnit, key: PriceKey) {
    if (priceLot && key === "cost")
      return priceFromStock(sellUnits, stockSymbol, priceLot.purchasePrice, row);
    return row[key];
  }

  function validate(): string | null {
    if (!product.name.trim()) return "name";
    if (!product.category) return "category";
    if (!(base?.symbol || product.unit)) return "unit";
    return null;
  }

  async function save() {
    if (saving) return;
    const field = validate();
    if (field) {
      setError(field);
      const jump: Record<string, ProductFormSection> = {
        name: "details",
        category: "details",
        unit: "details",
      };
      setSection(jump[field] ?? "details");
      requestAnimationFrame(() => {
        if (rootRef.current) focusField(rootRef.current, field);
      });
      return;
    }
    const insufficient = product.components.find((line) => {
      const component = catalog.find((row) => row.id === line.productId);
      if (!component) return false;
      const units = productSellUnits(component);
      const selectedUnit =
        units.find((unit) => unit.id === line.unitId) ??
        units.find((unit) => unit.symbol === component.unit) ??
        units[0];
      return (
        !selectedUnit ||
        line.quantity * unitInStock(units, component.unit, selectedUnit) > component.stock + 1e-6
      );
    });
    if (insufficient) {
      const component = catalog.find((row) => row.id === insufficient.productId);
      setSection("recipe");
      toaster.warn(`${component?.name ?? "Component"} does not have enough stock`);
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
    const totals = isNew ? { stock: branchTotal, damaged: product.damaged } : lotTotals(lotDraft);
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
      stock: isNew ? branchTotal : totals.stock,
      damaged: totals.damaged,
      sellUnits,
      warrantyEnabled: Boolean(product.warrantyEnabled && product.warrantyQty > 0),
      warrantyDays: product.warrantyEnabled
        ? warrantyDaysOf(product.warrantyQty, product.warrantyUnit)
        : 0,
      components: product.isManufactured
        ? product.components.filter((c) => c.productId && c.quantity > 0)
        : [],
    };
    const ok = await Promise.resolve(onCommit(next, isNew ? branchQuantities : undefined));
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
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "n" || e.key === "N") &&
        (section === "units" || section === "recipe")
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (section === "units") {
          setUnits([...sellUnits, newExtraUnit()]);
        } else {
          patch({
            components: [
              ...product.components,
              { id: crypto.randomUUID(), productId: "", quantity: 1 },
            ],
          });
        }
        return;
      }

      const isEnter = e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey;
      if (!isEnter) return;
      const target = e.target as HTMLElement;
      if (
        target.closest("textarea") ||
        target.closest(".product-search.is-open") ||
        target.closest(".ui-combo-field.is-open") ||
        target.closest(".ui-combo-menu")
      )
        return;
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
        rootRef.current
          ?.querySelector<HTMLButtonElement>(".product-form-actions .is-primary")
          ?.focus();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const typeValue = product.isManufactured ? "manufactured" : "standard";

  return (
    <div
      className="product-form [position:relative] [display:flex] [flex-direction:column] [flex:1] [min-height:0] [min-width:0] [height:100%] [overflow:hidden]"
      ref={rootRef}
    >
      {flash ? (
        <p
          className="product-saved [position:absolute] [top:10px] [left:50%] [z-index:4] [display:flex] [align-items:center] [gap:6px] [margin:0] [padding:6px_12px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [box-shadow:0_8px_20px_rgba(15,_23,_42,_0.12)] [font-size:12px] [font-weight:700] [color:var(--accent-deep)] [transform:translateX(-50%)] [pointer-events:none]"
          role="status"
        >
          <Check size={14} /> Product saved
        </p>
      ) : null}
      <div className="product-form-nav [display:flex] [align-items:center] [justify-content:space-between] [gap:8px] [padding:0_16px] [border-bottom:1px_solid_var(--line)] [flex-shrink:0] [min-width:0]">
        <Tabs
          variant="line"
          skipTabOrder
          value={section}
          onChange={(id) => {
            if (id !== section) focusPane.current = true;
            setSection(id as ProductFormSection);
          }}
          items={sections.map((id) => ({
            id,
            tone: id === "recipe" ? ("recipe" as const) : undefined,
            label:
              id === "details"
                ? "Details"
                : id === "branches"
                  ? "Branches"
                  : id === "units"
                    ? "Units & prices"
                    : id === "lots"
                      ? "Lots"
                      : id === "recipe"
                        ? "Recipe"
                        : "Warranty",
          }))}
        />
        <p className="product-nav-hint [margin:0] [display:inline-flex] [align-items:center] [gap:4px] [font-size:11px] [color:var(--muted)] [white-space:nowrap] [flex-shrink:0]">
          <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
            Ctrl
          </kbd>
          <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
            ←
          </kbd>
          <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
            →
          </kbd>
          Switch
        </p>
      </div>

      {section === "details" ? (
        <div className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]">
          <div className="product-form-grid [display:grid] [grid-template-columns:1fr_1fr] [gap:10px_14px]">
            <Field
              label="Name"
              className="is-full"
              error={error === "name" ? "Name is required" : undefined}
            >
              <TextInput
                data-field="name"
                autoFocus
                maxLength={FIELD_LIMITS.productName}
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
                searchPlaceholder="Type to search or add"
                options={categoryOptions.map((c) => ({ value: c, label: c }))}
                clearable={false}
                disabled={creatingCategory}
                onCreate={(label) => void addCategory(label)}
                createLabel="Add category"
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
            {!isNew ? (
              <div className="product-qty-field [display:grid] [gap:6px] is-full">
                <LinkedUnitBoxes
                  label="Total quantity (all lots)"
                  units={sellUnits}
                  stockSymbol={stockSymbol}
                  stockQty={lotTotals(lotDraft).stock}
                />
              </div>
            ) : null}
            {isNew ? (
              <Field label="Supplier">
                <SearchableSelect
                  value={product.supplierId ?? ""}
                  onChange={(v) => patch({ supplierId: v })}
                  placeholder="Optional"
                  searchPlaceholder="Type to search"
                  options={suppliers
                    .filter((s) => s.isActive)
                    .map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
            ) : (
              <div className="product-supplier-list [display:grid] [gap:6px]">
                <span className="field-label [font-size:12px] [font-weight:600] [color:var(--sub)]">
                  Suppliers
                </span>
                {activeSuppliers.length === 0 ? (
                  <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
                    No active lots. Suppliers show here when a lot still has quantity.
                  </p>
                ) : (
                  <div className="ui-chip-row [display:flex] [flex-wrap:wrap] [gap:6px]">
                    {activeSuppliers.map((s) => (
                      <span
                        key={s.id}
                        className="ui-chip [display:inline-flex] [align-items:center] [gap:6px] [height:26px] [padding:0_8px_0_10px] [border:1px_solid_color-mix(in_srgb,_var(--accent)_28%,_transparent)] [border-radius:999px] [background:var(--accent-bg)] [color:var(--accent-deep)] [font-size:11px] [font-weight:650] [cursor:pointer]"
                      >
                        <span className="ui-chip-label [opacity:0.75]">{s.name}</span>
                        <span className="ui-chip-value [max-width:140px] [overflow:hidden] [text-overflow:ellipsis] [white-space:nowrap]">
                          {s.lots.join(", ")}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Field label="Product type">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Product type">
                {(
                  [
                    { id: "standard", label: "Standard", icon: Package },
                    { id: "manufactured", label: "Manufactured", icon: Factory },
                  ] as const
                ).map((option) => {
                  const selected = typeValue === option.id;
                  const Icon = option.icon;
                  const selectedStyle =
                    option.id === "manufactured"
                      ? "border-violet-500 bg-violet-50 text-violet-700 ring-violet-500/10"
                      : "border-accent bg-accent-bg text-accent-deep ring-accent/10";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={
                        selected
                          ? `grid h-[38px] grid-cols-[14px_minmax(0,1fr)_12px] items-center gap-1.5 rounded-lg border px-2 text-[11px] font-bold ring-2 ${selectedStyle}`
                          : "grid h-[38px] grid-cols-[14px_minmax(0,1fr)_12px] items-center gap-1.5 rounded-lg border border-line bg-paper px-2 text-[11px] font-semibold text-sub hover:border-accent/50 hover:bg-bg"
                      }
                      onClick={() =>
                        patch({
                          isManufactured: option.id === "manufactured",
                          components: option.id === "manufactured" ? product.components : [],
                        })
                      }
                    >
                      <Icon size={14} />
                      <span className="text-center">{option.label}</span>
                      <Check size={12} className={selected ? "visible" : "invisible"} />
                    </button>
                  );
                })}
              </div>
            </Field>
            {isNew ? (
              <div className="is-full grid grid-cols-2 gap-x-3.5 gap-y-2.5">
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
              </div>
            ) : (
              <div className="product-fifo [display:grid] [gap:8px] is-full">
                {sellingLot ? (
                  <>
                    <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
                      <strong>{sellingLot.lotNumber} · FIFO selling now</strong>
                    </p>
                    <div className="product-fifo-meta [display:grid] [grid-template-columns:1fr_1fr] [gap:10px_14px]">
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
                    <div className="product-fifo-table [border:1px_solid_var(--line)] [border-radius:8px] [overflow:hidden] [background:var(--paper)]">
                      <div className="product-fifo-row [display:grid] [grid-template-columns:minmax(64px,_1fr)_repeat(4,_minmax(52px,_1fr))] [gap:4px] [padding:7px_8px] [font-size:11px] [font-variant-numeric:tabular-nums] is-head">
                        <span>Unit</span>
                        <span>Cost</span>
                        <span>Min</span>
                        <span>Wholesale</span>
                        <span>Retail</span>
                      </div>
                      {sellUnits.map((row) => (
                        <div
                          key={row.id}
                          className="product-fifo-row [display:grid] [grid-template-columns:minmax(64px,_1fr)_repeat(4,_minmax(52px,_1fr))] [gap:4px] [padding:7px_8px] [font-size:11px] [font-variant-numeric:tabular-nums]"
                        >
                          <span>{row.name || unitLabel(row.symbol || product.unit)}</span>
                          <span>
                            {money(
                              priceFromStock(sellUnits, stockSymbol, sellingLot.purchasePrice, row),
                            )}
                          </span>
                          <span>{money(row.min)}</span>
                          <span>{money(row.wholesale)}</span>
                          <span>{money(row.price)}</span>
                        </div>
                      ))}
                    </div>
                    {queuedLots.length > 0 ? (
                      <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
                        <span>
                          Next{" "}
                          {queuedLots
                            .map(
                              (l) =>
                                `${l.lotNumber} ${money(l.purchasePrice)}/${unitLabel(stockSymbol)}`,
                            )
                            .join(" · ")}
                        </span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
                    <strong>FIFO prices</strong>
                    <span>No open lot. Receive stock to set the selling cost.</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {section === "branches" ? (
        <div className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]">
          <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
            <strong>{PRODUCT_COPY.branchesTitle}</strong>
            <span>{PRODUCT_COPY.branchesHint}</span>
          </p>
          <div className="rounded-lg border border-line bg-bg/40 p-3">
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="font-semibold text-sub">{PRODUCT_COPY.branchesTotal}</span>
              <strong className="tabular-nums text-ink">
                {formatStockQty(branchTotal)} {unitLabel(product.unit || base.symbol || "pc")}
              </strong>
            </div>
          </div>
          <div className="product-small-list [display:grid] [gap:10px]">
            {branches.length === 0 ? (
              <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
                {PRODUCT_COPY.branchesEmpty}
              </p>
            ) : (
              branches.map((branch) => (
                <div
                  key={branch.id}
                  className="product-small-card [display:grid] [gap:8px] [padding:10px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-[13px] text-ink">{branch.name}</strong>
                  </div>
                  <UnitQtyFields
                    label="Quantity"
                    units={sellUnits}
                    stockSymbol={product.unit || base.symbol || "pc"}
                    value={branchQuantities[branch.id] ?? 0}
                    onChange={(qty) =>
                      setBranchQuantities((current) => ({ ...current, [branch.id]: qty }))
                    }
                  />
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {section === "units" ? (
        <div className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]">
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
            <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
              <strong>{priceLot.lotNumber}</strong>
              <span>
                Supplier {supplierName(priceLot.supplierId) || "—"}. Cost is this lot’s buy price.
                Min / wholesale / retail are sell prices.
              </span>
            </p>
          ) : (
            <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
              <strong>Units & prices</strong>
              <span>
                Add a pack or another unit if you need it. Extra prices fill in from the product
                unit.
              </span>
            </p>
          )}
          <div className="product-small-list [display:grid] [gap:10px]">
            {sellUnits.map((row) => {
              const isBase = row.kind === "base";
              return (
                <div
                  key={row.id}
                  ref={(element) => {
                    unitCards.current[row.id] = element;
                  }}
                  className={
                    isBase
                      ? "product-small-card relative [display:grid] [gap:8px] [padding:10px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)] is-base"
                      : "product-small-card relative [display:grid] [gap:8px] [padding:10px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)]"
                  }
                >
                  <div className="product-small-top [display:grid] [grid-template-columns:minmax(0,_1.1fr)_minmax(90px,_1fr)_36px] [gap:8px] [align-items:end]">
                    <Field label={isBase ? "Product unit" : "Sell as"}>
                      <SearchableSelect
                        value={row.symbol ?? ""}
                        onChange={(v) => {
                          if (isBase) {
                            setBaseUnit(v);
                            return;
                          }
                          setExtraField(row.id, {
                            symbol: v,
                            name: unitLabel(v),
                            kind: extraKind(v),
                          });
                        }}
                        placeholder="Pack, Meter, Gaz…"
                        searchPlaceholder="Type to search"
                        options={unitRows
                          .filter(
                            (u) =>
                              !sellUnits.some(
                                (other) => other.id !== row.id && other.symbol === u.symbol,
                              ),
                          )
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
                          maxLength={FIELD_LIMITS.qty}
                          placeholder="90"
                          value={numStr(row.contains)}
                          onChange={(e) =>
                            setExtraField(row.id, { contains: numVal(e.target.value) })
                          }
                        />
                      </Field>
                    )}
                    {isBase ? (
                      <span />
                    ) : (
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
                  <div className="product-small-prices [display:grid] [grid-template-columns:1fr_1fr] [gap:8px_10px]">
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
            className="product-inline-add [align-self:flex-start]"
            icon={<Plus size={14} />}
            onClick={() => setUnits([...sellUnits, newExtraUnit()])}
          >
            Add unit
            <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
              Ctrl+N
            </kbd>
          </Button>
        </div>
      ) : null}

      {section === "recipe" ? (
        <div className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]">
          <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
            Select a component, choose its unit when needed, then enter the quantity.
          </p>
          <div className="product-unit-table relative grid gap-2 overflow-visible is-recipe">
            {product.components.length === 0 ? (
              <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
                No components yet.
              </p>
            ) : (
              product.components.map((line) => (
                <ProductQuantityPicker
                  key={line.id}
                  products={catalog.filter((row) => row.id !== product.id)}
                  value={line}
                  onChange={(next) =>
                    patch({
                      components: product.components.map((component) =>
                        component.id === line.id ? { ...component, ...next } : component,
                      ),
                    })
                  }
                  onRemove={() =>
                    patch({
                      components: product.components.filter(
                        (component) => component.id !== line.id,
                      ),
                    })
                  }
                  recipeTone
                />
              ))
            )}
          </div>
          <Button
            className="product-inline-add [align-self:flex-start]"
            icon={<Plus size={14} />}
            onClick={() =>
              patch({
                components: [
                  ...product.components,
                  { id: crypto.randomUUID(), productId: "", quantity: 1 },
                ],
              })
            }
          >
            Add component
            <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
              Ctrl+N
            </kbd>
          </Button>
        </div>
      ) : null}

      {section === "lots" ? (
        <div className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]">
          <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
            <strong>Open lots</strong>
            <span>
              Each lot has its own cost. Qty and damage can be Pack, Meter, Gaz — they convert to
              stock.
            </span>
          </p>
          <div className="product-small-list [display:grid] [gap:10px]">
            {lotDraft.filter((l) => l.remainingQuantity > 0 || l.damagedQuantity > 0).length ===
            0 ? (
              <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
                No open lots. Receive stock from Products → Lots.
              </p>
            ) : (
              lotDraft
                .filter((l) => l.remainingQuantity > 0 || l.damagedQuantity > 0)
                .map((lot) => {
                  const opened = lotOpened[lot.id] ?? lot.remainingQuantity;
                  const changed = Math.abs(lot.remainingQuantity - opened) > 1e-6;
                  return (
                    <div
                      key={lot.id}
                      className="product-small-card [display:grid] [gap:8px] [padding:10px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)]"
                    >
                      <div className="product-lot-head [display:flex] [align-items:baseline] [justify-content:space-between] [gap:8px]">
                        <strong>{lot.lotNumber}</strong>
                        <span>{supplierName(lot.supplierId) || "No supplier"}</span>
                      </div>
                      <Field label="Supplier">
                        <SearchableSelect
                          value={lot.supplierId}
                          onChange={(v) =>
                            setLotDraft((prev) =>
                              prev.map((row) =>
                                row.id === lot.id ? { ...row, supplierId: v } : row,
                              ),
                            )
                          }
                          placeholder="Choose supplier"
                          searchPlaceholder="Search suppliers"
                          options={suppliers
                            .filter((s) => s.isActive)
                            .map((s) => ({ value: s.id, label: s.name }))}
                          clearable={false}
                        />
                      </Field>
                      <UnitQtyFields
                        label="Qty left"
                        units={sellUnits}
                        stockSymbol={stockSymbol}
                        value={lot.remainingQuantity}
                        onChange={(n) =>
                          setLotDraft((prev) =>
                            prev.map((row) => (row.id === lot.id ? setLotQty(row, n) : row)),
                          )
                        }
                      />
                      {changed ? (
                        <p className="product-lot-adjusted [margin:0] [font-size:11px] [font-weight:600] [color:var(--teal,_#0f766e)]">
                          Adjusted {formatMixedQty(product, opened)} →{" "}
                          {formatMixedQty(product, lot.remainingQuantity)}
                        </p>
                      ) : null}
                      <UnitQtyFields
                        label="Damaged"
                        units={sellUnits}
                        stockSymbol={stockSymbol}
                        value={lot.damagedQuantity}
                        onChange={(n) =>
                          setLotDraft((prev) =>
                            prev.map((row) => (row.id === lot.id ? setLotDamage(row, n) : row)),
                          )
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
        <div className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]">
          <div className="product-flag [display:flex] [align-items:center] [padding:8px_12px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)]">
            <Toggle
              checked={Boolean(product.warrantyEnabled)}
              onChange={(v) =>
                patch({ warrantyEnabled: v, warrantyQty: v ? product.warrantyQty || 12 : 0 })
              }
              label="Warranty enabled"
            />
          </div>
          {product.warrantyEnabled ? (
            <div className="product-form-grid [display:grid] [grid-template-columns:1fr_1fr] [gap:10px_14px]">
              <Field label="Duration">
                <TextInput
                  inputMode="numeric"
                  maxLength={FIELD_LIMITS.shortNumber}
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
            <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
              Turn warranty on only when this product is covered.
            </p>
          )}
        </div>
      ) : null}

      <div className="product-form-foot [display:flex] [align-items:center] [justify-content:space-between] [flex-wrap:wrap] [gap:10px] [padding:10px_16px] [border-top:1px_solid_var(--line)] [background:var(--paper)] [flex-shrink:0] [position:relative] [z-index:1] [min-width:0]">
        {isNew ? (
          <label className="product-keep [display:flex] [align-items:flex-start] [gap:8px] [min-width:0] [cursor:pointer]">
            <Checkbox checked={keepAdding} onChange={(e) => setKeep(e.target.checked)} />
            <span>
              <strong>Keep adding after save</strong>
              <small>Save this product and immediately open a fresh form.</small>
            </span>
          </label>
        ) : (
          <span />
        )}
        <div className="product-form-actions [display:flex] [gap:8px] [flex-shrink:0]">
          <Button onClick={onClose} disabled={saving}>
            Cancel
            <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
              Esc
            </kbd>
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save product"}
            <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
              F12
            </kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}
