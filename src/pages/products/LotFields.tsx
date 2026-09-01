import { useEffect, useMemo, useRef, useState } from "react";
import { Field, MoneyInput, SelectInput, TextInput } from "@/components/common";
import type { ProductSellUnit } from "@/shared/types";
import {
  baseUnit,
  biggerUnit,
  formatStockQty,
  partsToStock,
  priceFromStock,
  pricePerStock,
  qtyInUnit,
  qtyUnits,
  splitStockQty,
  unitLabel,
} from "@/pages/products/productQty";

function numVal(raw: string) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function numStr(n: number) {
  return n ? String(n) : "";
}

export function UnitQtyFields({
  label,
  units,
  stockSymbol,
  value,
  onChange,
  disabled,
}: {
  label: string;
  units: ProductSellUnit[];
  stockSymbol: string;
  value: number;
  onChange?: (stockQty: number) => void;
  disabled?: boolean;
}) {
  const ordered = qtyUnits(units);
  const key = `${stockSymbol}:${ordered.map((u) => `${u.id}:${u.contains}`).join()}`;
  const [parts, setParts] = useState(() => splitStockQty(units, stockSymbol, value));
  const partsRef = useRef(parts);
  const editing = useRef(false);
  partsRef.current = parts;

  useEffect(() => {
    if (editing.current) return;
    const current = partsToStock(units, stockSymbol, partsRef.current);
    if (Math.abs(current - value) < 1e-6) return;
    setParts(splitStockQty(units, stockSymbol, value));
  }, [key, value, stockSymbol]);

  function setPart(id: string, n: number) {
    const next = { ...partsRef.current, [id]: n };
    partsRef.current = next;
    setParts(next);
    onChange?.(partsToStock(units, stockSymbol, next));
  }

  return (
    <div className="unit-qty [display:grid] [gap:8px]">
      <span className="unit-qty-label [font-size:11px] [font-weight:700] [color:var(--muted)]">{label}</span>
      <div className="unit-qty-grid [display:grid] [grid-template-columns:repeat(auto-fit,_minmax(110px,_1fr))] [gap:8px_10px]">
        {ordered.map((u) => (
          <Field key={u.id} label={u.name || unitLabel(u.symbol || stockSymbol)}>
            <TextInput
              inputMode="decimal"
              placeholder="0"
              readOnly={disabled}
              value={numStr(parts[u.id] ?? 0)}
              onFocus={() => {
                editing.current = true;
              }}
              onBlur={() => {
                editing.current = false;
                setParts(splitStockQty(units, stockSymbol, partsToStock(units, stockSymbol, partsRef.current)));
              }}
              onChange={(e) => setPart(u.id, numVal(e.target.value))}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

export function LinkedUnitBoxes({
  label,
  units,
  stockSymbol,
  stockQty,
  stockPrice,
}: {
  label: string;
  units: ProductSellUnit[];
  stockSymbol: string;
  stockQty?: number;
  stockPrice?: number;
}) {
  const ordered = qtyUnits(units).length ? qtyUnits(units) : units;
  const asPrice = stockPrice != null;
  return (
    <div className="unit-qty [display:grid] [gap:8px]">
      <span className="unit-qty-label [font-size:11px] [font-weight:700] [color:var(--muted)]">{label}</span>
      <div className="unit-qty-grid [display:grid] [grid-template-columns:repeat(auto-fit,_minmax(110px,_1fr))] [gap:8px_10px]">
        {ordered.map((u) => (
          <Field key={u.id} label={u.name || unitLabel(u.symbol || stockSymbol)}>
            {asPrice ? (
              <MoneyInput disabled value={String(priceFromStock(units, stockSymbol, stockPrice, u))} />
            ) : (
              <TextInput disabled value={formatStockQty(qtyInUnit(units, stockSymbol, u, stockQty ?? 0))} />
            )}
          </Field>
        ))}
      </div>
    </div>
  );
}

export function LotCostField({
  units,
  stockSymbol,
  value,
  onChange,
}: {
  units: ProductSellUnit[];
  stockSymbol: string;
  value: number;
  onChange: (stockPrice: number) => void;
}) {
  const ordered = units;
  const fallback = biggerUnit(units) ?? baseUnit(units) ?? ordered[0];
  const [unitId, setUnitId] = useState(fallback?.id ?? "");
  const unit = useMemo(
    () => ordered.find((u) => u.id === unitId) ?? fallback,
    [ordered, unitId, fallback],
  );
  const display = unit ? priceFromStock(units, stockSymbol, value, unit) : value;

  useEffect(() => {
    if (!ordered.some((u) => u.id === unitId) && fallback) setUnitId(fallback.id);
  }, [ordered, unitId, fallback]);

  return (
    <div className="product-lot-price [display:grid] [gap:8px] [grid-template-columns:repeat(auto-fit,_minmax(110px,_1fr))] [gap:8px_10px]">
      <Field label="Lot cost">
        <MoneyInput
          placeholder="0.00"
          value={numStr(display)}
          onChange={(e) => {
            if (!unit) {
              onChange(numVal(e.target.value));
              return;
            }
            onChange(pricePerStock(units, stockSymbol, numVal(e.target.value), unit));
          }}
        />
      </Field>
      {ordered.length > 1 ? (
        <Field label="Per">
          <SelectInput value={unit?.id ?? ""} onChange={(e) => setUnitId(e.target.value)}>
            {ordered.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || unitLabel(u.symbol || stockSymbol)}
              </option>
            ))}
          </SelectInput>
        </Field>
      ) : null}
    </div>
  );
}
