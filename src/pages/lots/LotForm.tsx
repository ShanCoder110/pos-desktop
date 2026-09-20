import { useEffect, useMemo, useRef, useState } from "react";
import { Package, Plus } from "lucide-react";
import {
  Button,
  Field,
  FormSection,
  MoneyInput,
  ProductSearch,
  SearchableSelect,
  Tabs,
  TextInput,
  toaster,
} from "@/components/common";
import { LotBranchFields, type LotBranchRow } from "@/pages/lots/LotBranchFields";
import { LotUnitLines } from "@/pages/products/LotFields";
import {
  baseUnit,
  biggerUnit,
  containsLabel,
  emptyPrices,
  extraKind,
  formatStockQty,
  lotCostInStockUnit,
  priceFromStock,
  pricePerStock,
  productSellUnits,
  roundStockQty,
  unitLabel,
} from "@/pages/products/productQty";
import { ensureSession } from "@/services/auth";
import { listAllBranches } from "@/services/org";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { LOT_COPY } from "@/shared/constants/products";
import type { ProductLotRow, SupplierRow } from "@/shared/domain/types";
import type { Product, ProductSellUnit } from "@/shared/types";
import { cn } from "@/utils/format";

type ErrorField = "product" | "supplier" | "quantity" | null;
type LotTab = "lot" | "branches";

function focusableElements(root: HTMLElement) {
  return [
    ...root.querySelectorAll<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    ),
  ].filter((element) => element.offsetParent !== null);
}

function latestLot(
  lots: ProductLotRow[],
  lot: ProductLotRow,
  match: (candidate: ProductLotRow) => boolean,
) {
  return (
    lots
      .filter((candidate) => candidate.id !== lot.id && match(candidate))
      .slice()
      .sort(
        (a, b) =>
          b.receivedAt.localeCompare(a.receivedAt) || b.lotNumber.localeCompare(a.lotNumber),
      )[0] ?? null
  );
}

function previousSupplierLot(lots: ProductLotRow[], lot: ProductLotRow) {
  if (!lot.productId || !lot.supplierId) return null;
  return latestLot(
    lots,
    lot,
    (candidate) => candidate.productId === lot.productId && candidate.supplierId === lot.supplierId,
  );
}

function lastProductLot(lots: ProductLotRow[], lot: ProductLotRow, productId: string) {
  return latestLot(lots, lot, (candidate) => candidate.productId === productId);
}

function productPrices(product: Product | undefined) {
  return {
    purchasePrice: product?.cost ?? 0,
    minimumPrice: product?.min ?? 0,
    wholesalePrice: product?.wholesale ?? 0,
    retailPrice: product?.retail ?? 0,
  };
}

function historicalPrices(previous: ProductLotRow | null, product: Product | undefined) {
  if (!previous) return productPrices(product);
  return {
    purchasePrice: previous.purchasePrice,
    minimumPrice: previous.minimumPrice,
    wholesalePrice: previous.wholesalePrice,
    retailPrice: previous.retailPrice,
  };
}

type UnitPriceKey = "cost" | "min" | "wholesale" | "price";

function lotPricesFromUnits(units: ProductSellUnit[], stockSymbol: string) {
  const stock = units.find((unit) => unit.symbol === stockSymbol) ?? baseUnit(units);
  if (!stock) return {};
  return {
    purchasePrice: stock.cost,
    minimumPrice: stock.min,
    wholesalePrice: stock.wholesale,
    retailPrice: stock.price,
  };
}

function seedPricedUnits(
  product: Product,
  overlay?: {
    purchasePrice: number;
    minimumPrice: number;
    wholesalePrice: number;
    retailPrice: number;
  },
) {
  const units = productSellUnits(product);
  if (!overlay) return units.map((unit) => ({ ...unit }));
  const cost = lotCostInStockUnit(product, overlay.purchasePrice || 0) || overlay.purchasePrice;
  const min = overlay.minimumPrice || 0;
  const wholesale = overlay.wholesalePrice || 0;
  const retail = overlay.retailPrice || 0;
  return units.map((unit) => ({
    ...unit,
    cost: cost ? priceFromStock(units, product.unit, cost, unit) : unit.cost,
    min: min ? priceFromStock(units, product.unit, min, unit) : unit.min,
    wholesale: wholesale ? priceFromStock(units, product.unit, wholesale, unit) : unit.wholesale,
    price: retail ? priceFromStock(units, product.unit, retail, unit) : unit.price,
  }));
}

const emptyDraftPrices = { cost: 0, min: 0, wholesale: 0, price: 0 };

export function LotForm({
  lot,
  lots,
  products,
  suppliers,
  unitCatalog = [],
  isNew,
  onOpenAddSupplier,
  onOpenAddProduct,
  onAddProductUnit,
  suspendShortcuts = false,
  onChange,
  onSave,
  onClose,
}: {
  lot: ProductLotRow;
  lots: ProductLotRow[];
  products: Product[];
  suppliers: SupplierRow[];
  unitCatalog?: { id: string; name: string; symbol: string }[];
  isNew: boolean;
  onOpenAddSupplier: () => void;
  onOpenAddProduct: () => void;
  onAddProductUnit?: (productId: string, unit: ProductSellUnit) => Promise<void>;
  suspendShortcuts?: boolean;
  onChange: (lot: ProductLotRow) => void;
  onSave: (lot: ProductLotRow, sellUnits?: ProductSellUnit[]) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const draftUnitRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<LotTab>("lot");
  const [error, setError] = useState<ErrorField>(null);
  const [sessionBranchId, setSessionBranchId] = useState(lot.branchId ?? "");
  const [branchRows, setBranchRows] = useState<LotBranchRow[]>([]);
  const [branchBaseline, setBranchBaseline] = useState<Record<string, number>>({});
  const [supplierFromLotId, setSupplierFromLotId] = useState<string | null>(null);
  const [addingUnit, setAddingUnit] = useState(false);
  const [draftUnit, setDraftUnit] = useState(false);
  const [newUnitSymbol, setNewUnitSymbol] = useState("");
  const [newUnitContains, setNewUnitContains] = useState("");
  const [newUnitPrices, setNewUnitPrices] = useState(emptyDraftPrices);
  const [pricedUnits, setPricedUnits] = useState<ProductSellUnit[]>([]);
  const product = products.find((item) => item.id === lot.productId);
  const catalogUnits = product ? productSellUnits(product) : [];
  const catalogSig = catalogUnits.map((unit) => unit.id).join("|");
  const units = pricedUnits.length ? pricedUnits : catalogUnits;
  const stockSymbol = product?.unit ?? "pc";
  const supplierSourceLot = useMemo(() => {
    if (!supplierFromLotId) return null;
    return lots.find((row) => row.id === supplierFromLotId) ?? null;
  }, [lots, supplierFromLotId]);
  const availableQty = Math.max(0, lot.originalQuantity - lot.damagedQuantity);
  const allocated = branchRows.reduce((sum, row) => sum + row.quantity, 0);
  const branchCap = isNew ? lot.originalQuantity : lot.remainingQuantity;
  const unallocated = roundStockQty(branchCap - allocated);

  function patch(next: Partial<ProductLotRow>) {
    onChange({ ...lot, ...next });
    setError(null);
  }

  function syncBranchRows(rows: LotBranchRow[]) {
    setBranchRows(rows);
    const active = rows.filter((row) => row.quantity > 0);
    const primary =
      rows.find((row) => row.quantity > 0 && row.branchId === sessionBranchId)?.branchId ||
      rows.find((row) => row.quantity > 0)?.branchId ||
      "";
    patch({
      branchId: primary,
      branchAllocations: active.map((row) => ({
        branchId: row.branchId,
        quantity: row.quantity,
      })),
    });
  }

  function applyReceivedQuantity(quantity: number) {
    const withQty = branchRows.filter((row) => row.quantity > 0);
    let nextRows = branchRows;
    if (withQty.length === 1) {
      nextRows = branchRows.map((row) =>
        row.branchId === withQty[0].branchId ? { ...row, quantity } : row,
      );
    }
    setBranchRows(nextRows);
    const active = nextRows.filter((row) => row.quantity > 0);
    const primary =
      nextRows.find((row) => row.quantity > 0 && row.branchId === sessionBranchId)?.branchId ||
      nextRows.find((row) => row.quantity > 0)?.branchId ||
      "";
    patch({
      originalQuantity: quantity,
      remainingQuantity: isNew
        ? Math.max(0, quantity - lot.damagedQuantity)
        : lot.remainingQuantity,
      branchId: primary,
      branchAllocations: active.map((row) => ({
        branchId: row.branchId,
        quantity: row.quantity,
      })),
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([listAllBranches(controller.signal), ensureSession()])
      .then(([branchList, session]) => {
        const active = branchList
          .filter((row) => row.isActive)
          .map((row) => ({ id: row.id, name: row.name }));
        const focusId = lot.branchId || session?.branchId || active[0]?.id || "";
        const existing = lot.branchAllocations ?? [];
        const total = isNew ? lot.originalQuantity : lot.remainingQuantity;
        const baseline: Record<string, number> = {};
        setSessionBranchId(focusId);
        setBranchRows(
          active.map((branch) => {
            const row = existing.find((entry) => entry.branchId === branch.id);
            const quantity = row?.quantity ?? (isNew && branch.id === focusId ? total : 0);
            baseline[branch.id] = quantity;
            return {
              branchId: branch.id,
              branchName: branch.name,
              selected: quantity > 0,
              quantity,
            };
          }),
        );
        setBranchBaseline(baseline);
        if (isNew && !lot.branchId && focusId) {
          patch({
            branchId: focusId,
            branchAllocations: [{ branchId: focusId, quantity: lot.originalQuantity }],
          });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [isNew, lot.id]);

  useEffect(() => {
    if (!lot.productId) {
      setSupplierFromLotId(null);
      return;
    }
    const lastLot = lastProductLot(lots, lot, lot.productId);
    if (lastLot?.supplierId && lot.supplierId === lastLot.supplierId) {
      setSupplierFromLotId(lastLot.id);
    }
  }, [lot.productId, lot.supplierId, lot.id, lots]);

  useEffect(() => {
    if (!product) {
      setPricedUnits([]);
      return;
    }
    const catalog = productSellUnits(product);
    setPricedUnits((current) => {
      if (!current.length) return catalog.map((unit) => ({ ...unit }));
      const kept = new Map(current.map((unit) => [unit.id, unit]));
      return catalog.map((unit) => {
        const prior = kept.get(unit.id);
        return prior
          ? {
              ...unit,
              cost: prior.cost,
              min: prior.min,
              wholesale: prior.wholesale,
              price: prior.price,
              priceManual: prior.priceManual,
            }
          : { ...unit };
      });
    });
  }, [product?.id, catalogSig]);

  useEffect(() => {
    if (!draftUnit) return;
    draftUnitRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [draftUnit]);

  function applyProduct(nextProduct: Product | null) {
    setDraftUnit(false);
    setNewUnitSymbol("");
    setNewUnitContains("");
    setNewUnitPrices(emptyDraftPrices);
    if (!nextProduct) {
      setSupplierFromLotId(null);
      setPricedUnits([]);
      patch({ productId: "" });
      return;
    }
    const lastLot = lastProductLot(lots, lot, nextProduct.id);
    const supplierId = lot.supplierId || lastLot?.supplierId || nextProduct.supplierId || "";
    setSupplierFromLotId(lastLot?.supplierId ? lastLot.id : null);
    const candidate = { ...lot, productId: nextProduct.id, supplierId };
    const history = previousSupplierLot(lots, candidate);
    const overlay = historicalPrices(history, nextProduct);
    const seeded = seedPricedUnits(nextProduct, overlay);
    setPricedUnits(seeded);
    patch({
      productId: nextProduct.id,
      supplierId,
      ...lotPricesFromUnits(seeded, nextProduct.unit),
    });
  }

  function applySupplier(supplierId: string) {
    setSupplierFromLotId(null);
    const candidate = { ...lot, supplierId };
    const history = previousSupplierLot(lots, candidate);
    const overlay = historicalPrices(history, product);
    const seeded = product
      ? seedPricedUnits(product, overlay).map((unit) => {
          const prior = pricedUnits.find((row) => row.id === unit.id);
          if (!prior || unit.kind === "base") return unit;
          return {
            ...unit,
            cost: prior.cost,
            min: prior.min,
            wholesale: prior.wholesale,
            price: prior.price,
            priceManual: prior.priceManual,
          };
        })
      : pricedUnits;
    setPricedUnits(seeded);
    patch({ supplierId, ...lotPricesFromUnits(seeded, stockSymbol) });
  }

  function setUnitPrice(unitId: string, key: UnitPriceKey, value: number) {
    const source = units.find((unit) => unit.id === unitId);
    if (!source) return;
    const stockPrice = pricePerStock(units, stockSymbol, value, source);
    const next = units.map((unit) => ({
      ...unit,
      [key]: priceFromStock(units, stockSymbol, stockPrice, unit),
      priceManual: unit.id === unitId ? { ...unit.priceManual, [key]: true } : unit.priceManual,
    }));
    setPricedUnits(next);
    patch(lotPricesFromUnits(next, stockSymbol));
  }

  async function addUnitToProduct() {
    if (!product || !onAddProductUnit || !newUnitSymbol) return;
    const contains = Number(newUnitContains);
    if (!Number.isFinite(contains) || contains <= 0) {
      toaster.error("Enter how many base units this contains");
      return;
    }
    if (units.some((unit) => unit.symbol === newUnitSymbol)) {
      toaster.error("This unit is already on the product");
      return;
    }
    setAddingUnit(true);
    try {
      await onAddProductUnit(product.id, {
        id: crypto.randomUUID(),
        name: unitLabel(newUnitSymbol),
        symbol: newUnitSymbol,
        kind: extraKind(newUnitSymbol),
        contains,
        ...newUnitPrices,
        barcode: "",
        priceManual: { cost: true, min: true, wholesale: true, price: true },
      });
      setNewUnitSymbol("");
      setNewUnitContains("");
      setNewUnitPrices(emptyDraftPrices);
      setDraftUnit(false);
    } finally {
      setAddingUnit(false);
    }
  }

  function save() {
    if (!lot.productId) {
      setError("product");
      setTab("lot");
      rootRef.current?.querySelector<HTMLElement>('[data-field="product"]')?.focus();
      return;
    }
    if (!lot.supplierId) {
      setError("supplier");
      setTab("lot");
      rootRef.current?.querySelector<HTMLElement>('[data-field="supplier"]')?.focus();
      return;
    }
    if (lot.originalQuantity <= 0) {
      setError("quantity");
      setTab("lot");
      rootRef.current?.querySelector<HTMLElement>(".lot-quantity input")?.focus();
      return;
    }
    let nextLot = lot;
    const branchTotal = isNew ? lot.originalQuantity : lot.remainingQuantity;
    if (branchTotal > 0 && branchRows.length) {
      const rows = branchRows;
      if (!rows.some((row) => row.quantity > 0)) {
        setTab("branches");
        toaster.error(LOT_COPY.branchNeedQty);
        return;
      }
      const nextAllocated = rows.reduce((sum, row) => sum + row.quantity, 0);
      const leftover = roundStockQty(branchTotal - nextAllocated);
      if (leftover > 1e-6) {
        setTab("branches");
        toaster.error(LOT_COPY.branchMustAllocate);
        return;
      }
      if (leftover < -1e-6) {
        setTab("branches");
        toaster.error(LOT_COPY.branchOverAllocated);
        return;
      }
      const active = rows.filter((row) => row.quantity > 0);
      nextLot = {
        ...lot,
        branchId:
          rows.find((row) => row.quantity > 0 && row.branchId === sessionBranchId)?.branchId ||
          rows.find((row) => row.quantity > 0)?.branchId ||
          lot.branchId,
        branchAllocations: active.map((row) => ({
          branchId: row.branchId,
          quantity: row.quantity,
        })),
      };
    }
    onSave(
      {
        ...nextLot,
        ...lotPricesFromUnits(units, stockSymbol),
        receivedAt: nextLot.receivedAt || new Date().toISOString().slice(0, 10),
        expiryDate: null,
        createdBy: nextLot.createdBy || "u1",
      },
      units,
    );
  }

  useEffect(() => {
    if (suspendShortcuts) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const openPicker = target.closest(
        ".product-search.is-open, .ui-combo-field.is-open, .ui-combo-menu",
      );
      if (event.key === "Escape") {
        if (openPicker) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "F12" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        event.stopPropagation();
        save();
        return;
      }
      if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || openPicker)
        return;
      if (target.tagName === "BUTTON") return;
      const root = rootRef.current;
      if (!root) return;
      const fields = focusableElements(root);
      const index = fields.indexOf(target);
      event.preventDefault();
      event.stopPropagation();
      const next = fields[index + (event.shiftKey ? -1 : 1)];
      if (next) {
        next.focus();
        if (next instanceof HTMLInputElement) next.select();
      } else {
        root.querySelector<HTMLButtonElement>(".lot-save")?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [suspendShortcuts]);

  const supplierOptions = suppliers
    .filter((supplier) => supplier.isActive)
    .map((supplier) => ({ value: supplier.id, label: supplier.name }));
  const unusedUnits = unitCatalog.filter(
    (unit) => !units.some((row) => row.symbol === unit.symbol),
  );

  return (
    <div
      ref={rootRef}
      className="lot-form flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <Tabs
          variant="line"
          ariaLabel="Lot sections"
          value={tab}
          onChange={(id) => setTab(id as LotTab)}
          items={[
            { id: "lot", label: "Lot" },
            {
              id: "branches",
              label: `Branches${
                (isNew ? lot.originalQuantity : lot.remainingQuantity)
                  ? ` · ${formatStockQty(allocated)}/${formatStockQty(isNew ? lot.originalQuantity : lot.remainingQuantity)}`
                  : ""
              }`,
            },
          ]}
        />
      </div>

      <div className="lot-form-pane drawer-form min-h-0 flex-1 px-4 py-3 pb-6">
        {tab === "lot" ? (
          <>
            <FormSection
              title="Receive"
              action={
                <>
                  <Button
                    type="button"
                    size="sm"
                    icon={<Plus size={13} />}
                    onClick={onOpenAddProduct}
                  >
                    Add product
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    icon={<Plus size={13} />}
                    onClick={onOpenAddSupplier}
                  >
                    Add supplier
                  </Button>
                </>
              }
            >
              <div className="lot-receive-grid">
                <Field label="Product" error={error === "product" ? "Select a product" : undefined}>
                  <ProductSearch
                    products={products}
                    value={lot.productId}
                    onChange={applyProduct}
                    autoFocus={!lot.productId}
                    invalid={error === "product"}
                  />
                </Field>
                <Field
                  label="Supplier"
                  error={error === "supplier" ? "Select a supplier" : undefined}
                  hint={supplierSourceLot ? `From lot ${supplierSourceLot.lotNumber}` : undefined}
                >
                  <SearchableSelect
                    name="supplier"
                    value={lot.supplierId}
                    onChange={applySupplier}
                    placeholder="Choose supplier"
                    searchPlaceholder="Search suppliers"
                    clearable={false}
                    invalid={error === "supplier"}
                    options={supplierOptions}
                  />
                </Field>
                {isNew ? (
                  <p className="m-0 self-end pb-1 text-[11px] text-muted sm:col-span-2">
                    Lot number is assigned when you save.
                    {availableQty
                      ? ` ${formatStockQty(availableQty)} ${stockSymbol} goes to branches.`
                      : ""}
                  </p>
                ) : (
                  <Field label="Lot number">
                    <TextInput value={lot.lotNumber} disabled />
                  </Field>
                )}
              </div>
            </FormSection>

            {product && units.length ? (
              <FormSection title="Units" icon={<Package size={14} />}>
                <p className="m-0 text-[11px] text-muted">
                  Each unit has its own cost, min, wholesale, and retail — same as the product
                  drawer. Quantity is shared across units.
                </p>
                <div className={cn(error === "quantity" && "lot-quantity")}>
                  <LotUnitLines
                    units={units}
                    stockSymbol={stockSymbol}
                    received={lot.originalQuantity}
                    left={lot.remainingQuantity}
                    damaged={lot.damagedQuantity}
                    showLeft={!isNew}
                    showQuantity
                    showPricing
                    onReceived={applyReceivedQuantity}
                    onLeft={(quantity) => patch({ remainingQuantity: quantity })}
                    onDamaged={(quantity) =>
                      patch({
                        damagedQuantity: quantity,
                        remainingQuantity: isNew
                          ? Math.max(0, lot.originalQuantity - quantity)
                          : lot.remainingQuantity,
                      })
                    }
                    onUnitPrice={setUnitPrice}
                  />
                </div>
                {draftUnit && onAddProductUnit ? (
                  <div
                    ref={draftUnitRef}
                    className="product-small-card relative grid gap-2 rounded-[10px] border border-dashed border-line bg-paper p-2.5"
                  >
                    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(90px,1fr)] items-end gap-2">
                      <Field label="Sell as">
                        <SearchableSelect
                          value={newUnitSymbol}
                          onChange={setNewUnitSymbol}
                          placeholder="Pack, box…"
                          searchPlaceholder="Search units"
                          clearable
                          options={unusedUnits.map((unit) => ({
                            value: unit.symbol,
                            label: unit.name,
                          }))}
                        />
                      </Field>
                      <Field
                        label={containsLabel(baseUnit(units), biggerUnit(units), {
                          id: "draft",
                          name: unitLabel(newUnitSymbol),
                          symbol: newUnitSymbol,
                          kind: extraKind(newUnitSymbol),
                          contains: Number(newUnitContains) || 0,
                          ...emptyPrices(),
                          barcode: "",
                          priceManual: {},
                        })}
                      >
                        <TextInput
                          inputMode="decimal"
                          maxLength={FIELD_LIMITS.qty}
                          placeholder="12"
                          value={newUnitContains}
                          onChange={(event) => setNewUnitContains(event.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="product-small-prices grid grid-cols-2 gap-2">
                      {(
                        [
                          ["cost", "Cost"],
                          ["min", "Min"],
                          ["wholesale", "Wholesale"],
                          ["price", "Retail"],
                        ] as const
                      ).map(([key, label]) => (
                        <Field
                          key={key}
                          label={label}
                          className={cn(
                            "product-price-field",
                            key === "price" ? "is-retail" : `is-${key}`,
                          )}
                        >
                          <MoneyInput
                            placeholder="0.00"
                            value={newUnitPrices[key] ? String(newUnitPrices[key]) : ""}
                            onChange={(event) =>
                              setNewUnitPrices((current) => ({
                                ...current,
                                [key]: Number(event.target.value) || 0,
                              }))
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setDraftUnit(false);
                          setNewUnitSymbol("");
                          setNewUnitContains("");
                          setNewUnitPrices(emptyDraftPrices);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        disabled={addingUnit || !newUnitSymbol}
                        onClick={() => void addUnitToProduct()}
                      >
                        Add to product
                      </Button>
                    </div>
                  </div>
                ) : onAddProductUnit && unusedUnits.length ? (
                  <div className="product-inline-add flex items-center gap-2 self-start">
                    <Button
                      type="button"
                      className="product-inline-add-btn"
                      icon={<Plus size={14} />}
                      onClick={() => setDraftUnit(true)}
                    >
                      Add unit
                    </Button>
                  </div>
                ) : null}
              </FormSection>
            ) : (
              <p className="m-0 text-[11px] text-muted">
                Select a product to enter quantity and prices.
              </p>
            )}
          </>
        ) : (
          <>
            {branchRows.length && (isNew ? lot.originalQuantity > 0 : lot.remainingQuantity > 0) ? (
              <LotBranchFields
                rows={branchRows}
                sessionBranchId={sessionBranchId}
                receivedQuantity={isNew ? lot.originalQuantity : lot.remainingQuantity}
                unitLabel={unitLabel(stockSymbol)}
                product={product}
                mode={isNew ? "receive" : "rebalance"}
                baselineQuantities={isNew ? undefined : branchBaseline}
                onChange={syncBranchRows}
              />
            ) : (
              <p className="m-0 text-[11px] text-muted">
                {isNew
                  ? "Enter a quantity on the Lot tab first."
                  : "No remaining stock to split between branches."}
              </p>
            )}
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-paper px-4 py-2.5">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          className="lot-save"
          variant="primary"
          disabled={branchRows.length > 0 && Math.abs(unallocated) > 1e-6}
          onClick={save}
        >
          {isNew ? "Add lot" : "Save lot"}
          <kbd className="ui-kbd">F12</kbd>
        </Button>
      </footer>
    </div>
  );
}
