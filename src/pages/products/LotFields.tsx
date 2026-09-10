import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Field, MoneyInput, SelectInput, TextInput } from "@/components/common";
import type { ProductSellUnit } from "@/shared/types";
import {
  baseUnit,
  biggerUnit,
  cascadeDownPrices,
  formatStockQty,
  priceFromStock,
  pricePerStock,
  pricesFromStockPrice,
  qtyInUnit,
  qtyUnits,
  stockFromUnitQty,
  stockPriceFromMap,
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

type PriceKind = "cost" | "min" | "wholesale" | "retail";
type PriceMaps = Record<PriceKind, Record<string, number>>;
type QtyField = "received" | "left" | "damaged";

const PRICE_FIELDS: { key: PriceKind; label: string }[] = [
  { key: "cost", label: "Cost" },
  { key: "min", label: "Min" },
  { key: "wholesale", label: "Wholesale" },
  { key: "retail", label: "Retail" },
];

function emptyPriceMaps(): PriceMaps {
  return { cost: {}, min: {}, wholesale: {}, retail: {} };
}

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
      <span className="unit-qty-label [font-size:11px] [font-weight:700] [color:var(--muted)]">{label}</span>
      <UnitGrid units={units}>
        {(unit) => (
          <Field label={unit.name || unitLabel(unit.symbol || stockSymbol)}>
            <TextInput
              inputMode="decimal"
              placeholder="0"
              readOnly={disabled}
              value={
                editingId === unit.id ? draft : displayQty(qtyInUnit(units, stockSymbol, unit, value))
              }
              onFocus={() => {
                setEditingId(unit.id);
                setDraft(displayQty(qtyInUnit(units, stockSymbol, unit, value)));
              }}
              onBlur={() => setEditingId(null)}
              onChange={(event) => {
                const raw = event.target.value;
                setDraft(raw);
                onChange?.(stockFromUnitQty(units, stockSymbol, unit, numVal(raw)));
              }}
            />
          </Field>
        )}
      </UnitGrid>
    </div>
  );
}

export function LotUnitLines({
  units,
  stockSymbol,
  seedKey,
  received,
  left,
  damaged,
  showLeft,
  onReceived,
  onLeft,
  onDamaged,
  cost,
  min,
  wholesale,
  retail,
  onCost,
  onMin,
  onWholesale,
  onRetail,
}: {
  units: ProductSellUnit[];
  stockSymbol: string;
  seedKey: string;
  received: number;
  left: number;
  damaged: number;
  showLeft?: boolean;
  onReceived: (qty: number) => void;
  onLeft?: (qty: number) => void;
  onDamaged: (qty: number) => void;
  cost: number;
  min: number;
  wholesale: number;
  retail: number;
  onCost: (price: number) => void;
  onMin: (price: number) => void;
  onWholesale: (price: number) => void;
  onRetail: (price: number) => void;
}) {
  const ordered = qtyUnits(units);
  const unitKey = ordered.map((unit) => `${unit.id}:${unit.contains}`).join("|");
  const [maps, setMaps] = useState<PriceMaps>(emptyPriceMaps);
  const [qtyEdit, setQtyEdit] = useState<{ id: string; field: QtyField } | null>(null);
  const [qtyDraft, setQtyDraft] = useState("");

  useEffect(() => {
    setMaps({
      cost: pricesFromStockPrice(units, stockSymbol, cost),
      min: pricesFromStockPrice(units, stockSymbol, min),
      wholesale: pricesFromStockPrice(units, stockSymbol, wholesale),
      retail: pricesFromStockPrice(units, stockSymbol, retail),
    });
  }, [seedKey, unitKey]);

  function qtyValue(field: QtyField, unit: ProductSellUnit) {
    const stock = field === "received" ? received : field === "left" ? left : damaged;
    if (qtyEdit?.id === unit.id && qtyEdit.field === field) return qtyDraft;
    return displayQty(qtyInUnit(units, stockSymbol, unit, stock));
  }

  function setQty(field: QtyField, unit: ProductSellUnit, raw: string) {
    setQtyDraft(raw);
    const stock = stockFromUnitQty(units, stockSymbol, unit, numVal(raw));
    if (field === "received") onReceived(stock);
    else if (field === "left") onLeft?.(stock);
    else onDamaged(stock);
  }

  function setPrice(kind: PriceKind, unit: ProductSellUnit, raw: string) {
    const nextKind = cascadeDownPrices(units, stockSymbol, maps[kind], unit, numVal(raw));
    setMaps((current) => ({ ...current, [kind]: nextKind }));
    const persist = { cost: onCost, min: onMin, wholesale: onWholesale, retail: onRetail }[kind];
    persist(stockPriceFromMap(units, stockSymbol, nextKind));
  }

  return (
    <div className="grid gap-3">
      {ordered.map((unit) => (
        <div key={unit.id} className="grid gap-2 rounded-xl border border-line bg-[#f8fafc] p-3">
          <strong className="text-[12px] font-bold text-ink">
            {unit.name || unitLabel(unit.symbol || stockSymbol)}
          </strong>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${showLeft ? 3 : 2}, minmax(88px, 1fr))` }}
          >
            <Field label="Received">
              <TextInput
                inputMode="decimal"
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRICE_FIELDS.map((field) => (
              <Field key={field.key} label={field.label}>
                <MoneyInput
                  placeholder="0.00"
                  value={numStr(maps[field.key][unit.id] ?? 0)}
                  onChange={(event) => setPrice(field.key, unit, event.target.value)}
                />
              </Field>
            ))}
          </div>
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
      <span className="unit-qty-label [font-size:11px] [font-weight:700] [color:var(--muted)]">{label}</span>
      <UnitGrid units={units}>
        {(unit) => (
          <Field label={unit.name || unitLabel(unit.symbol || stockSymbol)}>
            <MoneyInput
              placeholder="0.00"
              value={numStr(prices[unit.id] ?? 0)}
              onChange={(event) => {
                const next = cascadeDownPrices(units, stockSymbol, prices, unit, numVal(event.target.value));
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
