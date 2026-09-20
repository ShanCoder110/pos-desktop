import { useEffect, useMemo, useState } from "react";
import { TextInput } from "@/components/common";
import {
  displayQtyFromStock,
  productSellUnits,
  stockFromDisplayQty,
  unitLabel,
} from "@/pages/products/productQty";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import type { Product, ProductSellUnit } from "@/shared/types";
import { cn } from "@/utils/format";

export function defaultSellUnit(product: Product): ProductSellUnit | undefined {
  const units = productSellUnits(product);
  return units.find((unit) => unit.symbol === product.unit) ?? units[0];
}

export function productUnitOptions(product: Product) {
  return productSellUnits(product).map((unit) => ({
    value: unit.id,
    label: unit.name || unitLabel(unit.symbol || product.unit),
  }));
}

export function useProductUnitQty(product?: Product, preferredUnitId?: string) {
  const units = useMemo(() => (product ? productSellUnits(product) : []), [product]);
  const [unitId, setUnitId] = useState(preferredUnitId ?? "");

  useEffect(() => {
    if (!product) {
      setUnitId("");
      return;
    }
    const next = productSellUnits(product);
    const pick =
      next.find((unit) => unit.id === preferredUnitId) ?? defaultSellUnit(product) ?? next[0];
    setUnitId(pick?.id ?? "");
  }, [product?.id, preferredUnitId]);

  const selectedUnit =
    units.find((unit) => unit.id === unitId) ?? (product ? defaultSellUnit(product) : undefined);

  return { units, unitId, setUnitId, selectedUnit, stockSymbol: product?.unit ?? "pc" };
}

/** Compact unit switch — one choice for the whole form/table; wraps for any sell units. */
export function UnitQtySwitch({
  product,
  unitId,
  onUnitIdChange,
  className,
}: {
  product: Product;
  unitId: string;
  onUnitIdChange: (unitId: string) => void;
  className?: string;
}) {
  const units = productSellUnits(product);
  if (units.length <= 1) return null;

  const active = units.find((unit) => unit.id === unitId) ?? defaultSellUnit(product) ?? units[0];

  return (
    <div className={cn("unit-qty-switch", className)}>
      <span className="unit-qty-switch-label">Enter in</span>
      <div className="unit-qty-switch-options" role="group" aria-label="Quantity unit">
        {units.map((unit) => {
          const name = unit.name || unitLabel(unit.symbol || product.unit);
          const on = unit.id === active.id;
          return (
            <button
              key={unit.id}
              type="button"
              className={cn("unit-qty-switch-btn", on && "is-on")}
              aria-pressed={on}
              onClick={() => onUnitIdChange(unit.id)}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Qty input with unit suffix — pair with UnitQtySwitch when product has multiple units. */
export function UnitQtyInput({
  product,
  unitId,
  stockQty,
  disabled,
  className,
  onStockQtyChange,
}: {
  product: Product;
  unitId: string;
  stockQty: number;
  disabled?: boolean;
  className?: string;
  onStockQtyChange: (stockQty: number) => void;
}) {
  const units = productSellUnits(product);
  const unit = units.find((row) => row.id === unitId) ?? defaultSellUnit(product);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    setEditing(false);
    setText("");
  }, [unitId]);

  if (!unit) return null;

  const displayQty = stockQty > 0 ? displayQtyFromStock(units, product.unit, unit, stockQty) : 0;
  const unitName = unit.name || unitLabel(unit.symbol || product.unit);
  const shown = editing ? text : displayQty > 0 ? String(displayQty) : "";

  function parseDisplayStock(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === "") return 0;
    if (!/^\d*\.?\d*$/.test(trimmed) || trimmed.endsWith(".")) return null;
    const nextDisplay = Number(trimmed);
    if (!Number.isFinite(nextDisplay) || nextDisplay < 0) return null;
    if (!unit) return 0;
    return stockFromDisplayQty(units, product.unit, unit, nextDisplay);
  }

  function applyStock(raw: string) {
    const nextStock = parseDisplayStock(raw);
    if (nextStock !== null) onStockQtyChange(nextStock);
  }

  return (
    <div className={cn("unit-qty-input-wrap", className)}>
      <TextInput
        className="unit-qty-input-field tabular-nums"
        dir="ltr"
        inputMode="decimal"
        maxLength={FIELD_LIMITS.qty}
        placeholder="0"
        disabled={disabled}
        aria-label={`Quantity in ${unitName}`}
        value={shown}
        onFocus={() => {
          setEditing(true);
          setText(displayQty > 0 ? String(displayQty) : "");
        }}
        onBlur={() => {
          applyStock(text);
          setEditing(false);
          setText("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
          setText(raw);
          applyStock(raw);
        }}
      />
      <span className="unit-qty-input-suffix">{unitName}</span>
    </div>
  );
}

/** Switch + input helper for forms that need both. */
export function UnitQtyField({
  product,
  unitId,
  onUnitIdChange,
  stockQty,
  disabled,
  className,
  onStockQtyChange,
  showSwitch = true,
}: {
  product: Product;
  unitId?: string;
  onUnitIdChange?: (unitId: string) => void;
  stockQty: number;
  disabled?: boolean;
  className?: string;
  onStockQtyChange: (stockQty: number) => void;
  showSwitch?: boolean;
}) {
  const fallback = defaultSellUnit(product) ?? productSellUnits(product)[0];
  const [internalUnitId, setInternalUnitId] = useState(fallback?.id ?? "");

  useEffect(() => {
    setInternalUnitId(fallback?.id ?? "");
  }, [product.id, fallback?.id]);

  const activeId = unitId ?? internalUnitId;
  const setActiveId = onUnitIdChange ?? setInternalUnitId;

  return (
    <div className={cn("unit-qty-field", className)}>
      {showSwitch ? (
        <UnitQtySwitch product={product} unitId={activeId} onUnitIdChange={setActiveId} />
      ) : null}
      <UnitQtyInput
        product={product}
        unitId={activeId}
        stockQty={stockQty}
        disabled={disabled}
        onStockQtyChange={onStockQtyChange}
      />
    </div>
  );
}

export function formatUnitQty(product: Product, unitId: string, stockQty: number) {
  const units = productSellUnits(product);
  const unit = units.find((row) => row.id === unitId) ?? defaultSellUnit(product);
  if (!unit) return `0 ${unitLabel(product.unit)}`;
  const qty = displayQtyFromStock(units, product.unit, unit, stockQty);
  const name = unit.name || unitLabel(unit.symbol || product.unit);
  return `${qty} ${name}`;
}
