import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Field, MoneyInput, SelectInput, TextInput } from "@/components/common";
import { cn } from "@/utils/format";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import type { ProductSellUnit } from "@/shared/types";
import {
  baseUnit,
  biggerUnit,
  cascadeDownPrices,
  displayQtyFromStock,
  formatStockQty,
  priceFromStock,
  pricePerStock,
  pricesFromStockPrice,
  qtyInUnit,
  qtyUnits,
  stockFromDisplayQty,
  stockPriceFromMap,
  unitKind,
  unitLabel,
} from "@/pages/products/productQty";

function numVal(raw: string) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function numStr(n: number) {
  return n ? String(n) : "";
}

function displayQty(n: number) {
  return n ? formatStockQty(n) : "";
}

type QtyField = "received" | "left" | "damaged";

function UnitGrid({
  units,
  children,
}: {
  units: ProductSellUnit[];
  children: (unit: ProductSellUnit) => ReactNode;
}) {
  const ordered = qtyUnits(units);
  return (
    <div
      className="unit-qty-grid [display:grid] [gap:8px_10px]"
      style={{ gridTemplateColumns: `repeat(${Math.max(ordered.length, 1)}, minmax(88px, 1fr))` }}
    >
      {ordered.map((unit) => (
        <div key={unit.id} className="contents">
          {children(unit)}
        </div>
      ))}
    </div>
  );
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="unit-qty [display:grid] [gap:8px]">
      <span className="unit-qty-label [font-size:11px] [font-weight:700] [color:var(--muted)]">
        {label}
      </span>
      <UnitGrid units={units}>
        {(unit) => (
          <Field label={unit.name || unitLabel(unit.symbol || stockSymbol)}>
            <TextInput
              inputMode="decimal"
              maxLength={FIELD_LIMITS.qty}
              placeholder="0"
              readOnly={disabled}
              value={
                editingId === unit.id
                  ? draft
                  : displayQty(displayQtyFromStock(units, stockSymbol, unit, value))
              }
              onFocus={() => {
                setEditingId(unit.id);
                setDraft(displayQty(displayQtyFromStock(units, stockSymbol, unit, value)));
              }}
              onBlur={() => setEditingId(null)}
              onChange={(event) => {
                const raw = event.target.value;
                setDraft(raw);
                onChange?.(stockFromDisplayQty(units, stockSymbol, unit, numVal(raw)));
              }}
            />
          </Field>
        )}
      </UnitGrid>
    </div>
  );
}

type UnitPriceKey = "cost" | "min" | "wholesale" | "price";

const UNIT_PRICE_FIELDS: { key: UnitPriceKey; label: string }[] = [
  { key: "cost", label: "Cost" },
  { key: "min", label: "Min" },
  { key: "wholesale", label: "Wholesale" },
  { key: "price", label: "Retail" },
];

export function LotUnitLines({
  units,
  stockSymbol,
  received,
  left,
  damaged,
  showLeft,
  showQuantity = true,
  showPricing = true,
  onReceived,
  onLeft,
  onDamaged,
  onUnitPrice,
}: {
  units: ProductSellUnit[];
  stockSymbol: string;
  received: number;
  left: number;
  damaged: number;
  showLeft?: boolean;
  showQuantity?: boolean;
  showPricing?: boolean;
  onReceived?: (qty: number) => void;
  onLeft?: (qty: number) => void;
  onDamaged?: (qty: number) => void;
  onUnitPrice?: (unitId: string, key: UnitPriceKey, value: number) => void;
}) {
  const ordered = qtyUnits(units);
  const [qtyEdit, setQtyEdit] = useState<{ id: string; field: QtyField } | null>(null);
  const [qtyDraft, setQtyDraft] = useState("");

  function qtyValue(field: QtyField, unit: ProductSellUnit) {
    const stock = field === "received" ? received : field === "left" ? left : damaged;
    if (qtyEdit?.id === unit.id && qtyEdit.field === field) return qtyDraft;
    return displayQty(displayQtyFromStock(units, stockSymbol, unit, stock));
  }

  function setQty(field: QtyField, unit: ProductSellUnit, raw: string) {
    setQtyDraft(raw);
    const stock = stockFromDisplayQty(units, stockSymbol, unit, numVal(raw));
    if (field === "received") onReceived?.(stock);
    else if (field === "left") onLeft?.(stock);
    else onDamaged?.(stock);
  }

  return (
    <div className="product-small-list grid gap-2.5">
      {ordered.map((unit) => (
        <div
          key={unit.id}
          className={
            unitKind(unit) === "base"
              ? "product-small-card is-base relative grid gap-2 rounded-[10px] border border-line bg-paper p-2.5"
              : "product-small-card relative grid gap-2 rounded-[10px] border border-line bg-paper p-2.5"
          }
        >
          <div className="flex items-center justify-between gap-2">
            <strong className="text-[12px] font-bold text-ink">
              {unit.name || unitLabel(unit.symbol || stockSymbol)}
            </strong>
            <span className="text-[10px] text-muted">
              {unitKind(unit) === "base"
                ? "Product unit"
                : unitKind(unit) === "smaller" && unit.contains > 1
                  ? `1 ${unitLabel(stockSymbol)} = ${formatStockQty(unit.contains)} ${unit.name || unitLabel(unit.symbol || "")}`
                  : unit.contains > 1
                    ? `1 ${unit.name || unitLabel(unit.symbol || "")} = ${formatStockQty(unit.contains)} ${unitLabel(stockSymbol)}`
                    : "Sell as"}
            </span>
          </div>
          {showQuantity ? (
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${showLeft ? 3 : 2}, minmax(0, 1fr))`,
              }}
            >
              <Field label="Qty">
                <TextInput
                  inputMode="decimal"
                  maxLength={FIELD_LIMITS.qty}
                  placeholder="0"
                  value={qtyValue("received", unit)}
                  onFocus={() => {
                    setQtyEdit({ id: unit.id, field: "received" });
                    setQtyDraft(displayQty(qtyInUnit(units, stockSymbol, unit, received)));
                  }}
                  onBlur={() => setQtyEdit(null)}
                  onChange={(event) => setQty("received", unit, event.target.value)}
                />
              </Field>
              {showLeft ? (
                <Field label="Left">
                  <TextInput
                    inputMode="decimal"
                    maxLength={FIELD_LIMITS.qty}
                    placeholder="0"
                    value={qtyValue("left", unit)}
                    onFocus={() => {
                      setQtyEdit({ id: unit.id, field: "left" });
                      setQtyDraft(displayQty(qtyInUnit(units, stockSymbol, unit, left)));
                    }}
                    onBlur={() => setQtyEdit(null)}
                    onChange={(event) => setQty("left", unit, event.target.value)}
                  />
                </Field>
              ) : null}
              <Field label="Damaged">
                <TextInput
                  inputMode="decimal"
                  maxLength={FIELD_LIMITS.qty}
                  placeholder="0"
                  value={qtyValue("damaged", unit)}
                  onFocus={() => {
                    setQtyEdit({ id: unit.id, field: "damaged" });
                    setQtyDraft(displayQty(qtyInUnit(units, stockSymbol, unit, damaged)));
                  }}
                  onBlur={() => setQtyEdit(null)}
                  onChange={(event) => setQty("damaged", unit, event.target.value)}
                />
              </Field>
            </div>
          ) : null}
          {showPricing ? (
            <div className="product-small-prices grid grid-cols-2 gap-2">
              {UNIT_PRICE_FIELDS.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  className={cn(
                    "product-price-field",
                    field.key === "price" ? "is-retail" : `is-${field.key}`,
                  )}
                >
                  <MoneyInput
                    placeholder="0.00"
                    value={numStr(unit[field.key])}
                    onChange={(event) =>
                      onUnitPrice?.(unit.id, field.key, numVal(event.target.value))
                    }
                  />
                </Field>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function UnitPriceFields({
  label,
  units,
  stockSymbol,
  value,
  sourceKey,
  onChange,
}: {
  label: string;
  units: ProductSellUnit[];
  stockSymbol: string;
  value: number;
  sourceKey?: string;
  onChange: (stockPrice: number) => void;
}) {
  const ordered = qtyUnits(units);
  const unitKey = ordered.map((unit) => `${unit.id}:${unit.contains}`).join("|");
  const [prices, setPrices] = useState(() => pricesFromStockPrice(units, stockSymbol, value));

  useEffect(() => {
    setPrices(pricesFromStockPrice(units, stockSymbol, value));
  }, [sourceKey, unitKey]);

  return (
    <div className="unit-qty [display:grid] [gap:8px]">
      <span className="unit-qty-label [font-size:11px] [font-weight:700] [color:var(--muted)]">
        {label}
      </span>
      <UnitGrid units={units}>
        {(unit) => (
          <Field label={unit.name || unitLabel(unit.symbol || stockSymbol)}>
            <MoneyInput
              placeholder="0.00"
              value={numStr(prices[unit.id] ?? 0)}
              onChange={(event) => {
                const next = cascadeDownPrices(
                  units,
                  stockSymbol,
                  prices,
                  unit,
                  numVal(event.target.value),
                );
                setPrices(next);
                onChange(stockPriceFromMap(units, stockSymbol, next));
              }}
            />
          </Field>
        )}
      </UnitGrid>
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
      <span className="unit-qty-label [font-size:11px] [font-weight:700] [color:var(--muted)]">
        {label}
      </span>
      <div className="unit-qty-grid [display:grid] [grid-template-columns:repeat(auto-fit,_minmax(110px,_1fr))] [gap:8px_10px]">
        {ordered.map((u) => (
          <Field key={u.id} label={u.name || unitLabel(u.symbol || stockSymbol)}>
            {asPrice ? (
              <MoneyInput
                disabled
                value={String(priceFromStock(units, stockSymbol, stockPrice, u))}
              />
            ) : (
              <TextInput
                disabled
                value={formatStockQty(qtyInUnit(units, stockSymbol, u, stockQty ?? 0))}
              />
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
