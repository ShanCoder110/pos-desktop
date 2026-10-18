import { useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, PackagePlus, Trash2 } from "lucide-react";
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
import { useSettings } from "@/shared/settings";
import type { Product, ProductSellUnit } from "@/shared/types";
import { stockToDisplayedQuantity } from "@/utils/unitConversion";
import { creditState, limitMoneyDraft, money } from "@/utils/format";
import { productSellUnits, resolveProductSellUnit } from "@/pages/credit/creditSaleUtils";
import {
  availableWholeQty,
  creditTierPrice,
  hasCompleteSellUnit,
  parseWholeQtyDraft,
  toBaseQty,
  wholeQty,
  type SalePriceTier,
} from "@/utils/salePricing";
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

export const CREDIT_SALE_FORM_ID = "credit-sale-form";

function priceFor(unit: ProductSellUnit | undefined, mode: CreditPriceMode) {
  const tier: SalePriceTier =
    mode === "MINIMUM" ? "minimum" : mode === "WHOLESALE" ? "wholesale" : "retail";
  return creditTierPrice(unit, tier);
}

function availableInUnit(product: Product, unit: ProductSellUnit, usedBase: number) {
  return availableWholeQty(unit, Math.max(0, product.stock) - usedBase);
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
  const [searchKey, setSearchKey] = useState(0);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive !== false),
    [products],
  );
  useEffect(() => {
    onDirtyChange?.(lines.length > 0 || Boolean(notes.trim()));
  }, [lines.length, notes, onDirtyChange]);

  function pickProduct(product: Product | null) {
    if (!product) return;
    const units = productSellUnits(product);
    const usedBase = lines
      .filter((line) => line.productId === product.id)
      .reduce((sum, line) => sum + line.baseQuantity, 0);
    const preferred = resolveProductSellUnit(product);
    const unit =
      preferred && availableInUnit(product, preferred, usedBase) >= 1
        ? preferred
        : units.find((candidate) => availableInUnit(product, candidate, usedBase) >= 1);
    if (!unit?.id) {
      setError(`${product.name} is out of stock.`);
      return;
    }
    const unitPrice = Math.max(priceFor(unit, defaultPriceMode), unit.min);
    setError("");
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: product.id,
        productUnitId: unit.id,
        name: product.name,
        unitName: unit.name || product.unit,
        quantity: 1,
        baseQuantity: toBaseQty(product, unit.id, 1),
        unitPrice,
        priceMode: defaultPriceMode,
        quantityDraft: "1",
        unitPriceDraft: String(unitPrice),
      },
    ]);
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
      setSearchKey((key) => key + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : CREDIT_COPY.saleFailed);
    } finally {
      setSaving(false);
    }
  }

  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const totalQuantity = lines.reduce((sum, line) => sum + wholeQty(line.quantity), 0);
  const newBalance = previousBalance + total;

  function usedBaseExcept(productId: string, lineId: string) {
    return lines
      .filter((row) => row.productId === productId && row.id !== lineId)
      .reduce((sum, row) => sum + row.baseQuantity, 0);
  }

  function remainingBaseFor(line: CreditSaleLine) {
    const product = activeProducts.find((row) => row.id === line.productId);
    if (!product) return 0;
    return Math.max(0, product.stock) - usedBaseExcept(line.productId, line.id);
  }

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
    if (!product || !unit) return;
    const left = remainingBaseFor(line);
    if (!hasCompleteSellUnit(unit, left)) {
      setError(
        `${unit.name || product.unit} needs more than ${formatStockQty(left)} ${product.unit} available.`,
      );
      return;
    }
    const nextPrice = Math.max(priceFor(unit, line.priceMode), unit.min);
    const maxQty = availableWholeQty(unit, left);
    let quantity = wholeQty(stockToDisplayedQuantity(unit, line.baseQuantity));
    if (quantity > maxQty) quantity = maxQty;
    if (quantity <= 0) quantity = Math.min(1, maxQty);
    updateLine(line.id, {
      productUnitId,
      unitName: unit.name || product.unit || line.unitName,
      quantity,
      quantityDraft: String(quantity),
      unitPrice: nextPrice,
      unitPriceDraft: String(nextPrice),
    });
  }

  function commitLineQuantity(line: CreditSaleLine) {
    const product = activeProducts.find((row) => row.id === line.productId);
    const unit = product ? resolveProductSellUnit(product, line.productUnitId) : undefined;
    if (!product || !unit) return;
    const maxQty = availableWholeQty(unit, remainingBaseFor(line));
    let quantity = wholeQty(Number(line.quantityDraft ?? line.quantity)) || 1;
    if (quantity > maxQty) {
      quantity = maxQty;
      setError(
        maxQty > 0
          ? `Only ${maxQty} ${unit.name || product.unit} of ${line.name} left.`
          : `${line.name} is out of stock.`,
      );
    }
    if (quantity <= 0) {
      setError(`${line.name} is out of stock.`);
      quantity = maxQty > 0 ? Math.min(1, maxQty) : 0;
    }
    updateLine(line.id, {
      quantity: quantity > 0 ? quantity : 1,
      quantityDraft: String(quantity > 0 ? quantity : 1),
    });
  }

  function commitLinePrice(line: CreditSaleLine) {
    const product = activeProducts.find((row) => row.id === line.productId);
    const unit = product ? resolveProductSellUnit(product, line.productUnitId) : undefined;
    if (!unit) return;
    const raw = Number(line.unitPriceDraft ?? line.unitPrice);
    let unitPrice = Number.isFinite(raw) && raw >= 0 ? raw : unit.min;
    if (unitPrice < unit.min) {
      unitPrice = unit.min;
      setError(`${line.name} price cannot be below ${money(unit.min)}.`);
    }
    updateLine(line.id, {
      unitPrice,
      unitPriceDraft: String(unitPrice),
    });
  }

  function validateLines() {
    const usedByProduct = new Map<string, number>();
    for (const line of lines) {
      const product = activeProducts.find((row) => row.id === line.productId);
      const unit = product ? resolveProductSellUnit(product, line.productUnitId) : undefined;
      if (!product || !unit) return `${line.name} is no longer available.`;
      const quantity = wholeQty(Number(line.quantityDraft ?? line.quantity));
      const unitPrice = Number(line.unitPriceDraft ?? line.unitPrice);
      if (quantity <= 0 || quantity !== Number(line.quantityDraft ?? line.quantity)) {
        return `Enter a whole-number quantity for ${line.name}.`;
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
      <div className="grid gap-2 rounded-xl border border-line bg-paper p-2.5">
        <Field label="Add product">
          <ProductSearch
            key={searchKey}
            products={activeProducts}
            value=""
            onChange={pickProduct}
            placeholder="Search product ID, name, SKU, or barcode"
            autoFocus
            clearable
            showInventory
            showPrice
            blockOutOfStock
            invalid={Boolean(error && !lines.length)}
          />
        </Field>
        <p className="m-0 text-[10px] text-muted">
          Select a result to add it immediately, then adjust unit, quantity, and price in the table.
        </p>
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
            {lines.map((line) => {
              const product = activeProducts.find((row) => row.id === line.productId);
              const units = product ? productSellUnits(product) : [];
              const unit = product
                ? resolveProductSellUnit(product, line.productUnitId)
                : undefined;
              const left = remainingBaseFor(line);
              const maxQty = unit ? availableWholeQty(unit, left) : 0;
              const minPrice = unit?.min ?? 0;
              return (
                <tr key={line.id}>
                  <Td>
                    <strong className="block text-[12px] text-ink">{line.name}</strong>
                    <small className="text-[10px] text-muted">
                      {line.priceMode.toLowerCase()}
                      {maxQty > 0
                        ? ` · ${maxQty} ${unit?.name || product?.unit || ""} left`
                        : " · out of stock"}
                    </small>
                  </Td>
                  <Td>
                    {units.length > 1 ? (
                      <UnitSegmentedControl
                        units={units.map((row) => ({
                          id: row.id,
                          label: row.name,
                          disabled: !hasCompleteSellUnit(row, left),
                        }))}
                        value={line.productUnitId}
                        onChange={(unitId) => changeLineUnit(line, unitId)}
                        ariaLabel={`Unit for ${line.name}`}
                        className="min-w-[120px]"
                        compact
                      />
                    ) : (
                      <span className="text-[11px] font-medium text-sub">{line.unitName}</span>
                    )}
                  </Td>
                  <Td>
                    <TextInput
                      inputMode="numeric"
                      aria-label={`Quantity for ${line.name}`}
                      value={line.quantityDraft ?? String(line.quantity)}
                      onChange={(event) => {
                        const value = parseWholeQtyDraft(event.target.value);
                        const quantity = wholeQty(Number(value));
                        if (!value) {
                          updateLine(line.id, { quantityDraft: "" });
                          return;
                        }
                        const capped = Math.min(quantity, maxQty);
                        if (quantity > maxQty) {
                          setError(
                            maxQty > 0
                              ? `Only ${maxQty} ${unit?.name || product?.unit || ""} of ${line.name} left.`
                              : `${line.name} is out of stock.`,
                          );
                        }
                        updateLine(line.id, {
                          quantityDraft: String(capped > 0 ? capped : quantity),
                          quantity: capped > 0 ? capped : quantity,
                        });
                      }}
                      onBlur={() => commitLineQuantity(line)}
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
                          ...(Number.isFinite(unitPrice) && unitPrice >= minPrice
                            ? { unitPrice }
                            : {}),
                        });
                      }}
                      onBlur={() => commitLinePrice(line)}
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
              );
            })}
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
