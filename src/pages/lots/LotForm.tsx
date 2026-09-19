import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, History } from "lucide-react";
import {
  Button,
  Field,
  ProductSearch,
  SearchableSelect,
  TextInput,
} from "@/components/common";
import { LotUnitLines } from "@/pages/products/LotFields";
import { productSellUnits } from "@/pages/products/productQty";
import type { ProductLotRow, SupplierRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";

type ErrorField = "product" | "supplier" | "lot" | "quantity" | null;

function focusableElements(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])")]
    .filter((element) => element.offsetParent !== null);
}

function latestLot(
  lots: ProductLotRow[],
  lot: ProductLotRow,
  match: (candidate: ProductLotRow) => boolean,
) {
  return lots
    .filter((candidate) => candidate.id !== lot.id && match(candidate))
    .slice()
    .sort(
      (a, b) =>
        b.receivedAt.localeCompare(a.receivedAt) || b.lotNumber.localeCompare(a.lotNumber),
    )[0] ?? null;
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
  const product = products.find((item) => item.id === lot.productId);
  const units = product ? productSellUnits(product) : [];
  const stockSymbol = product?.unit ?? "pc";
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
    const supplierId = lot.supplierId || lastProductLot(lots, lot, nextProduct.id)?.supplierId || "";
    const candidate = { ...lot, productId: nextProduct.id, supplierId };
    const history = previousSupplierLot(lots, candidate);
    patch({ productId: nextProduct.id, supplierId, ...historicalPrices(history, nextProduct) });
  }

  function applySupplier(supplierId: string) {
    const candidate = { ...lot, supplierId };
    const history = previousSupplierLot(lots, candidate);
    patch({ supplierId, ...historicalPrices(history, product) });
  }

  function createSupplier(name: string) {
    applySupplier(onCreateSupplier(name));
  }

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
    onSave({
      ...lot,
      receivedAt: lot.receivedAt || new Date().toISOString().slice(0, 10),
      expiryDate: null,
      createdBy: lot.createdBy || "u1",
    });
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
      <div className="lot-form-pane grid min-h-0 flex-1 content-start gap-3 overflow-y-auto overflow-x-hidden px-4 py-3">
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

        {product && units.length ? (
          <section className="grid gap-3">
            <div className="flex min-h-5 items-center justify-between gap-3">
              <strong className="text-[12px] font-bold text-ink">Units &amp; prices</strong>
              {previous ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-deep">
                  <History size={12} /> From {previous.lotNumber}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                  <CheckCircle2 size={12} /> Current product prices
                </span>
              )}
            </div>
            <div className={error === "quantity" ? "lot-quantity" : undefined}>
              <LotUnitLines
                units={units}
                stockSymbol={stockSymbol}
                seedKey={`${lot.productId}:${lot.supplierId}:${previous?.id ?? "catalog"}`}
                received={lot.originalQuantity}
                left={lot.remainingQuantity}
                damaged={lot.damagedQuantity}
                showLeft={!isNew}
                onReceived={(quantity) =>
                  patch({
                    originalQuantity: quantity,
                    remainingQuantity: isNew
                      ? Math.max(0, quantity - lot.damagedQuantity)
                      : lot.remainingQuantity,
                  })
                }
                onLeft={(quantity) => patch({ remainingQuantity: quantity })}
                onDamaged={(quantity) =>
                  patch({
                    damagedQuantity: quantity,
                    remainingQuantity: isNew
                      ? Math.max(0, lot.originalQuantity - quantity)
                      : lot.remainingQuantity,
                  })
                }
                cost={lot.purchasePrice}
                min={lot.minimumPrice}
                wholesale={lot.wholesalePrice}
                retail={lot.retailPrice}
                onCost={(price) => patch({ purchasePrice: price })}
                onMin={(price) => patch({ minimumPrice: price })}
                onWholesale={(price) => patch({ wholesalePrice: price })}
                onRetail={(price) => patch({ retailPrice: price })}
              />
            </div>
          </section>
        ) : (
          <p className="m-0 text-[11px] text-muted">Select a product to load units and prices.</p>
        )}
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
