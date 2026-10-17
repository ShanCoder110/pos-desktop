import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { ProductSearch } from "@/components/common/ProductSearch";
import { TextInput } from "@/components/common/fields";
import { UnitSegmentedControl } from "@/components/common/UnitSegmentedControl";
import {
  formatStockQty,
  productSellUnits,
  qtyInUnit,
  unitInStock,
  unitLabel,
} from "@/pages/products/productQty";
import type { Product } from "@/shared/types";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { cn, money } from "@/utils/format";
import {
  defaultTransactionUnit,
  displayedToStockQuantity,
  stockToDisplayedQuantity,
} from "@/utils/unitConversion";

export type ProductQuantityValue = {
  productId: string;
  unitId?: string;
  quantity: number;
  baseQuantity?: number;
};

function numeric(raw: string) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function numericText(value: number) {
  return value ? String(value) : "";
}

export function ProductQuantityPicker({
  products,
  value,
  onChange,
  onRemove,
  placeholder = "Search component",
  recipeTone = false,
  onAddNext,
}: {
  products: Product[];
  value: ProductQuantityValue;
  onChange: (value: ProductQuantityValue) => void;
  onRemove: () => void;
  placeholder?: string;
  recipeTone?: boolean;
  onAddNext?: () => void;
}) {
  const quantityRef = useRef<HTMLInputElement>(null);
  const unitRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const nextFocus = useRef<"unit" | "quantity" | null>(null);
  const product = products.find((item) => item.id === value.productId);
  const units = product ? productSellUnits(product) : [];
  const selectedUnit = product
    ? (units.find((unit) => unit.id === value.unitId) ?? defaultTransactionUnit(product, units))
    : undefined;
  const hasUnitChoice = units.length > 1;
  const available =
    product && selectedUnit ? qtyInUnit(units, product.unit, selectedUnit, product.stock) : 0;
  const insufficient = Boolean(product && selectedUnit && value.quantity > available + 1e-6);
  const lowStock = Boolean(
    product && product.stock > 0 && product.stock < (product.minimumStock ?? 20),
  );
  const unitCost = selectedUnit?.cost ?? 0;

  useEffect(() => {
    if (!product || !selectedUnit || !nextFocus.current) return;
    const target = nextFocus.current;
    nextFocus.current = null;
    requestAnimationFrame(() => {
      if (target === "unit") unitRefs.current[selectedUnit.id]?.focus();
      else {
        quantityRef.current?.focus();
        quantityRef.current?.select();
      }
    });
  }, [product, selectedUnit]);

  function selectProduct(selected: Product | null) {
    if (!selected) {
      onChange({ ...value, productId: "", unitId: undefined, baseQuantity: 0 });
      return;
    }
    const nextUnits = productSellUnits(selected);
    const base = defaultTransactionUnit(selected, nextUnits);
    const availableQuantity = base ? qtyInUnit(nextUnits, selected.unit, base, selected.stock) : 0;
    const quantity = Math.min(Math.max(value.quantity || 1, 0), availableQuantity);
    nextFocus.current = nextUnits.length > 1 ? "unit" : "quantity";
    onChange({
      ...value,
      productId: selected.id,
      unitId: base?.id,
      quantity,
      baseQuantity: base ? quantity * unitInStock(nextUnits, selected.unit, base) : quantity,
    });
  }

  function selectUnit(unitId: string, moveToQuantity = true) {
    if (!product) return;
    const unit = units.find((item) => item.id === unitId);
    if (!unit) return;
    const currentBase = selectedUnit
      ? (value.baseQuantity ?? displayedToStockQuantity(selectedUnit, value.quantity || 1))
      : 1;
    const nextAvailable = qtyInUnit(units, product.unit, unit, product.stock);
    const quantity = Math.min(stockToDisplayedQuantity(unit, currentBase), nextAvailable);
    onChange({
      ...value,
      unitId,
      quantity,
      baseQuantity: displayedToStockQuantity(unit, quantity),
    });
    if (moveToQuantity) {
      requestAnimationFrame(() => {
        quantityRef.current?.focus();
        quantityRef.current?.select();
      });
    }
  }

  function onUnitKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Enter" || event.key === "Tab") {
      if (event.key === "Tab" && event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      quantityRef.current?.focus();
      quantityRef.current?.select();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const nextIndex = (index + (backwards ? -1 : 1) + units.length) % units.length;
    const nextUnit = units[nextIndex];
    selectUnit(nextUnit.id, false);
    requestAnimationFrame(() => unitRefs.current[nextUnit.id]?.focus());
  }

  return (
    <article
      className={cn(
        "product-quantity-picker relative grid gap-3 overflow-visible rounded-xl border bg-paper p-3 focus-within:z-30",
        insufficient
          ? "border-danger/60 ring-2 ring-danger/10"
          : recipeTone
            ? "border-violet-200 bg-violet-50/20"
            : "border-line",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_36px] items-start gap-2">
        <ProductSearch
          products={products}
          value={value.productId}
          onChange={selectProduct}
          placeholder={placeholder}
          autoFocus={!value.productId}
          clearable
          showInventory
          showCost
          blockOutOfStock
        />
        <Button size="icon" variant="ghost" aria-label="Remove component" onClick={onRemove}>
          <Trash2 size={14} />
        </Button>
      </div>

      {product && selectedUnit ? (
        <div
          className={cn(
            "grid items-end gap-3 rounded-lg bg-bg/70 p-2.5",
            hasUnitChoice
              ? "grid-cols-[minmax(180px,1fr)_120px_minmax(150px,auto)]"
              : "grid-cols-[120px_minmax(180px,1fr)]",
          )}
        >
          {hasUnitChoice ? (
            <div className="grid gap-1.5">
              <span className="text-[10px] font-bold text-muted">Unit</span>
              <UnitSegmentedControl
                units={units.map((unit) => ({
                  id: unit.id,
                  label: unit.name || unitLabel(unit.symbol || product.unit),
                }))}
                value={selectedUnit.id}
                onChange={selectUnit}
                onButtonRef={(unitId, element) => {
                  unitRefs.current[unitId] = element;
                }}
                onKeyDown={onUnitKeyDown}
              />
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <span className="text-[10px] font-bold text-muted">Quantity</span>
            <TextInput
              inputRef={quantityRef}
              inputMode="decimal"
              maxLength={FIELD_LIMITS.qty}
              placeholder="1"
              className={insufficient ? "!border-danger" : undefined}
              value={numericText(value.quantity)}
              onChange={(event) => {
                const quantity = numeric(event.target.value);
                onChange({
                  ...value,
                  unitId: selectedUnit.id,
                  quantity,
                  baseQuantity: displayedToStockQuantity(selectedUnit, quantity),
                });
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !onAddNext) return;
                event.preventDefault();
                event.stopPropagation();
                onAddNext();
              }}
            />
          </div>

          <div className="grid min-h-[38px] content-center gap-0.5 border-l border-line pl-3">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-bold",
                insufficient ? "text-danger" : lowStock ? "text-amber-700" : "text-accent-deep",
              )}
            >
              {insufficient || lowStock ? <AlertTriangle size={11} /> : null}
              {insufficient
                ? `Only ${formatStockQty(available)} available`
                : `${formatStockQty(available)} available`}
            </span>
            <span className="text-[10px] text-muted">
              Cost {money(unitCost)} · Total {money(unitCost * value.quantity)}
            </span>
          </div>
        </div>
      ) : null}
    </article>
  );
}
