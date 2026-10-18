import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AlertTriangle, MessageSquarePlus, PackagePlus, Trash2 } from "lucide-react";
import {
  Button,
  Field,
  ProductSearch,
  Table,
  Td,
  TextArea,
  TextInput,
  THead,
  Th,
  UnitSegmentedControl,
} from "@/components/common";
import { CREDIT_COPY } from "@/shared/constants/customers";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { useSettings } from "@/shared/settings";
import type { Product, ProductSellUnit } from "@/shared/types";
import { stockToDisplayedQuantity } from "@/utils/unitConversion";
import { cn, creditState, limitMoneyDraft, money } from "@/utils/format";
import { productSellUnits, resolveProductSellUnit } from "@/pages/credit/creditSaleUtils";
import { creditTierPrice, stockPerUnit, toBaseQty, type SalePriceTier } from "@/utils/salePricing";
import { formatStockQty } from "@/pages/products/productQty";

type CreditPriceMode = "MINIMUM" | "WHOLESALE" | "RETAIL";

export type CreditSaleLine = {
  id: string;
  productId: string;
  productUnitId: string;
  name: string;
  unitName: string;
  quantity: number;
  baseQuantity: number;
  unitPrice: number;
  priceMode: CreditPriceMode;
  quantityDraft?: string;
  unitPriceDraft?: string;
};

type DraftLine = {
  productId: string;
  productUnitId: string;
  quantity: string;
  unitPrice: string;
  priceMode: CreditPriceMode;
};

const blankDraft = (priceMode: "WHOLESALE" | "RETAIL"): DraftLine => ({
  productId: "",
  productUnitId: "",
  quantity: "1",
  unitPrice: "",
  priceMode,
});

const PRICE_MODES: { id: CreditPriceMode; label: string }[] = [
  { id: "MINIMUM", label: "Minimum" },
  { id: "WHOLESALE", label: "Wholesale" },
  { id: "RETAIL", label: "Retail" },
];

export const CREDIT_SALE_FORM_ID = "credit-sale-form";

function priceFor(unit: ProductSellUnit | undefined, mode: CreditPriceMode) {
  const tier: SalePriceTier =
    mode === "MINIMUM" ? "minimum" : mode === "WHOLESALE" ? "wholesale" : "retail";
  return creditTierPrice(unit, tier);
}

function availableInUnit(product: Product, unit: ProductSellUnit, usedBase: number) {
  const per = stockPerUnit(unit);
  if (per <= 0) return 0;
  return Math.max(0, (Math.max(0, product.stock) - usedBase) / per);
}

export function CreditSaleForm({
  products,
  onSubmit,
  previousBalance = 0,
  onDirtyChange,
  hideSubmitButton = false,
}: {
  products: Product[];
  onSubmit: (lines: CreditSaleLine[], notes: string) => Promise<void>;
  previousBalance?: number;
  onDirtyChange?: (dirty: boolean) => void;
  hideSubmitButton?: boolean;
}) {
  const { settings } = useSettings();
  const defaultPriceMode = settings.creditPriceMode;
  const [lines, setLines] = useState<CreditSaleLine[]>([]);
  const [draft, setDraft] = useState<DraftLine>(() => blankDraft(defaultPriceMode));
  const [searchKey, setSearchKey] = useState(0);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const quantityRef = useRef<HTMLInputElement>(null);
  const unitRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const nextFocus = useRef<"unit" | "quantity" | null>(null);

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive !== false),
    [products],
  );
  const selectedProduct = activeProducts.find((product) => product.id === draft.productId);
  const unitOptions = selectedProduct ? productSellUnits(selectedProduct) : [];
  const selectedUnit = selectedProduct
    ? resolveProductSellUnit(selectedProduct, draft.productUnitId)
    : undefined;
  const usedBase = selectedProduct
    ? lines
        .filter((line) => line.productId === selectedProduct.id)
        .reduce((sum, line) => sum + line.baseQuantity, 0)
    : 0;
  const available =
    selectedProduct && selectedUnit ? availableInUnit(selectedProduct, selectedUnit, usedBase) : 0;
  const requested = Number(draft.quantity);
  const insufficient = Boolean(
    selectedProduct && selectedUnit && Number.isFinite(requested) && requested > available + 1e-6,
  );
  const lowStock = Boolean(
    selectedProduct &&
    selectedProduct.stock > 0 &&
    selectedProduct.stock < (selectedProduct.minimumStock ?? 20),
  );

  useEffect(() => {
    onDirtyChange?.(lines.length > 0 || Boolean(draft.productId) || Boolean(notes.trim()));
  }, [draft.productId, lines.length, notes, onDirtyChange]);

  useEffect(() => {
    if (!selectedUnit || !nextFocus.current) return;
    const target = nextFocus.current;
    nextFocus.current = null;
    requestAnimationFrame(() => {
      if (target === "unit") unitRefs.current[selectedUnit.id]?.focus();
      else {
        quantityRef.current?.focus();
        quantityRef.current?.select();
      }
    });
  }, [selectedUnit]);

  function pickProduct(product: Product | null) {
    if (!product) {
      setDraft(blankDraft(defaultPriceMode));
      return;
    }
    const unit = resolveProductSellUnit(product);
    nextFocus.current = productSellUnits(product).length > 1 ? "unit" : "quantity";
    setError("");
    setDraft({
      productId: product.id,
      productUnitId: unit?.id ?? "",
      quantity: "1",
      unitPrice: String(priceFor(unit, defaultPriceMode)),
      priceMode: defaultPriceMode,
    });
  }

  function pickUnit(productUnitId: string, moveToQuantity = true) {
    if (!selectedProduct) return;
    const unit = unitOptions.find((row) => row.id === productUnitId);
    if (!unit) return;
    setDraft((prev) => ({
      ...prev,
      productUnitId,
      unitPrice: String(priceFor(unit, prev.priceMode)),
    }));
    if (moveToQuantity) {
      requestAnimationFrame(() => {
        quantityRef.current?.focus();
        quantityRef.current?.select();
      });
    }
  }

  function onUnitKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault();
      quantityRef.current?.focus();
      quantityRef.current?.select();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const next =
      unitOptions[(index + (backwards ? -1 : 1) + unitOptions.length) % unitOptions.length];
    pickUnit(next.id, false);
    requestAnimationFrame(() => unitRefs.current[next.id]?.focus());
  }

  function pickPriceMode(priceMode: CreditPriceMode) {
    setDraft((prev) => ({
      ...prev,
      priceMode,
      unitPrice: String(priceFor(selectedUnit, priceMode)),
    }));
  }

  function addLine() {
    const product = activeProducts.find((row) => row.id === draft.productId);
    const unit = product ? resolveProductSellUnit(product, draft.productUnitId) : undefined;
    const quantity = Number(draft.quantity);
    const unitPrice = Number(draft.unitPrice);
    if (!product || !unit?.id) {
      setError(CREDIT_COPY.productRequired);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter a valid quantity.");
      return;
    }
    if (quantity > available + 1e-6) {
      setError(`Only ${formatStockQty(available)} ${unit.name || product.unit} available.`);
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < unit.min) {
      setError(`Price cannot be below ${money(unit.min)}.`);
      return;
    }
    const baseQuantity = toBaseQty(product, unit.id, quantity);
    setError("");
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: product.id,
        productUnitId: unit.id,
        name: product.name,
        unitName: unit.name || product.unit,
        quantity,
        baseQuantity,
        unitPrice,
        priceMode: draft.priceMode,
        quantityDraft: String(quantity),
        unitPriceDraft: String(unitPrice),
      },
    ]);
    setDraft(blankDraft(defaultPriceMode));
    setSearchKey((key) => key + 1);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!lines.length) {
      setError(CREDIT_COPY.linesRequired);
      return;
    }
    const validationError = validateLines();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(lines, notes.trim());
      setLines([]);
      setNotes("");
      setShowNotes(false);
      setDraft(blankDraft(defaultPriceMode));
      setSearchKey((key) => key + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : CREDIT_COPY.saleFailed);
    } finally {
      setSaving(false);
    }
  }

  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const newBalance = previousBalance + total;

  function updateLine(id: string, changes: Partial<CreditSaleLine>) {
    setError("");
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...changes };
        const product = activeProducts.find((row) => row.id === next.productId);
        const unit = product ? resolveProductSellUnit(product, next.productUnitId) : undefined;
        if (unit) {
          next.unitName = unit.name || product?.unit || line.unitName;
          next.baseQuantity = product ? toBaseQty(product, unit.id, next.quantity) : next.quantity;
        }
        return next;
      }),
    );
  }

  function changeLineUnit(line: CreditSaleLine, productUnitId: string) {
    const product = activeProducts.find((row) => row.id === line.productId);
    const unit = product ? resolveProductSellUnit(product, productUnitId) : undefined;
    if (!unit) return;
    const nextPrice = priceFor(unit, line.priceMode);
    const quantity = stockToDisplayedQuantity(unit, line.baseQuantity);
    updateLine(line.id, {
      productUnitId,
      unitName: unit.name || product?.unit || line.unitName,
      quantity,
      quantityDraft: String(quantity),
      unitPrice: nextPrice,
      unitPriceDraft: String(nextPrice),
    });
  }

  function validateLines() {
    const usedByProduct = new Map<string, number>();
    for (const line of lines) {
      const product = activeProducts.find((row) => row.id === line.productId);
      const unit = product ? resolveProductSellUnit(product, line.productUnitId) : undefined;
      if (!product || !unit) return `${line.name} is no longer available.`;
      const quantity = Number(line.quantityDraft ?? line.quantity);
      const unitPrice = Number(line.unitPriceDraft ?? line.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return `Enter a valid quantity for ${line.name}.`;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < unit.min) {
        return `${line.name} price cannot be below ${money(unit.min)}.`;
      }
      const nextUsed = (usedByProduct.get(line.productId) ?? 0) + line.baseQuantity;
      if (nextUsed > product.stock + 1e-6) {
        return `Only ${formatStockQty(product.stock)} ${product.unit} of ${line.name} is available.`;
      }
      usedByProduct.set(line.productId, nextUsed);
    }
    return "";
  }

  return (
    <form id={CREDIT_SALE_FORM_ID} className="ui-stack grid gap-2.5" onSubmit={handleSubmit}>
      <div className="grid gap-2.5 rounded-xl border border-line bg-paper p-2.5">
        <Field label="Add product">
          <ProductSearch
            key={searchKey}
            products={activeProducts}
            value={draft.productId}
            onChange={pickProduct}
            placeholder="Search product ID, name, SKU, or barcode"
            autoFocus
            clearable
            showInventory
            showPrice
            blockOutOfStock
            invalid={Boolean(error && !selectedProduct)}
          />
        </Field>

        {selectedProduct && selectedUnit ? (
          <div className="grid gap-2.5 rounded-lg bg-bg/70 p-2.5">
            {unitOptions.length > 1 ? (
              <div className="grid gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  Unit
                </span>
                <UnitSegmentedControl
                  units={unitOptions.map((unit) => ({ id: unit.id, label: unit.name || "Unit" }))}
                  value={selectedUnit.id}
                  onChange={pickUnit}
                  onButtonRef={(unitId, element) => {
                    unitRefs.current[unitId] = element;
                  }}
                  onKeyDown={onUnitKeyDown}
                />
              </div>
            ) : null}

            <Field label="Price tier (for selected unit)">
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-paper p-1">
                {PRICE_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={cn(
                      "flex min-h-[44px] flex-col items-center justify-center rounded-md border-0 px-2 text-[10px] font-bold",
                      draft.priceMode === mode.id
                        ? "bg-accent-bg text-accent-deep"
                        : "bg-transparent text-muted hover:bg-bg",
                    )}
                    onClick={() => pickPriceMode(mode.id)}
                  >
                    <span>{mode.label}</span>
                    <span className="text-[11px] tabular-nums">
                      {money(priceFor(selectedUnit, mode.id))}
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-[110px_minmax(0,1fr)] items-end gap-2">
              <Field label="Quantity">
                <TextInput
                  inputRef={quantityRef}
                  inputMode="decimal"
                  maxLength={FIELD_LIMITS.qty}
                  value={draft.quantity}
                  className={insufficient ? "!border-danger" : undefined}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, quantity: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    addLine();
                  }}
                />
              </Field>
              <Field label="Unit price">
                <TextInput
                  inputMode="decimal"
                  maxLength={FIELD_LIMITS.moneyChars}
                  value={draft.unitPrice}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      unitPrice: limitMoneyDraft(event.target.value),
                    }))
                  }
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-bold",
                  insufficient ? "text-danger" : lowStock ? "text-amber-700" : "text-accent-deep",
                )}
              >
                {insufficient || lowStock ? <AlertTriangle size={12} /> : null}
                {formatStockQty(available)} {selectedUnit.name || selectedProduct.unit} available
              </span>
              <span className="text-muted">
                Cost {money(selectedUnit.cost)} · Minimum {money(selectedUnit.min)}
              </span>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<PackagePlus size={14} />}
                disabled={insufficient || available <= 0}
                onClick={addLine}
              >
                Add product
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {lines.length ? (
        <Table>
          <THead>
            <tr>
              <Th>Product</Th>
              <Th>Unit</Th>
              <Th>Qty</Th>
              <Th>Price</Th>
              <Th>Total</Th>
              <Th />
            </tr>
          </THead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <Td>
                  <strong className="block text-[12px] text-ink">{line.name}</strong>
                  <small className="text-[10px] text-muted">{line.priceMode.toLowerCase()}</small>
                </Td>
                <Td>
                  {(() => {
                    const product = activeProducts.find((row) => row.id === line.productId);
                    const units = product ? productSellUnits(product) : [];
                    return units.length > 1 ? (
                      <UnitSegmentedControl
                        units={units.map((unit) => ({ id: unit.id, label: unit.name }))}
                        value={line.productUnitId}
                        onChange={(unitId) => changeLineUnit(line, unitId)}
                        ariaLabel={`Unit for ${line.name}`}
                        className="min-w-[120px]"
                        compact
                      />
                    ) : (
                      <span className="text-[11px] font-medium text-sub">{line.unitName}</span>
                    );
                  })()}
                </Td>
                <Td>
                  <TextInput
                    inputMode="decimal"
                    aria-label={`Quantity for ${line.name}`}
                    value={line.quantityDraft ?? String(line.quantity)}
                    onChange={(event) => {
                      const value = event.target.value;
                      const quantity = Number(value);
                      updateLine(line.id, {
                        quantityDraft: value,
                        ...(Number.isFinite(quantity) && quantity > 0 ? { quantity } : {}),
                      });
                    }}
                  />
                </Td>
                <Td>
                  <TextInput
                    inputMode="decimal"
                    aria-label={`Price for ${line.name}`}
                    value={line.unitPriceDraft ?? String(line.unitPrice)}
                    onChange={(event) => {
                      const value = limitMoneyDraft(event.target.value);
                      const unitPrice = Number(value);
                      updateLine(line.id, {
                        unitPriceDraft: value,
                        ...(Number.isFinite(unitPrice) && unitPrice >= 0 ? { unitPrice } : {}),
                      });
                    }}
                  />
                </Td>
                <Td numeric>{money(line.quantity * line.unitPrice)}</Td>
                <Td>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${line.name}`}
                    onClick={() => setLines((prev) => prev.filter((row) => row.id !== line.id))}
                  >
                    <Trash2 size={14} />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <div className="grid min-h-16 place-items-center rounded-xl border border-dashed border-line bg-bg/40 py-3 text-center">
          <div>
            <PackagePlus className="mx-auto mb-1 text-muted" size={20} />
            <p className="text-[12px] font-semibold text-sub">No products added</p>
            <small className="text-[10px] text-muted">Search above to build the credit bill</small>
          </div>
        </div>
      )}

      {showNotes ? (
        <Field label="Note">
          <TextArea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional note"
            autoFocus
          />
        </Field>
      ) : (
        <div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={<MessageSquarePlus size={14} />}
            onClick={() => setShowNotes(true)}
          >
            Add note
          </Button>
        </div>
      )}

      <div className="sticky bottom-0 z-10 grid grid-cols-3 gap-2 rounded-xl border border-line bg-paper p-3 text-[11px] shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
        <div>
          <span className="block text-muted">Previous balance</span>
          <strong className="text-ink">{creditState(previousBalance).text}</strong>
        </div>
        <div>
          <span className="block text-muted">This sale</span>
          <strong className="text-[var(--danger)]">+ {money(total)}</strong>
          <small className="block text-[9px] text-muted">
            {lines.length} product{lines.length === 1 ? "" : "s"} · {formatStockQty(totalQuantity)}{" "}
            qty
          </small>
        </div>
        <div className="text-right">
          <span className="block text-muted">After balance</span>
          <strong className="text-[var(--danger)]">{creditState(newBalance).text}</strong>
        </div>
      </div>

      {error ? <p className="text-[12px] text-[var(--danger)]">{error}</p> : null}
      {!hideSubmitButton ? (
        <Button type="submit" variant="primary" disabled={saving || !lines.length}>
          {saving ? "Saving…" : CREDIT_COPY.newCreditSale}
        </Button>
      ) : null}
    </form>
  );
}
