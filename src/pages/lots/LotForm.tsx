import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, History } from "lucide-react";
import {
  Button,
  Field,
  MoneyInput,
  ProductSearch,
  SearchableSelect,
  SelectInput,
  TextInput,
} from "@/components/common";
import { UnitQtyFields } from "@/pages/products/LotFields";
import {
  formatStockQty,
  priceFromStock,
  pricePerStock,
  productSellUnits,
  unitLabel,
} from "@/pages/products/productQty";
import { staffUsers } from "@/shared/domain/mock";
import type { ProductLotRow, SupplierRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";

type ErrorField = "product" | "supplier" | "lot" | "quantity" | null;

function numberValue(raw: string) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function numberText(value: number) {
  return value ? String(value) : "";
}

function focusableElements(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])")]
    .filter((element) => element.offsetParent !== null);
}

function previousSupplierLot(lots: ProductLotRow[], lot: ProductLotRow) {
  if (!lot.productId || !lot.supplierId) return null;
  return lots
    .filter(
      (candidate) =>
        candidate.id !== lot.id &&
        candidate.productId === lot.productId &&
        candidate.supplierId === lot.supplierId,
    )
    .slice()
    .sort(
      (a, b) =>
        b.receivedAt.localeCompare(a.receivedAt) || b.lotNumber.localeCompare(a.lotNumber),
    )[0] ?? null;
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

export function LotForm({
  lot,
  lots,
  products,
  suppliers,
  isNew,
  onCreateSupplier,
  onChange,
  onSave,
  onClose,
}: {
  lot: ProductLotRow;
  lots: ProductLotRow[];
  products: Product[];
  suppliers: SupplierRow[];
  isNew: boolean;
  onCreateSupplier: (name: string) => string;
  onChange: (lot: ProductLotRow) => void;
  onSave: (lot: ProductLotRow) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<ErrorField>(null);
  const [priceUnitId, setPriceUnitId] = useState("");
  const product = products.find((item) => item.id === lot.productId);
  const units = product ? productSellUnits(product) : [];
  const stockSymbol = product?.unit ?? "pc";
  const unitKey = units.map((unit) => `${unit.id}:${unit.contains}`).join("|");
  const priceUnit = units.find((unit) => unit.id === priceUnitId) ?? units.find((unit) => unit.symbol === stockSymbol) ?? units[0];
  const previous = useMemo(
    () => previousSupplierLot(lots, lot),
    [lot.id, lot.productId, lot.supplierId, lots],
  );

  function patch(next: Partial<ProductLotRow>) {
    onChange({ ...lot, ...next });
    setError(null);
  }

  function applyProduct(nextProduct: Product | null) {
    if (!nextProduct) {
      patch({ productId: "" });
      return;
    }
    const candidate = { ...lot, productId: nextProduct.id };
    const history = previousSupplierLot(lots, candidate);
    patch({ productId: nextProduct.id, ...historicalPrices(history, nextProduct) });
  }

  function applySupplier(supplierId: string) {
    const candidate = { ...lot, supplierId };
    const history = previousSupplierLot(lots, candidate);
    patch({ supplierId, ...historicalPrices(history, product) });
  }

  function createSupplier(name: string) {
    applySupplier(onCreateSupplier(name));
  }

  function displayedPrice(value: number) {
    return priceUnit ? priceFromStock(units, stockSymbol, value, priceUnit) : value;
  }

  function stockPrice(value: number) {
    return priceUnit ? pricePerStock(units, stockSymbol, value, priceUnit) : value;
  }

  useEffect(() => {
    if (!units.length) {
      setPriceUnitId("");
      return;
    }
    if (!units.some((unit) => unit.id === priceUnitId)) {
      setPriceUnitId(units.find((unit) => unit.symbol === stockSymbol)?.id ?? units[0].id);
    }
  }, [lot.productId, priceUnitId, stockSymbol, unitKey]);

  function save() {
    if (!lot.productId) {
      setError("product");
      rootRef.current?.querySelector<HTMLElement>('[data-field="product"]')?.focus();
      return;
    }
    if (!lot.supplierId) {
      setError("supplier");
      rootRef.current?.querySelector<HTMLElement>('[data-field="supplier"]')?.focus();
      return;
    }
    if (!lot.lotNumber.trim()) {
      setError("lot");
      rootRef.current?.querySelector<HTMLElement>('[data-field="lotNumber"]')?.focus();
      return;
    }
    if (lot.originalQuantity <= 0) {
      setError("quantity");
      rootRef.current?.querySelector<HTMLElement>(".lot-quantity input")?.focus();
      return;
    }
    onSave(lot);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const openPicker = target.closest(".product-search.is-open, .ui-combo-field.is-open, .ui-combo-menu");
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
      if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || openPicker) return;
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
  });

  return (
    <div ref={rootRef} className="lot-form flex h-full min-h-0 flex-col overflow-hidden">
      <div className="lot-form-pane grid min-h-0 flex-1 content-start gap-3 overflow-hidden px-4 py-3">
        <Field
          label="Product"
          error={error === "product" ? "Select a product" : undefined}
        >
          <ProductSearch
            products={products}
            value={lot.productId}
            onChange={applyProduct}
            autoFocus
            invalid={error === "product"}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Supplier"
            error={error === "supplier" ? "Select a supplier" : undefined}
          >
            <SearchableSelect
              name="supplier"
              value={lot.supplierId}
              onChange={applySupplier}
              placeholder="Choose supplier"
              searchPlaceholder="Search suppliers"
              clearable={false}
              invalid={error === "supplier"}
              onCreate={createSupplier}
              createLabel="Add supplier"
              options={suppliers
                .filter((supplier) => supplier.isActive)
                .map((supplier) => ({ value: supplier.id, label: supplier.name }))}
            />
          </Field>
          <Field label="Lot number" error={error === "lot" ? "Lot number is required" : undefined}>
            <TextInput
              data-field="lotNumber"
              value={lot.lotNumber}
              onChange={(event) => patch({ lotNumber: event.target.value })}
            />
          </Field>
        </div>

        <section className="grid gap-3 rounded-xl border border-line bg-[#f8fafc] p-3">
          <div className="flex min-h-5 items-center justify-between gap-3">
            <strong className="text-[12px] font-bold text-ink">Units &amp; prices</strong>
            {previous ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-deep">
                <History size={12} /> From {previous.lotNumber} · {previous.receivedAt}
              </span>
            ) : product ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                <CheckCircle2 size={12} /> Current product prices
              </span>
            ) : null}
          </div>
          {product && priceUnit ? (
            <div className="grid grid-cols-[minmax(0,1fr)_130px] gap-3">
              <Field label="Product unit">
                <SelectInput value={priceUnit.id} onChange={(event) => setPriceUnitId(event.target.value)}>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name || unitLabel(unit.symbol || stockSymbol)}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Contains">
                <TextInput disabled value={formatStockQty(priceUnit.contains || 1)} />
              </Field>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Field label="Cost">
              <MoneyInput
                value={numberText(displayedPrice(lot.purchasePrice))}
                onChange={(event) => patch({ purchasePrice: stockPrice(numberValue(event.target.value)) })}
              />
            </Field>
            <Field label="Minimum">
              <MoneyInput
                value={numberText(displayedPrice(lot.minimumPrice))}
                onChange={(event) => patch({ minimumPrice: stockPrice(numberValue(event.target.value)) })}
              />
            </Field>
            <Field label="Wholesale">
              <MoneyInput
                value={numberText(displayedPrice(lot.wholesalePrice))}
                onChange={(event) => patch({ wholesalePrice: stockPrice(numberValue(event.target.value)) })}
              />
            </Field>
            <Field label="Retail">
              <MoneyInput
                value={numberText(displayedPrice(lot.retailPrice))}
                onChange={(event) => patch({ retailPrice: stockPrice(numberValue(event.target.value)) })}
              />
            </Field>
          </div>
        </section>

        {product && units.length ? (
          <div className="grid gap-3">
            <div className={error === "quantity" ? "lot-quantity rounded-lg ring-2 ring-danger/20" : "lot-quantity"}>
              <UnitQtyFields
                label="Quantity received"
                units={units}
                stockSymbol={stockSymbol}
                value={lot.originalQuantity}
                onChange={(quantity) =>
                  patch({
                    originalQuantity: quantity,
                    remainingQuantity: isNew
                      ? Math.max(0, quantity - lot.damagedQuantity)
                      : lot.remainingQuantity,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {!isNew ? (
                <UnitQtyFields
                  label="Quantity left"
                  units={units}
                  stockSymbol={stockSymbol}
                  value={lot.remainingQuantity}
                  onChange={(quantity) => patch({ remainingQuantity: quantity })}
                />
              ) : <span />}
              <UnitQtyFields
                label="Damaged"
                units={units}
                stockSymbol={stockSymbol}
                value={lot.damagedQuantity}
                onChange={(quantity) =>
                  patch({
                    damagedQuantity: quantity,
                    remainingQuantity: isNew
                      ? Math.max(0, lot.originalQuantity - quantity)
                      : lot.remainingQuantity,
                  })
                }
              />
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <Field label="Received date">
            <TextInput
              type="date"
              value={lot.receivedAt}
              onChange={(event) => patch({ receivedAt: event.target.value })}
            />
          </Field>
          <Field label="Expiry date" hint="Optional">
            <TextInput
              type="date"
              value={lot.expiryDate ?? ""}
              onChange={(event) => patch({ expiryDate: event.target.value || null })}
            />
          </Field>
          <Field label="Received by">
            <SelectInput
              value={lot.createdBy}
              onChange={(event) => patch({ createdBy: event.target.value })}
            >
              {staffUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-paper px-4 py-2.5">
        <p className="m-0 text-[10px] text-muted">
          <kbd className="ui-kbd">Enter</kbd> Next field · <kbd className="ui-kbd">F12</kbd> Save · <kbd className="ui-kbd">Esc</kbd> Close
        </p>
        <div className="flex shrink-0 gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button className="lot-save" variant="primary" onClick={save}>
            {isNew ? "Add lot" : "Save lot"}
            <kbd className="ui-kbd">F12</kbd>
          </Button>
        </div>
      </footer>
    </div>
  );
}
