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
  UnitQuantityEntry,
  toaster,
} from "@/components/common";
import { STORAGE_KEYS, MAX_PAGE_SIZE } from "@/shared/constants/config";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { uniqueUnitSymbol } from "@/shared/constants/units";
import {
  PRODUCT_COPY,
  PRODUCT_FORM_SECTIONS,
  type ProductFormSection,
} from "@/shared/constants/products";
import { SUPPLIER_COPY } from "@/shared/constants/suppliers";
import type { Product, ProductBranchStock, ProductSellUnit } from "@/shared/types";
import { cn, money, shortError, warrantyDaysOf } from "@/utils/format";
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
import { ProductBranchAllocation } from "@/pages/products/BranchStockFields";
import { mergeBranchStock } from "@/pages/products/branchStockUtils";
import { resolveStockBranchId } from "@/utils/stockBranch";
import { ProductUnitMargin } from "@/pages/products/ProductUnitMargin";
import {
  firstMissingUnitPrice,
  hasMissingUnitPrices,
  unitPriceMissingError,
} from "@/pages/products/productUnitValidation";
import { LinkedUnitBoxes, UnitQtyFields } from "@/pages/products/LotFields";
import { ensureSession } from "@/services/auth";
import { updateLot } from "@/services/lots";
import { getProduct } from "@/services/products";
import { listAllBranches } from "@/services/org";
import {
  biggerUnit,
  canonicalUnit,
  conversionFactor,
  editUnitRate,
  formatMixedQty,
  formatStockQty,
  isLinearStockUnit,
  normalizeSellUnits,
  preferredUnit,
  priceFromStock,
  productSellUnits,
  qtyUnits,
  conversionReferenceUnits,
  sellUnitOptionValue,
  sellUnitOptions,
  setPreferredUnit,
  setUnitConversionFromReference,
  suggestedExtraUnit,
  unitInStock,
  unitHierarchySummary,
  unitConversionForCard,
  unitLabel,
  unitRateReference,
  validateOpeningStock,
  validateSellUnits,
} from "@/pages/products/productQty";
import { createMasterRecord, listMasterRecords } from "@/services/masters";

type PriceKey = "cost" | "min" | "wholesale" | "price";

const referenceRateFormat = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 4 });

function numVal(raw: string) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function numStr(n: number) {
  if (!Number.isFinite(n) || n === 0) return "";
  return String(n);
}

const SKU_PATTERN = /^[A-Za-z0-9._/-]+$/;

function validateSkuValue(raw: string): string | null {
  const sku = raw.trim();
  if (!sku) return null; // blank → auto on create; keep existing on edit
  if (sku.length > FIELD_LIMITS.sku || !SKU_PATTERN.test(sku)) {
    return "SKU must be 1–32 characters: letters, digits, - _ . /";
  }
  return null;
}

function validationToastMessage(field: string): string {
  const messages: Record<string, string> = {
    name: "Name is required",
    sku: "Enter a valid unique SKU",
    unit: PRODUCT_COPY.unitRequired,
    openingQty: PRODUCT_COPY.openingQtyRequired,
    cost: PRODUCT_COPY.unitPriceRequired,
    min: PRODUCT_COPY.unitPriceRequired,
    wholesale: PRODUCT_COPY.unitPriceRequired,
    retail: PRODUCT_COPY.unitPriceRequired,
    unitPrices: PRODUCT_COPY.unitPricesIncomplete,
    unitNameRequired: PRODUCT_COPY.unitNameRequired,
    unitNameDuplicate: PRODUCT_COPY.unitNameDuplicate,
    unitFactorInvalid: PRODUCT_COPY.unitFactorInvalid,
    unitBaseRequired: PRODUCT_COPY.unitBaseRequired,
  };
  return messages[field] ?? PRODUCT_COPY.unitPricesIncomplete;
}

function defaultSellUnits(product: Product): ProductSellUnit[] {
  if (product.sellUnits?.length) {
    return normalizeSellUnits(product.sellUnits);
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
    isBase: true,
    isDefault: !packN,
  };
  if (!packN) return [base];
  return normalizeSellUnits([
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
      isBase: false,
      isDefault: true,
    },
  ]);
}

function focusables(root: HTMLElement) {
  return [
    ...root.querySelectorAll<HTMLElement>(
      "input:not([disabled]):not([type=hidden]):not([type=checkbox]), select:not([disabled]), textarea:not([disabled]), button.toggle, .product-inline-add-btn",
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
  /** `true` saved; `false` failed (toast already shown); string = inline SKU error. */
  onCommit: (next: Product) => boolean | string | Promise<boolean | string>;
  onClose: () => void;
  saving?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<ProductFormSection>("details");
  const [error, setError] = useState<string | null>(null);
  const [skuFieldError, setSkuFieldError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [flash, setFlash] = useState(false);
  const [containsDrafts, setContainsDrafts] = useState<Record<string, string>>({});
  const [conversionReferences, setConversionReferences] = useState<Record<string, string>>({});
  const [keepAdding, setKeepAdding] = useState(
    () => sessionStorage.getItem(STORAGE_KEYS.keepAddingProducts) === "1",
  );
  const focusPane = useRef(false);
  const unitCards = useRef<Record<string, HTMLDivElement | null>>({});
  const unitPositions = useRef(new Map<string, DOMRect>());
  const changedUnitId = useRef<string | null>(null);
  const unitsPaneRef = useRef<HTMLDivElement>(null);
  const pendingFocusUnitId = useRef<string | null>(null);
  const isNew = !catalog.some((r) => r.id === product.id);
  const {
    lots,
    setLots,
    setProducts,
    categories: hubCategories,
    setCategories: setHubCategories,
    units: hubUnits,
    setUnits: setHubUnits,
    suppliers: hubSuppliers,
    setSuppliers: setHubSuppliers,
  } = useProductsHub();
  const [localCategories, setLocalCategories] = useState<{ id: string; name: string }[]>([]);
  const [localUnits, setLocalUnits] = useState<{ id: string; name: string; symbol: string }[]>([]);
  const [localSuppliers, setLocalSuppliers] = useState<
    { id: string; name: string; isActive: boolean }[]
  >([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [sessionBranchId, setSessionBranchId] = useState("");
  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of [...hubCategories, ...localCategories]) names.add(row.name);
    if (product.category) names.add(product.category);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [hubCategories, localCategories, product.category]);
  const unitRows = useMemo(() => {
    const rows = new Map<string, { id: string; name: string; symbol: string }>();
    for (const row of [...hubUnits, ...localUnits]) rows.set(row.id, row);
    return [...rows.values()];
  }, [hubUnits, localUnits]);
  const suppliers = useMemo(() => {
    const rows = new Map<string, { id: string; name: string; isActive: boolean }>();
    for (const row of [...hubSuppliers, ...localSuppliers]) rows.set(row.id, row);
    return [...rows.values()];
  }, [hubSuppliers, localSuppliers]);
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "";
  const supplierOptions = useMemo(
    () =>
      suppliers
        .filter((s) => s.isActive)
        .map((s) => ({ value: s.id, label: s.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [suppliers],
  );

  useEffect(() => {
    if (!isNew) return;
    const controller = new AbortController();
    void Promise.all([listAllBranches(controller.signal), ensureSession()])
      .then(([branchRows, session]) => {
        const active = branchRows
          .filter((row) => row.isActive)
          .map((row) => ({ id: row.id, name: row.name, isMain: row.isMain }));
        const focusId = resolveStockBranchId(active, session?.branchId);
        setBranches(active);
        setSessionBranchId(focusId);
        if (!product.branchStock?.length) {
          onChange({
            ...product,
            branchStock: active.map((branch) => ({
              branchId: branch.id,
              branchName: branch.name,
              quantity: branch.id === focusId ? product.stock : 0,
            })),
          });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed branch stock when new product id is set
  }, [isNew, product.id]);

  useEffect(() => {
    if (hubCategories.length && hubUnits.length && hubSuppliers.length) return;
    const controller = new AbortController();
    void Promise.all([
      !hubCategories.length
        ? listMasterRecords(
            "categories",
            { perPage: MAX_PAGE_SIZE, isActive: true },
            controller.signal,
          )
            .then((r) => {
              const rows = r.data.map(({ id, name }) => ({ id, name }));
              setLocalCategories(rows);
              setHubCategories(rows);
            })
            .catch(() => undefined)
        : Promise.resolve(),
      !hubUnits.length
        ? listMasterRecords("units", { perPage: MAX_PAGE_SIZE, isActive: true }, controller.signal)
            .then((r) => {
              const rows = r.data.map(({ id, name, symbol }) => ({
                id,
                name,
                symbol: symbol ?? "",
              }));
              setLocalUnits(rows);
              setHubUnits(rows);
            })
            .catch(() => undefined)
        : Promise.resolve(),
      !hubSuppliers.length
        ? listMasterRecords("suppliers", { perPage: MAX_PAGE_SIZE }, controller.signal)
            .then((r) => {
              const rows = r.data.map(({ id, name, isActive }) => ({ id, name, isActive }));
              setLocalSuppliers(rows);
              setHubSuppliers(rows);
            })
            .catch(() => undefined)
        : Promise.resolve(),
    ]);
    return () => controller.abort();
  }, [
    hubCategories.length,
    hubUnits.length,
    hubSuppliers.length,
    setHubCategories,
    setHubUnits,
    setHubSuppliers,
  ]);

  const [lotDraft, setLotDraft] = useState(() => lots.filter((l) => l.productId === product.id));
  const [lotOpened, setLotOpened] = useState<
    Record<string, { remaining: number; damaged: number; purchasePrice: number }>
  >({});
  const sellUnits = qtyUnits(defaultSellUnits(product));
  const unitSummary = unitHierarchySummary(sellUnits);
  const unitLayoutKey = sellUnits
    .map(
      (unit) =>
        `${unit.id}:${unit.symbol}:${unit.kind}:${unit.contains}:${unit.factorDirection}:${unit.isBase ? 1 : 0}`,
    )
    .join("|");
  const base = preferredUnit(sellUnits) ?? sellUnits[0];
  const inventory = canonicalUnit(sellUnits) ?? base;
  const stockSymbol = inventory?.symbol || product.unit || "pc";
  const activeSuppliers = useMemo(() => {
    const ids = [
      ...new Set(
        lotDraft.filter((l) => l.remainingQuantity > 0 && l.supplierId).map((l) => l.supplierId),
      ),
    ];
    return ids.map((id) => ({
      id,
      name: suppliers.find((s) => s.id === id)?.name || "Supplier",
      lots: lotDraft
        .filter((l) => l.supplierId === id && l.remainingQuantity > 0)
        .map((l) => l.lotNumber),
    }));
  }, [lotDraft, suppliers]);
  const sellingLot = fifoLot(lotDraft);
  const queuedLots = fifoLots(lotDraft).slice(1);
  const branchStock = useMemo(
    () => mergeBranchStock(branches, product.branchStock),
    [branches, product.branchStock],
  );
  const branchAllocated = useMemo(
    () => branchStock.reduce((sum, row) => sum + row.quantity, 0),
    [branchStock],
  );
  const currentBranchName =
    branches.find((branch) => branch.id === sessionBranchId)?.name ?? "current branch";
  const sections = useMemo(
    () =>
      PRODUCT_FORM_SECTIONS.filter((id) => {
        if (id === "branches") return isNew;
        if (id === "recipe") return product.isManufactured;
        if (id === "lots") return !isNew;
        return true;
      }),
    [product.isManufactured, isNew],
  );

  useEffect(() => {
    setSection("details");
    setError(null);
    setShowValidation(false);
    setContainsDrafts({});
    setConversionReferences({});
    const mine = lots.filter((l) => l.productId === product.id);
    if (mine.length) {
      setLotDraft(mine);
      setLotOpened(
        Object.fromEntries(
          mine.map((l) => [
            l.id,
            {
              remaining: l.remainingQuantity,
              damaged: l.damagedQuantity,
              purchasePrice: l.purchasePrice,
            },
          ]),
        ),
      );
    } else if (!isNew && product.stock > 0) {
      const created = openingLot(product, lots);
      setLotDraft([created]);
      setLotOpened({
        [created.id]: {
          remaining: created.remainingQuantity,
          damaged: created.damagedQuantity,
          purchasePrice: created.purchasePrice,
        },
      });
    } else {
      setLotDraft([]);
      setLotOpened({});
    }
    if (!product.sellUnits?.length) {
      const sellUnits = defaultSellUnits(product);
      const inventory = canonicalUnit(sellUnits);
      onChange({
        ...product,
        sellUnits,
        unit: inventory?.symbol ?? product.unit,
      });
    }
    requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      focusField(root, "name");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset form state when product.id changes
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unitLayoutKey tracks sellUnits layout
  }, [section, unitLayoutKey]);

  useLayoutEffect(() => {
    const id = pendingFocusUnitId.current;
    if (!id || section !== "units") return;
    const card = unitCards.current[id];
    if (!card) return;
    pendingFocusUnitId.current = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
    requestAnimationFrame(() => {
      const combo = card.querySelector<HTMLInputElement>(".product-small-top .ui-combo-input");
      const factor = card.querySelector<HTMLInputElement>(
        '.product-small-top input[inputmode="decimal"]',
      );
      const ownedFactor = unitsPaneRef.current?.querySelector<HTMLInputElement>(
        `[data-conversion-unit-id="${CSS.escape(id)}"]`,
      );
      // New rows are blank — pick unit first; then type conversion.
      const target = combo?.value
        ? (factor ?? ownedFactor ?? combo)
        : (combo ?? factor ?? ownedFactor);
      target?.focus();
      target?.select();
    });
  }, [section, unitLayoutKey]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(false), 1400);
    return () => window.clearTimeout(t);
  }, [flash]);

  const productRef = useRef(product);
  productRef.current = product;

  function patch(next: Partial<Product>) {
    onChange({ ...productRef.current, sellUnits, ...next });
  }

  function syncBranchStock(rows: ProductBranchStock[]) {
    patch({ branchStock: rows });
  }

  function setOpeningQty(raw: string) {
    const quantity = raw.trim() === "" ? 0 : Number(raw);
    if (!Number.isFinite(quantity) || quantity < 0) return;
    patch({
      stock: quantity,
      branchStock: branchStock.map((row) => ({
        ...row,
        quantity: row.branchId === sessionBranchId ? quantity : 0,
      })),
    });
  }

  function setLowStock(raw: string) {
    const quantity = raw.trim() === "" ? 0 : Number(raw);
    if (!Number.isFinite(quantity) || quantity < 0) return;
    patch({ minimumStock: quantity });
  }

  function normalizedBranchStock() {
    let rows = branchStock;
    if (!isNew || product.stock <= 0) return rows;
    const allocated = rows.reduce((sum, row) => sum + row.quantity, 0);
    if (allocated >= product.stock - 1e-6 || !sessionBranchId) return rows;
    const leftover = product.stock - allocated;
    return rows.map((row) =>
      row.branchId === sessionBranchId ? { ...row, quantity: row.quantity + leftover } : row,
    );
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
      setHubCategories((current) =>
        current.some((row) => row.id === created.id)
          ? current
          : [...current, { id: created.id, name: created.name }],
      );
      patch({ category: created.name, categoryId: created.id });
      toaster.success("Category added");
    } catch (error) {
      toaster.error(shortError(error, "Could not add category"));
    } finally {
      setCreatingCategory(false);
    }
  }

  async function addSupplier(name: string, selectForLotId?: string) {
    const trimmed = name.trim();
    if (!trimmed || creatingSupplier) return;
    const existing = suppliers.find(
      (row) => row.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      if (selectForLotId) {
        setLotDraft((prev) =>
          prev.map((row) =>
            row.id === selectForLotId ? { ...row, supplierId: existing.id } : row,
          ),
        );
      } else {
        patch({ supplierId: existing.id });
      }
      return;
    }
    setCreatingSupplier(true);
    try {
      const created = await createMasterRecord("suppliers", {
        name: trimmed,
        isActive: true,
      });
      setLocalSuppliers((current) =>
        current.some((row) => row.id === created.id)
          ? current
          : [...current, { id: created.id, name: created.name, isActive: created.isActive }],
      );
      setHubSuppliers((current) =>
        current.some((row) => row.id === created.id)
          ? current
          : [...current, { id: created.id, name: created.name, isActive: created.isActive }],
      );
      if (selectForLotId) {
        setLotDraft((prev) =>
          prev.map((row) => (row.id === selectForLotId ? { ...row, supplierId: created.id } : row)),
        );
      } else {
        patch({ supplierId: created.id });
      }
      toaster.success(SUPPLIER_COPY.added);
    } catch (error) {
      toaster.error(shortError(error, SUPPLIER_COPY.saveFailed));
    } finally {
      setCreatingSupplier(false);
    }
  }

  async function addUnit(name: string, targetUnitId?: string) {
    const trimmed = name.trim();
    if (!trimmed || creatingUnit) return;
    setCreatingUnit(true);
    try {
      const symbol = uniqueUnitSymbol(
        trimmed,
        unitRows.map((row) => row.symbol),
      );
      const created = await createMasterRecord("units", {
        name: trimmed,
        symbol,
        precision: 3,
        isActive: true,
      });
      const nextUnit = { id: created.id, name: created.name, symbol: created.symbol ?? symbol };
      setLocalUnits((current) =>
        current.some((row) => row.id === nextUnit.id) ? current : [...current, nextUnit],
      );
      setHubUnits((current) =>
        current.some((row) => row.id === nextUnit.id) ? current : [...current, nextUnit],
      );

      const currentUnits = qtyUnits(defaultSellUnits(productRef.current));
      const target = targetUnitId
        ? currentUnits.find((unit) => unit.id === targetUnitId)
        : canonicalUnit(currentUnits);
      if (!target || target.isBase) {
        setInventoryUnit(nextUnit.symbol, nextUnit.name);
      } else {
        const updated = currentUnits.map((unit) =>
          unit.id === target.id
            ? {
                ...unit,
                symbol: nextUnit.symbol,
                name: nextUnit.name,
                kind: unit.kind,
                factorDirection: unit.factorDirection,
              }
            : unit,
        );
        patch({ sellUnits: updated });
      }
      toaster.success("Unit added");
    } catch (error) {
      toaster.error(shortError(error, "Could not add unit"));
    } finally {
      setCreatingUnit(false);
    }
  }

  function setKeep(value: boolean) {
    setKeepAdding(value);
    sessionStorage.setItem(STORAGE_KEYS.keepAddingProducts, value ? "1" : "0");
  }

  function setUnits(next: ProductSellUnit[]) {
    patch({ sellUnits: next });
  }

  function addExtraUnit() {
    const unit = suggestedExtraUnit(sellUnits);
    pendingFocusUnitId.current = unit.id;
    changedUnitId.current = unit.id;
    setUnits([...sellUnits, unit]);
  }

  function setDefaultSaleUnit(unitId: string) {
    if (!sellUnits.some((unit) => unit.id === unitId)) return;
    setUnits(setPreferredUnit(sellUnits, unitId));
  }

  function setInventoryUnit(v: string, displayName = unitLabel(v)) {
    if (!isNew) return;
    const current = productRef.current;
    const existing = sellUnits.find(
      (unit) => (unit.symbol || "").trim().toLowerCase() === v.trim().toLowerCase(),
    );
    const currentInventory = canonicalUnit(sellUnits);
    let next: ProductSellUnit[];
    if (existing) {
      if (existing.id === currentInventory?.id) return;
      toaster.warn("This unit is already added.");
      return;
    } else {
      next = sellUnits.map((unit) =>
        unit.id === currentInventory?.id
          ? {
              ...unit,
              symbol: v,
              name: displayName,
              contains: 1,
              factorDirection: "multiply" as const,
              isBase: true,
              kind: "base" as const,
            }
          : unit,
      );
    }
    const nextPreferred = preferredUnit(next);
    const inventory = canonicalUnit(next) ?? nextPreferred;
    if (!nextPreferred || !inventory) return;
    onChange({
      ...current,
      name: current.name,
      sellUnits: next,
      unit: inventory.symbol || current.unit,
      isLinear: isLinearStockUnit(inventory.symbol || current.unit),
      cost: inventory.cost,
      min: inventory.min,
      wholesale: inventory.wholesale,
      retail: inventory.price,
    });
  }

  function setBaseField(key: PriceKey, value: number) {
    const preferred = preferredUnit(sellUnits);
    if (!preferred) return;
    const priced = editUnitRate(sellUnits, preferred.id, key, value);
    const inventory = canonicalUnit(priced) ?? preferred;
    onChange({
      ...product,
      sellUnits: priced,
      cost: inventory.cost,
      min: inventory.min,
      wholesale: inventory.wholesale,
      retail: inventory.price,
    });
  }

  function editContains(row: ProductSellUnit, raw: string) {
    setContainsDrafts((current) => ({ ...current, [row.id]: raw }));
  }

  function finishContains(row: ProductSellUnit) {
    const raw = containsDrafts[row.id];
    if (raw === undefined) return;
    const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value) || value <= 0) {
      setError("unitFactorInvalid");
      return;
    }
    const referenceId = unitConversionForCard(sellUnits, row.id, conversionReferences[row.id])?.to
      .id;
    if (!referenceId) return;
    changedUnitId.current = row.id;
    setUnits(setUnitConversionFromReference(sellUnits, row.id, referenceId, value));
    setContainsDrafts((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
    if (error === "unitFactorInvalid") setError(null);
  }

  function setUnitPrice(row: ProductSellUnit, key: PriceKey, value: number) {
    const isPreferred = preferredUnit(sellUnits)?.id === row.id;
    if (isPreferred) setBaseField(key, value);
    else setUnits(editUnitRate(sellUnits, row.id, key, value));
  }

  function unitPrice(row: ProductSellUnit, key: PriceKey) {
    return row[key];
  }

  function validate(): string | null {
    if (!product.name.trim()) return "name";
    const skuMsg = validateSkuValue(product.sku ?? "");
    if (skuMsg) {
      setSkuFieldError(skuMsg);
      return "sku";
    }
    const needle = product.sku.trim().toLowerCase();
    if (
      needle &&
      catalog.some((row) => row.id !== product.id && row.sku.trim().toLowerCase() === needle)
    ) {
      setSkuFieldError("That SKU is already in use.");
      return "sku";
    }
    if (!(base?.symbol || product.unit)) return "unit";
    // Opening stock may be zero (receive later via lots). Reject negatives only.
    if (isNew) {
      const openingError = validateOpeningStock(product.stock);
      if (openingError) return openingError;
    }
    if (isNew && base) {
      if (base.cost <= 0) return "cost";
      if (base.min <= 0) return "min";
      if (base.wholesale <= 0) return "wholesale";
      if (base.price <= 0) return "retail";
    }
    return null;
  }

  function focusMissingUnitPrice() {
    const missing = firstMissingUnitPrice(sellUnits);
    if (!missing) return;
    pendingFocusUnitId.current = missing.unitId;
    setSection("units");
    requestAnimationFrame(() => {
      const card = unitCards.current[missing.unitId];
      card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  async function save() {
    if (saving) return;
    setShowValidation(true);
    const field = validate();
    if (field) {
      setError(field);
      const jump: Record<string, ProductFormSection> = {
        name: "details",
        sku: "details",
        unit: "details",
        openingQty: "details",
        cost: "details",
        min: "details",
        wholesale: "details",
        retail: "details",
      };
      setSection(jump[field] ?? "details");
      toaster.error(validationToastMessage(field));
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
    const inventoryId = canonicalUnit(sellUnits)?.id;
    const invalidDraft = sellUnits.find((unit) => {
      const raw = containsDrafts[unit.id];
      if (raw === undefined) return false;
      const value = Number(raw);
      return !raw.trim() || !Number.isFinite(value) || value <= 0;
    });
    if (invalidDraft) {
      setError("unitFactorInvalid");
      setSection("units");
      pendingFocusUnitId.current = invalidDraft.id;
      toaster.error(PRODUCT_COPY.unitFactorInvalid);
      return;
    }
    let resolvedUnits = sellUnits;
    for (const [unitId, raw] of Object.entries(containsDrafts)) {
      const referenceId = unitConversionForCard(resolvedUnits, unitId, conversionReferences[unitId])
        ?.to.id;
      if (!referenceId) continue;
      resolvedUnits = setUnitConversionFromReference(
        resolvedUnits,
        unitId,
        referenceId,
        Number(raw),
      );
    }
    // Ignore untouched empty rows, but require conversions for named units.
    const unitsToSave = resolvedUnits.filter(
      (unit) =>
        unit.id === inventoryId || unit.contains > 0 || unit.name.trim() || unit.symbol?.trim(),
    );
    const unitsError = validateSellUnits(unitsToSave);
    if (unitsError) {
      setError(unitsError);
      setSection("units");
      toaster.error(validationToastMessage(unitsError));
      return;
    }
    if (hasMissingUnitPrices(unitsToSave)) {
      setError("unitPrices");
      focusMissingUnitPrice();
      toaster.error(validationToastMessage("unitPrices"));
      return;
    }
    const preferred = preferredUnit(unitsToSave) ?? base;
    const inventoryUnit = canonicalUnit(unitsToSave) ?? preferred;
    const inventorySymbol = inventoryUnit?.symbol || preferred.symbol || product.unit;
    const packRow = biggerUnit(unitsToSave);
    const metersInPack =
      packRow && conversionFactor(packRow) > 1 ? conversionFactor(packRow) : null;
    const totals = isNew ? { stock: product.stock, damaged: product.damaged } : lotTotals(lotDraft);
    const openingBranches = isNew ? normalizedBranchStock() : branchStock;
    const next: Product = {
      ...product,
      branchStock: openingBranches,
      name: product.name.trim(),
      sku: product.sku.trim(),
      barcode: product.barcode?.trim() ?? "",
      unit: inventorySymbol,
      isLinear: isLinearStockUnit(inventorySymbol),
      cost: inventoryUnit?.cost ?? preferred.cost,
      min: inventoryUnit?.min ?? preferred.min,
      wholesale: inventoryUnit?.wholesale ?? preferred.wholesale,
      retail: inventoryUnit?.price ?? preferred.price,
      packQty: metersInPack,
      packPrice: packRow?.price ?? 0,
      stock: isNew ? product.stock : totals.stock,
      damaged: totals.damaged,
      sellUnits: unitsToSave,
      warrantyEnabled: Boolean(product.warrantyEnabled && product.warrantyQty > 0),
      warrantyDays: product.warrantyEnabled
        ? warrantyDaysOf(product.warrantyQty, product.warrantyUnit)
        : 0,
      components: product.isManufactured
        ? product.components.filter((c) => c.productId && c.quantity > 0)
        : [],
    };
    const result = await Promise.resolve(onCommit(next));
    if (result === false) return;
    if (typeof result === "string") {
      setError("sku");
      setSkuFieldError(result);
      setSection("details");
      toaster.error(result);
      requestAnimationFrame(() => {
        if (rootRef.current) focusField(rootRef.current, "sku");
      });
      return;
    }
    if (!isNew) {
      try {
        const adjusted = lotDraft.filter((lot) => {
          const opened = lotOpened[lot.id];
          if (!opened) return false;
          return (
            Math.abs(lot.remainingQuantity - opened.remaining) > 1e-6 ||
            Math.abs(lot.damagedQuantity - opened.damaged) > 1e-6 ||
            Math.abs(lot.purchasePrice - opened.purchasePrice) > 0.001
          );
        });
        for (const lot of adjusted) {
          await updateLot(lot.id, {
            supplierId: lot.supplierId || undefined,
            remainingQuantity: lot.remainingQuantity,
            damagedQuantity: lot.damagedQuantity,
            cost: lot.purchasePrice,
            min: lot.minimumPrice,
            wholesale: lot.wholesalePrice,
            retail: lot.retailPrice,
            expiryDate: lot.expiryDate ? lot.expiryDate.slice(0, 10) : null,
          });
        }
        if (adjusted.length) {
          // Lot edits affect stock and price projections. Refresh only this
          // product instead of reloading the entire catalog after every save.
          const updatedProduct = await getProduct(product.id);
          setProducts((current) =>
            current.map((row) => (row.id === updatedProduct.id ? updatedProduct : row)),
          );
        }
      } catch (error) {
        toaster.error(shortError(error, PRODUCT_COPY.saveFailed));
        return;
      }
      setLots((prev) => [...prev.filter((l) => l.productId !== product.id), ...lotDraft]);
    }
    if (keepAdding && isNew) {
      toaster.success(next.productNo ? `Product added · ID ${next.productNo}` : "Product added");
      setFlash(true);
      setError(null);
      setShowValidation(false);
      setSection("details");
      onChange(blankProduct());
      return;
    }
    toaster.success(
      isNew && next.productNo
        ? `Product added · ID ${next.productNo}`
        : isNew
          ? "Product added"
          : "Product saved",
    );
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
          addExtraUnit();
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
  const lowStockField = (
    <Field label={PRODUCT_COPY.lowStockAlert} hint={PRODUCT_COPY.lowStockHint}>
      <TextInput
        inputMode="decimal"
        maxLength={FIELD_LIMITS.qty}
        placeholder="Optional"
        value={numStr(product.minimumStock ?? 0)}
        onChange={(event) => setLowStock(event.target.value)}
      />
    </Field>
  );

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
          idPrefix={`product-${product.id}`}
          panelId={`product-${product.id}-panel-${section}`}
          value={section}
          onChange={(id) => {
            setSection(id as ProductFormSection);
          }}
          items={sections.map((id) => ({
            id,
            tone: id === "recipe" ? ("recipe" as const) : undefined,
            label:
              id === "details"
                ? "Details"
                : id === "branches"
                  ? `Branches${
                      product.stock
                        ? ` · ${formatStockQty(branchAllocated)}/${formatStockQty(product.stock)}`
                        : ""
                    }`
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
        <div
          role="tabpanel"
          id={`product-${product.id}-panel-${section}`}
          aria-labelledby={`product-${product.id}-tab-${section}`}
          className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]"
        >
          <div className="product-form-grid [display:grid] [grid-template-columns:1fr_1fr] [gap:10px_14px]">
            <h3 className="product-form-section-title is-full">Product details</h3>
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
            <Field label="Urdu name" hint="Optional. Used when invoice language is Urdu.">
              <TextInput
                data-field="urduName"
                dir="rtl"
                lang="ur"
                maxLength={FIELD_LIMITS.productName}
                placeholder="مثلاً 1.5 ایم ایم تانبے کی تار"
                value={product.urduName ?? ""}
                onChange={(e) => patch({ urduName: e.target.value })}
              />
            </Field>
            {!isNew ? (
              <Field label="Product ID" hint="Shop search number. Not editable.">
                <TextInput
                  data-field="productNo"
                  readOnly
                  disabled
                  value={
                    product.productNo && product.productNo > 0 ? String(product.productNo) : "—"
                  }
                />
              </Field>
            ) : null}
            <Field
              label="SKU"
              hint={
                isNew ? "Optional. Leave blank to auto-assign P-####." : "Owner/manager can edit."
              }
              error={
                error === "sku"
                  ? skuFieldError || "Enter a valid unique SKU (letters, digits, - _ . /)."
                  : undefined
              }
            >
              <TextInput
                data-field="sku"
                maxLength={FIELD_LIMITS.sku}
                placeholder={isNew ? "e.g. PMX-002" : product.sku || "SKU"}
                value={product.sku}
                onChange={(e) => {
                  setSkuFieldError(null);
                  patch({ sku: e.target.value });
                }}
              />
            </Field>
            <Field label="Category" hint="Uses Other when left empty.">
              <SearchableSelect
                name="category"
                value={product.category}
                onChange={(v) => {
                  const selected = [...hubCategories, ...localCategories].find(
                    (row) => row.name === v,
                  );
                  patch({ category: v, categoryId: selected?.id });
                }}
                placeholder="Other (automatic)"
                searchPlaceholder="Type to search or add"
                options={categoryOptions.map((c) => ({ value: c, label: c }))}
                clearable={false}
                disabled={creatingCategory}
                onCreate={(label) => void addCategory(label)}
                createLabel="Add category"
              />
            </Field>
            {isNew ? (
              <Field label="Supplier">
                <SearchableSelect
                  value={product.supplierId ?? ""}
                  onChange={(v) => patch({ supplierId: v })}
                  placeholder="Optional"
                  searchPlaceholder={SUPPLIER_COPY.searchOrAdd}
                  options={supplierOptions}
                  disabled={creatingSupplier}
                  onCreate={(label) => void addSupplier(label)}
                  createLabel={SUPPLIER_COPY.addInSelect}
                />
              </Field>
            ) : null}
            <h3 className="product-form-section-title is-full">Inventory</h3>
            {isNew ? (
              <Field
                label="Opening stock"
                className="is-full"
                hint={`Choose the stock unit while entering quantity. Goes to ${currentBranchName}; split it on Branches.`}
                error={
                  error === "unit"
                    ? PRODUCT_COPY.unitRequired
                    : error === "openingQty"
                      ? PRODUCT_COPY.openingQtyRequired
                      : undefined
                }
              >
                <UnitQuantityEntry
                  quantity={product.stock > 0 ? String(product.stock) : ""}
                  unit={inventory?.symbol ?? product.unit}
                  units={unitRows.map((unit) => ({ value: unit.symbol, label: unit.name }))}
                  onQuantityChange={setOpeningQty}
                  onUnitChange={setInventoryUnit}
                  onCreateUnit={(label) => void addUnit(label)}
                />
              </Field>
            ) : (
              <Field label="Inventory unit" hint="Fixed after stock activity starts.">
                <TextInput
                  disabled
                  value={inventory?.name || unitLabel(inventory?.symbol || product.unit)}
                />
              </Field>
            )}
            {lowStockField}
            <Field label="Product type" className="product-type-field">
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
                      ? "border-violet-500 bg-[color-mix(in_srgb,#8b5cf6_12%,var(--paper))] text-[color-mix(in_srgb,#8b5cf6_48%,var(--ink))] ring-violet-500/10"
                      : "border-accent bg-accent-bg text-[var(--accent-text)] ring-[var(--accent-ring)]";
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
            {!isNew ? (
              <div className="product-supplier-list [display:grid] [gap:6px] is-full">
                <span className="field-label [font-size:12px] [font-weight:600] [color:var(--sub)]">
                  Suppliers
                </span>
                {lotDraft.filter((lot) => lot.remainingQuantity > 0).length === 0 ? (
                  <p className="product-note [display:grid] [gap:2px] [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
                    No active lots. Suppliers show here when a lot still has quantity.
                  </p>
                ) : activeSuppliers.length === 0 ? (
                  <p className="product-note [margin:0] [font-size:12px] [color:var(--muted)]">
                    {lotDraft
                      .filter((lot) => lot.remainingQuantity > 0)
                      .map((lot) => lot.lotNumber)
                      .join(", ")}
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
            ) : null}
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
              <div className="product-opening-prices is-full grid grid-cols-2 gap-x-3.5 gap-y-2.5 rounded-xl border border-line bg-[color-mix(in_srgb,var(--bg)_45%,var(--paper))] p-3">
                <div className="col-span-2 flex items-center justify-between">
                  <strong className="text-[12px] text-ink">Prices</strong>
                  <span className="rounded-full bg-paper px-2 py-1 text-[10px] font-semibold text-muted">
                    Per {inventory?.name || unitLabel(inventory?.symbol || product.unit)}
                  </span>
                </div>
                <Field
                  label="Purchase cost"
                  className="product-price-field is-cost"
                  error={error === "cost" ? PRODUCT_COPY.unitPriceRequired : undefined}
                >
                  <MoneyInput
                    data-field="cost"
                    placeholder="0.00"
                    value={numStr(base?.cost ?? product.cost)}
                    onChange={(e) => setBaseField("cost", numVal(e.target.value))}
                  />
                </Field>
                <Field
                  label="Min price"
                  className="product-price-field is-min"
                  error={error === "min" ? PRODUCT_COPY.unitPriceRequired : undefined}
                >
                  <MoneyInput
                    data-field="min"
                    placeholder="0.00"
                    value={numStr(base?.min ?? product.min)}
                    onChange={(e) => setBaseField("min", numVal(e.target.value))}
                  />
                </Field>
                <Field
                  label="Wholesale price"
                  className="product-price-field is-wholesale"
                  error={error === "wholesale" ? PRODUCT_COPY.unitPriceRequired : undefined}
                >
                  <MoneyInput
                    data-field="wholesale"
                    placeholder="0.00"
                    value={numStr(base?.wholesale ?? product.wholesale)}
                    onChange={(e) => setBaseField("wholesale", numVal(e.target.value))}
                  />
                </Field>
                <Field
                  label="Retail price"
                  className="product-price-field is-retail"
                  error={error === "retail" ? PRODUCT_COPY.unitPriceRequired : undefined}
                >
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

      {section === "branches" && isNew ? (
        <div
          role="tabpanel"
          id={`product-${product.id}-panel-${section}`}
          aria-labelledby={`product-${product.id}-tab-${section}`}
          className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]"
        >
          {product.stock > 0 ? (
            <ProductBranchAllocation
              branches={branches}
              rows={branchStock}
              sessionBranchId={sessionBranchId}
              totalQuantity={product.stock}
              unitLabel={unitLabel(stockSymbol)}
              product={product}
              onChange={syncBranchStock}
            />
          ) : (
            <p className="m-0 text-[11px] text-muted">
              Enter opening quantity on Details first, then split across branches here.
            </p>
          )}
        </div>
      ) : null}

      {section === "units" ? (
        <div
          ref={unitsPaneRef}
          role="tabpanel"
          id={`product-${product.id}-panel-${section}`}
          aria-labelledby={`product-${product.id}-tab-${section}`}
          className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]"
        >
          <p className="product-note [margin:0] [font-size:12px] [line-height:1.4] [color:var(--muted)]">
            Stock unit: <strong>{inventory?.name || unitLabel(stockSymbol)}</strong>
            {unitSummary ? <span> · {unitSummary}</span> : null}
          </p>
          <div className="product-small-list [display:grid] [gap:10px]">
            {sellUnits.map((row) => {
              const isPreferred = preferredUnit(sellUnits)?.id === row.id;
              const isCanonical = canonicalUnit(sellUnits)?.id === row.id;
              const references = conversionReferenceUnits(sellUnits, row.id);
              const conversion = unitConversionForCard(
                sellUnits,
                row.id,
                conversionReferences[row.id],
              );
              const rowName = row.name || unitLabel(row.symbol || "") || "unit";
              return (
                <div
                  key={row.id}
                  ref={(element) => {
                    unitCards.current[row.id] = element;
                  }}
                  className={
                    isPreferred
                      ? "product-small-card relative [display:grid] [gap:8px] [padding:10px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)] is-base"
                      : "product-small-card relative [display:grid] [gap:8px] [padding:10px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)]"
                  }
                >
                  <div className="product-small-top">
                    <Field
                      label={isCanonical ? "Stock unit" : "Unit"}
                      className="product-unit-name-field"
                    >
                      <SearchableSelect
                        name={isPreferred ? "product-unit" : "sell-as"}
                        value={sellUnitOptionValue(row, unitRows)}
                        onChange={(v) => {
                          if (isCanonical) {
                            setInventoryUnit(v);
                            return;
                          }
                          const patched = sellUnits.map((unit) =>
                            unit.id === row.id
                              ? {
                                  ...unit,
                                  symbol: v,
                                  name: unitLabel(v),
                                  kind: unit.kind,
                                  factorDirection: unit.factorDirection,
                                }
                              : unit,
                          );
                          onChange({
                            ...productRef.current,
                            name: productRef.current.name,
                            sellUnits: patched,
                          });
                        }}
                        placeholder="Pack, Meter, Gaz…"
                        searchPlaceholder="Type to search"
                        options={sellUnitOptions(row, sellUnits, unitRows)}
                        clearable={false}
                        disabled={creatingUnit || (!isNew && isCanonical)}
                        onCreate={(label) => void addUnit(label, row.id)}
                        createLabel="Add unit"
                      />
                    </Field>
                    {conversion ? (
                      <div className="product-unit-conversion">
                        <Field
                          label="Contains"
                          error={
                            containsDrafts[row.id] !== undefined &&
                            (!containsDrafts[row.id].trim() ||
                              !Number.isFinite(Number(containsDrafts[row.id])) ||
                              Number(containsDrafts[row.id]) <= 0) &&
                            error === "unitFactorInvalid"
                              ? PRODUCT_COPY.unitFactorInvalid
                              : undefined
                          }
                        >
                          <div className="product-unit-equation">
                            <span className="product-unit-equation-from">1 {rowName} =</span>
                            <TextInput
                              data-conversion-unit-id={row.id}
                              aria-label={`Quantity for 1 ${rowName} in ${conversion.to.name || unitLabel(conversion.to.symbol || "")}`}
                              inputMode="decimal"
                              maxLength={FIELD_LIMITS.qty}
                              placeholder="Qty"
                              readOnly={conversion.from.id === conversion.to.id}
                              value={
                                containsDrafts[row.id] ??
                                (conversion.quantity > 0
                                  ? String(Number(conversion.quantity.toFixed(6)))
                                  : "")
                              }
                              onChange={(event) => editContains(row, event.target.value)}
                              onBlur={() => finishContains(row)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") event.currentTarget.blur();
                              }}
                            />
                            <SearchableSelect
                              className="product-conversion-reference"
                              name={`conversion-reference-${row.id}`}
                              value={conversion.to.id}
                              onChange={(referenceId) => {
                                setConversionReferences((current) => ({
                                  ...current,
                                  [row.id]: referenceId,
                                }));
                                setContainsDrafts((current) => {
                                  const next = { ...current };
                                  delete next[row.id];
                                  return next;
                                });
                              }}
                              options={references.map((unit) => ({
                                value: unit.id,
                                label: unit.name || unitLabel(unit.symbol || ""),
                              }))}
                              clearable={false}
                              searchable={false}
                            />
                          </div>
                        </Field>
                      </div>
                    ) : (
                      <div className="product-unit-conversion">
                        <div className="product-unit-inventory-pill">
                          Choose a unit to set its conversion
                        </div>
                      </div>
                    )}
                    <div className="product-unit-actions">
                      <Button
                        type="button"
                        size="sm"
                        variant={isPreferred ? "soft" : "outline"}
                        className={cn(
                          "product-stock-unit-btn",
                          isPreferred ? "is-on" : "is-action",
                        )}
                        disabled={isPreferred}
                        aria-pressed={isPreferred}
                        icon={<Check size={13} strokeWidth={2.5} />}
                        onClick={() => setDefaultSaleUnit(row.id)}
                      >
                        {isPreferred ? "POS default" : "Set POS default"}
                      </Button>
                      {!isCanonical ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="product-small-remove"
                          aria-label="Remove unit"
                          onClick={() => {
                            const remaining = sellUnits.filter((u) => u.id !== row.id);
                            if (!remaining.length) {
                              setUnits(remaining);
                              return;
                            }
                            const fallbackId =
                              preferredUnit(remaining)?.id ??
                              canonicalUnit(remaining)?.id ??
                              remaining[0]?.id ??
                              "";
                            setUnits(
                              isPreferred && fallbackId
                                ? setPreferredUnit(remaining, fallbackId)
                                : remaining,
                            );
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="product-small-prices [display:grid] [grid-template-columns:1fr_1fr] [gap:8px_10px]">
                    {(
                      [
                        ["cost", "Cost"],
                        ["min", "Min"],
                        ["wholesale", "Wholesale"],
                        ["price", "Retail"],
                      ] as const
                    ).map(([key, label]) => {
                      const value = unitPrice(row, key);
                      const reference = unitRateReference(sellUnits, row.id, key);
                      const priceError =
                        showValidation || error === "unitPrices"
                          ? unitPriceMissingError(value)
                          : undefined;
                      return (
                        <Field
                          key={key}
                          label={label}
                          className={cn(
                            "product-price-field",
                            key === "price" ? "is-retail" : `is-${key}`,
                            reference?.belowReference &&
                              "has-unit-price-warning [&_.field-hint]:text-danger [&_.field-hint]:font-semibold",
                          )}
                          error={priceError}
                          hint={
                            reference
                              ? `Calculated: Rs. ${referenceRateFormat.format(reference.value)} from ${reference.source.name || unitLabel(reference.source.symbol || "")}${reference.belowReference ? " · Below calculated rate" : ""}`
                              : undefined
                          }
                        >
                          <MoneyInput
                            aria-label={`${rowName} ${label}`}
                            placeholder={key === "cost" ? "0.00" : "Enter price"}
                            value={numStr(value)}
                            onChange={(e) => setUnitPrice(row, key, numVal(e.target.value))}
                          />
                        </Field>
                      );
                    })}
                  </div>
                  <ProductUnitMargin
                    cost={unitPrice(row, "cost")}
                    retail={unitPrice(row, "price")}
                  />
                </div>
              );
            })}
          </div>
          <div className="product-inline-add flex items-center gap-2 self-start">
            <Button
              className="product-inline-add-btn"
              icon={<Plus size={14} />}
              onClick={addExtraUnit}
            >
              {PRODUCT_COPY.addUnitAction}
            </Button>
            <kbd className="ui-kbd">Ctrl+N</kbd>
          </div>
        </div>
      ) : null}

      {section === "recipe" ? (
        <div
          role="tabpanel"
          id={`product-${product.id}-panel-${section}`}
          aria-labelledby={`product-${product.id}-tab-${section}`}
          className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]"
        >
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
        <div
          role="tabpanel"
          id={`product-${product.id}-panel-${section}`}
          aria-labelledby={`product-${product.id}-tab-${section}`}
          className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]"
        >
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
                  const opened = lotOpened[lot.id] ?? {
                    remaining: lot.remainingQuantity,
                    damaged: lot.damagedQuantity,
                    purchasePrice: lot.purchasePrice,
                  };
                  const changed =
                    Math.abs(lot.remainingQuantity - opened.remaining) > 1e-6 ||
                    Math.abs(lot.damagedQuantity - opened.damaged) > 1e-6;
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
                          searchPlaceholder={SUPPLIER_COPY.searchOrAdd}
                          options={supplierOptions}
                          clearable={false}
                          disabled={creatingSupplier}
                          onCreate={(label) => void addSupplier(label, lot.id)}
                          createLabel={SUPPLIER_COPY.addInSelect}
                        />
                      </Field>
                      <Field label={`Buy cost per ${unitLabel(stockSymbol)}`}>
                        <MoneyInput
                          value={numStr(lot.purchasePrice)}
                          onChange={(event) =>
                            setLotDraft((prev) =>
                              prev.map((row) =>
                                row.id === lot.id
                                  ? { ...row, purchasePrice: numVal(event.target.value) }
                                  : row,
                              ),
                            )
                          }
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
                          Adjusted {formatMixedQty(product, opened.remaining)} →{" "}
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
        <div
          role="tabpanel"
          id={`product-${product.id}-panel-${section}`}
          aria-labelledby={`product-${product.id}-tab-${section}`}
          className="product-form-pane [flex:1] [min-height:0] [min-width:0] [overflow:auto] [display:flex] [flex-direction:column] [gap:10px] [padding:12px_16px_10px]"
        >
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
          <label
            title="Save this product and immediately open a fresh form."
            className="product-keep [display:flex] [align-items:flex-start] [gap:8px] [min-width:0] [cursor:pointer]"
          >
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
