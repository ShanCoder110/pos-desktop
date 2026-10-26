import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Package, Plus } from "lucide-react";
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
import { editLotUnitPrice, seedLotUnits, type LotUnitPriceKey } from "@/pages/lots/lotUnitPricing";
import { LotUnitLines } from "@/pages/products/LotFields";
import {
  baseUnit,
  biggerUnit,
  containsLabel,
  emptyPrices,
  extraKind,
  formatStockQty,
  productSellUnits,
  roundStockQty,
  unitLabel,
} from "@/pages/products/productQty";
import { ensureSession } from "@/services/auth";
import { listAllBranches } from "@/services/org";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { LOT_COPY } from "@/shared/constants/products";
import type { ProductLotRow, SupplierRow } from "@/shared/domain/types";
import { SUPPLIER_COPY } from "@/shared/constants/suppliers";
import type { Product, ProductSellUnit } from "@/shared/types";
import { cn } from "@/utils/format";
import { resolveStockBranchId } from "@/utils/stockBranch";

type ErrorField = "product" | "supplier" | "quantity" | null;
type LotTab = "lot" | "warning" | "branches";

function focusableElements(root: HTMLElement) {
  return [
    ...root.querySelectorAll<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    ),
  ].filter((element) => element.offsetParent !== null);
}

function latestLot(
  lots: ProductLotRow[],
  excludeLotId: string,
  match: (candidate: ProductLotRow) => boolean,
) {
  return (
    lots
      .filter((candidate) => candidate.id !== excludeLotId && match(candidate))
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
    lot.id,
    (candidate) => candidate.productId === lot.productId && candidate.supplierId === lot.supplierId,
  );
}

function lastProductLot(lots: ProductLotRow[], excludeLotId: string, productId: string) {
  return latestLot(lots, excludeLotId, (candidate) => candidate.productId === productId);
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

function lotPricesFromUnits(units: ProductSellUnit[], stockSymbol: string) {
  const stock = units.find((unit) => unit.symbol === stockSymbol) ?? baseUnit(units);
  if (!stock) return {};
  const purchasePrice = stock.cost;
  return {
    purchasePrice,
    minimumPrice: stock.min,
    wholesalePrice: stock.wholesale,
    retailPrice: stock.price,
  };
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
  onCreateSupplier,
  onOpenAddProduct,
  onAddProductUnit,
  suspendShortcuts = false,
  creatingSupplier = false,
  saving = false,
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
  onCreateSupplier?: (name: string) => void;
  onOpenAddProduct: () => void;
  onAddProductUnit?: (productId: string, unit: ProductSellUnit) => Promise<void>;
  suspendShortcuts?: boolean;
  creatingSupplier?: boolean;
  saving?: boolean;
  onChange: (lot: ProductLotRow) => void;
  onSave: (lot: ProductLotRow, sellUnits?: ProductSellUnit[]) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const draftUnitRef = useRef<HTMLDivElement>(null);
  /** Latest lot — branch load is async and must not reset qty entered while it was in flight. */
  const lotRef = useRef(lot);
  lotRef.current = lot;
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
  const pricedLotId = useRef(lot.id);
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

  function assignQuantityToPrimaryBranch(quantity: number) {
    const nextQty = Math.max(0, quantity);
    const withQty = branchRows.filter((row) => row.quantity > 0);
    const targetId =
      withQty.length === 1 ? withQty[0].branchId : sessionBranchId || branchRows[0]?.branchId || "";
    const nextRows = targetId
      ? branchRows.map((row) =>
          row.branchId === targetId ? { ...row, quantity: nextQty } : { ...row, quantity: 0 },
        )
      : branchRows;
    setBranchRows(nextRows);
    const active = nextRows.filter((row) => row.quantity > 0);
    return {
      nextRows,
      active,
      primary: active[0]?.branchId || targetId || "",
      nextQty,
    };
  }

  function applyReceivedQuantity(quantity: number) {
    const { active, primary, nextQty } = assignQuantityToPrimaryBranch(quantity);
    patch({
      originalQuantity: nextQty,
      remainingQuantity: isNew ? Math.max(0, nextQty - lot.damagedQuantity) : lot.remainingQuantity,
      branchId: primary,
      branchAllocations: active.map((row) => ({
        branchId: row.branchId,
        quantity: row.quantity,
      })),
    });
  }

  /** Keep stock on the current (or single active) branch so Save works without the Branches tab. */
  function applyRemainingQuantity(quantity: number) {
    const { active, primary, nextQty } = assignQuantityToPrimaryBranch(quantity);
    patch({
      remainingQuantity: nextQty,
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
        if (controller.signal.aborted) return;
        const active = branchList
          .filter((row) => row.isActive)
          .map((row) => ({ id: row.id, name: row.name, isMain: row.isMain }));
        const current = lotRef.current;
        const currentId =
          session?.branchId && active.some((branch) => branch.id === session.branchId)
            ? session.branchId
            : "";
        const focusId = resolveStockBranchId(active, session?.branchId, current.branchId);
        const existing = current.branchAllocations ?? [];
        const existingTotal = existing.reduce((sum, row) => sum + row.quantity, 0);
        const total = isNew ? current.originalQuantity : current.remainingQuantity;
        const baseline: Record<string, number> = {};
        // Always track the POS/session branch for "Current" + default allocate.
        setSessionBranchId(currentId || focusId);
        setBranchRows(
          active.map((branch) => {
            const row = existing.find((entry) => entry.branchId === branch.id);
            const quantity =
              row?.quantity ?? (isNew && branch.id === focusId && existingTotal <= 0 ? total : 0);
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
        if (isNew && focusId) {
          const quantity = existingTotal > 0 ? existingTotal : total;
          onChange({
            ...lotRef.current,
            branchId: focusId,
            branchAllocations: [{ branchId: focusId, quantity }],
          });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
    // Reset branch UI when editing a different lot, not on every lot field edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on lot.id only
  }, [isNew, lot.id]);

  useEffect(() => {
    if (!lot.productId) {
      setSupplierFromLotId(null);
      return;
    }
    const lastLot = lastProductLot(lots, lot.id, lot.productId);
    if (lastLot?.supplierId && lot.supplierId === lastLot.supplierId) {
      setSupplierFromLotId(lastLot.id);
    }
  }, [lot.productId, lot.supplierId, lot.id, lots]);

  useEffect(() => {
    if (!product) {
      setPricedUnits([]);
      return;
    }
    const catalog = seedLotUnits(product, lotRef.current);
    const changedLot = pricedLotId.current !== lot.id;
    pricedLotId.current = lot.id;
    setPricedUnits((current) => {
      if (changedLot || !current.length) return catalog;
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
          : unit;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogSig tracks sell-unit catalog; lot.id resets another lot
  }, [product?.id, catalogSig, lot.id]);

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
    const lastLot = lastProductLot(lots, lot.id, nextProduct.id);
    const supplierId = lot.supplierId || lastLot?.supplierId || nextProduct.supplierId || "";
    setSupplierFromLotId(lastLot?.supplierId ? lastLot.id : null);
    const candidate = { ...lot, productId: nextProduct.id, supplierId };
    const history = previousSupplierLot(lots, candidate);
    const overlay = historicalPrices(history, nextProduct);
    const seeded = seedLotUnits(nextProduct, overlay);
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
    const seeded = product ? seedLotUnits(product, overlay) : pricedUnits;
    setPricedUnits(seeded);
    patch({ supplierId, ...lotPricesFromUnits(seeded, stockSymbol) });
  }

  function setUnitPrice(unitId: string, key: LotUnitPriceKey, value: number) {
    const next = editLotUnitPrice(units, stockSymbol, unitId, key, value);
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

  const saveRef = useRef<() => void>(() => undefined);
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
      let rows = branchRows;
      // Qty typed before branches finished loading can leave rows at 0 — put it on current branch.
      if (!rows.some((row) => row.quantity > 0)) {
        const targetId =
          (sessionBranchId && rows.some((row) => row.branchId === sessionBranchId)
            ? sessionBranchId
            : null) ||
          rows[0]?.branchId ||
          "";
        if (!targetId) {
          setTab("branches");
          toaster.error(LOT_COPY.branchNeedQty);
          return;
        }
        rows = rows.map((row) => ({
          ...row,
          selected: row.branchId === targetId,
          quantity: row.branchId === targetId ? branchTotal : 0,
        }));
        setBranchRows(rows);
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
    } else if (branchTotal > 0 && !branchRows.length && sessionBranchId) {
      nextLot = {
        ...lot,
        branchId: sessionBranchId,
        branchAllocations: [{ branchId: sessionBranchId, quantity: branchTotal }],
      };
    }
    const expiryRaw = (nextLot.expiryDate ?? "").trim();
    const receivedDay = (nextLot.receivedAt || new Date().toISOString()).slice(0, 10);
    if (expiryRaw) {
      const expiryDay = expiryRaw.slice(0, 10);
      if (expiryDay < receivedDay) {
        toaster.error(LOT_COPY.expiryBeforeReceived);
        setTab("lot");
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (expiryDay < today) {
        toaster.info(LOT_COPY.expiryPastWarning);
      }
    }
    onSave(
      {
        ...nextLot,
        ...lotPricesFromUnits(units, stockSymbol),
        receivedAt: nextLot.receivedAt || new Date().toISOString().slice(0, 10),
        expiryDate: expiryRaw ? expiryRaw.slice(0, 10) : null,
        createdBy: nextLot.createdBy || "u1",
      },
      units,
    );
  }
  saveRef.current = save;

  useEffect(() => {
    if (suspendShortcuts || saving) return;
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
        saveRef.current();
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
  }, [suspendShortcuts, saving, onClose]);

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
      aria-busy={saving}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4"
        inert={saving}
      >
        <Tabs
          variant="line"
          ariaLabel="Lot sections"
          value={tab}
          onChange={(id) => setTab(id as LotTab)}
          items={[
            { id: "lot", label: "Lot" },
            {
              id: "warning",
              label: lot.expiryDate ? "Warning · expiry" : "Warning",
            },
            {
              id: "branches",
              label: isNew
                ? "Branches (optional)"
                : `Branches${
                    lot.remainingQuantity
                      ? ` · ${formatStockQty(allocated)}/${formatStockQty(lot.remainingQuantity)}`
                      : ""
                  }`,
            },
          ]}
        />
      </div>

      <div className="lot-form-pane drawer-form min-h-0 flex-1 px-4 py-3 pb-6" inert={saving}>
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
              {isNew ? (
                <p className="m-0 -mt-1 mb-2 text-[11px] text-muted">
                  Stock is saved to{" "}
                  <strong className="text-ink">
                    {branchRows.find((row) => row.branchId === sessionBranchId)?.branchName ||
                      "your current branch"}
                  </strong>
                  . Open Branches only if you need to split.
                </p>
              ) : null}
              <div className="lot-receive-grid">
                <Field
                  label="Product"
                  required
                  error={error === "product" ? "Select a product" : undefined}
                >
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
                  required
                  error={error === "supplier" ? "Select a supplier" : undefined}
                  hint={supplierSourceLot ? `From lot ${supplierSourceLot.lotNumber}` : undefined}
                >
                  <SearchableSelect
                    name="supplier"
                    value={lot.supplierId}
                    onChange={applySupplier}
                    placeholder="Choose supplier"
                    searchPlaceholder={SUPPLIER_COPY.searchOrAdd}
                    clearable={false}
                    invalid={error === "supplier"}
                    options={supplierOptions}
                    disabled={creatingSupplier}
                    onCreate={onCreateSupplier}
                    createLabel={SUPPLIER_COPY.addInSelect}
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
                    lockReceived={!isNew}
                    showQuantity
                    showPricing
                    onReceived={isNew ? applyReceivedQuantity : undefined}
                    onLeft={isNew ? undefined : applyRemainingQuantity}
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
        ) : tab === "warning" ? (
          <FormSection title="Expiry" icon={<AlertTriangle size={14} />}>
            <p className="m-0 text-[11px] text-muted">
              Optional. Set when this lot expires so stock can be watched before it goes bad.
            </p>
            <div className="lot-receive-grid max-w-md">
              <Field label={LOT_COPY.expiryLabel} hint={LOT_COPY.expiryHint}>
                <TextInput
                  type="date"
                  value={(lot.expiryDate ?? "").slice(0, 10)}
                  onChange={(event) =>
                    patch({ expiryDate: event.target.value ? event.target.value : null })
                  }
                />
              </Field>
            </div>
          </FormSection>
        ) : (
          <>
            {isNew ? (
              <p className="m-0 text-[12px] text-muted">
                New lots go to{" "}
                <strong className="text-ink">
                  {branchRows.find((row) => row.branchId === sessionBranchId)?.branchName ||
                    "your current branch"}
                </strong>{" "}
                automatically. Split below only if you need another branch.
              </p>
            ) : null}
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
                  ? "Enter a quantity on the Lot tab — stock is assigned to your current branch."
                  : "No remaining stock to split between branches."}
              </p>
            )}
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-paper px-4 py-2.5">
        {isNew && lot.supplierId ? (
          <div className="mr-auto grid grid-cols-3 gap-2 text-[12px]">
            <Field label="Total">
              <MoneyInput
                value={String(Math.round(lot.originalQuantity * lot.purchasePrice * 100) / 100)}
                disabled
              />
            </Field>
            <Field label="Paid now">
              <MoneyInput
                value={lot.paidNow ? String(lot.paidNow) : ""}
                disabled={saving}
                onChange={(event) => {
                  const total = lot.originalQuantity * lot.purchasePrice;
                  const paid = Math.max(0, Number(event.target.value) || 0);
                  patch({ paidNow: Math.min(total, paid) });
                }}
              />
            </Field>
            <Field label="Remainder">
              <MoneyInput
                value={String(
                  Math.max(0, lot.originalQuantity * lot.purchasePrice - (lot.paidNow ?? 0)),
                )}
                disabled={saving}
                onChange={(event) => {
                  const total = lot.originalQuantity * lot.purchasePrice;
                  const remainder = Math.max(0, Number(event.target.value) || 0);
                  patch({ paidNow: Math.max(0, total - remainder) });
                }}
              />
            </Field>
          </div>
        ) : null}
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          className="lot-save"
          variant="primary"
          disabled={saving || (branchRows.length > 0 && Math.abs(unallocated) > 1e-6)}
          onClick={save}
        >
          {saving ? "Saving…" : isNew ? "Add lot" : "Save lot"}
          <kbd className="ui-kbd">F12</kbd>
        </Button>
      </footer>
    </div>
  );
}
