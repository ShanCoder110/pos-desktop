import { unitNameFromSymbol } from "@/shared/constants/units";
import type { Product, ProductSellUnit } from "@/shared/types";
import { money } from "@/utils/format";

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatStockQty(n: number) {
    if (!Number.isFinite(n)) return "0";
    if (Number.isInteger(n)) return String(n);
    const t = Math.round(n * 100) / 100;
    return String(t);
}

export function unitLabel(symbol: string) {
  return unitNameFromSymbol(symbol);
}

export function emptyPrices() {
  return { cost: 0, min: 0, wholesale: 0, price: 0 };
}

export function isBiggerSymbol(symbol?: string) {
  return symbol === "pk" || symbol === "box";
}

export function extraKind(symbol?: string): "bigger" | "smaller" {
  return isBiggerSymbol(symbol) ? "bigger" : "smaller";
}

function withManual(row: ProductSellUnit, next: { cost: number; min: number; wholesale: number; price: number }): ProductSellUnit {
  const manual = row.priceManual ?? {};
  return {
    ...row,
    cost: manual.cost ? row.cost : next.cost,
    min: manual.min ? row.min : next.min,
    wholesale: manual.wholesale ? row.wholesale : next.wholesale,
    price: manual.price ? row.price : next.price,
  };
}

export function deriveFromSource(source: ProductSellUnit, contains: number, mode: "multiply" | "divide") {
  if (!contains) return emptyPrices();
  const n = mode === "multiply" ? contains : 1 / contains;
  return {
    cost: roundMoney(source.cost * n),
    min: roundMoney(source.min * n),
    wholesale: roundMoney(source.wholesale * n),
    price: roundMoney(source.price * n),
  };
}

export function baseUnit(units: ProductSellUnit[]) {
  return units.find((u) => u.kind === "base") ?? units.find((u) => u.contains <= 1 && !isBiggerSymbol(u.symbol)) ?? units[0];
}

export function biggerUnit(units: ProductSellUnit[]) {
  return units.find((u) => u.kind === "bigger") ?? units.find((u) => isBiggerSymbol(u.symbol) && u.kind !== "base");
}

export function extraUnits(units: ProductSellUnit[]) {
  return units.filter((u) => u.kind === "bigger" || u.kind === "smaller");
}

export function unitKind(unit: ProductSellUnit): "base" | "bigger" | "smaller" {
  if (unit.kind === "pack") return "bigger";
  if (unit.kind === "small") return "smaller";
  if (unit.kind === "bigger" || unit.kind === "smaller") return unit.kind;
  if (isBiggerSymbol(unit.symbol)) return "bigger";
  return "base";
}

function packSellUnits(product: Product): ProductSellUnit[] {
  const base: ProductSellUnit = {
    id: `${product.id}-u`,
    name: unitLabel(product.unit),
    symbol: product.unit,
    kind: "base",
    contains: 1,
    cost: product.cost,
    min: product.min,
    wholesale: product.wholesale,
    price: product.retail,
    barcode: product.barcode ?? "",
  };
  if (!product.packQty || product.packQty <= 1) return [base];
  return [
    {
      id: `${product.id}-pack`,
      name: "Pack",
      symbol: "pk",
      kind: "bigger",
      contains: product.packQty,
      cost: roundMoney(product.cost * product.packQty),
      min: roundMoney(product.min * product.packQty),
      wholesale: roundMoney(product.wholesale * product.packQty),
      price: product.packPrice || roundMoney(product.retail * product.packQty),
      barcode: "",
    },
    base,
  ];
}

export function productSellUnits(product: Product): ProductSellUnit[] {
  const own = product.sellUnits?.length ? qtyUnits(product.sellUnits) : [];
  if (own.length) return own;
  return qtyUnits(packSellUnits(product));
}

export function qtyUnits(units: ProductSellUnit[]) {
  const bigger = units
    .filter((u) => unitKind(u) === "bigger")
    .sort((a, b) => (b.contains || 1) - (a.contains || 1));
  const base = units.filter((u) => unitKind(u) === "base");
  const smaller = units
    .filter((u) => unitKind(u) === "smaller")
    .sort((a, b) => (a.contains || 1) - (b.contains || 1));
  return [...bigger, ...base, ...smaller];
}

function roundQty(n: number) {
  return Math.round(n * 10000) / 10000;
}

export function toBaseQty(units: ProductSellUnit[], unit: ProductSellUnit, qty: number) {
  const pack = biggerUnit(units);
  const kind = unitKind(unit);
  if (kind === "bigger") return qty * (unit.contains || 1);
  if (kind === "smaller") {
    if (pack && pack.contains && unit.contains) return qty * (pack.contains / unit.contains);
    return qty / (unit.contains || 1);
  }
  return qty;
}

export function unitInStock(units: ProductSellUnit[], stockSymbol: string, unit: ProductSellUnit) {
  if (unit.symbol === stockSymbol) return 1;
  const stockUnit = units.find((u) => u.symbol === stockSymbol) ?? baseUnit(units);
  if (!stockUnit) return 1;
  const perUnit = toBaseQty(units, unit, 1);
  const perStock = toBaseQty(units, stockUnit, 1);
  return perStock ? perUnit / perStock : perUnit;
}

export function partsToStock(units: ProductSellUnit[], stockSymbol: string, parts: Record<string, number>) {
  return roundQty(units.reduce((sum, u) => sum + (parts[u.id] || 0) * unitInStock(units, stockSymbol, u), 0));
}

export function splitStockQty(units: ProductSellUnit[], stockSymbol: string, stockQty: number) {
  const order = qtyUnits(units);
  let left = Math.max(0, stockQty);
  const parts: Record<string, number> = {};
  order.forEach((u, i) => {
    const per = unitInStock(units, stockSymbol, u);
    if (!per) {
      parts[u.id] = 0;
      return;
    }
    if (i === order.length - 1) {
      parts[u.id] = roundQty(left / per);
      left = 0;
      return;
    }
    const n = Math.floor((left + 1e-8) / per);
    parts[u.id] = n;
    left = roundQty(left - n * per);
  });
  for (const u of units) if (parts[u.id] == null) parts[u.id] = 0;
  return parts;
}

export function formatMixedQty(product: Product, stockQty: number) {
  const units = productSellUnits(product);
  const parts = splitStockQty(units, product.unit, stockQty);
  const bits = units
    .map((u) => {
      const n = parts[u.id];
      if (!n) return null;
      return `${formatStockQty(n)} ${u.name || unitLabel(u.symbol || product.unit)}`;
    })
    .filter(Boolean);
  return bits.join(" + ") || `0 ${unitLabel(product.unit)}`;
}

export function stockFromUnitQty(units: ProductSellUnit[], stockSymbol: string, unit: ProductSellUnit, qty: number) {
  return roundQty(qty * unitInStock(units, stockSymbol, unit));
}

export function qtyInUnit(units: ProductSellUnit[], stockSymbol: string, unit: ProductSellUnit, stockQty: number) {
  const per = unitInStock(units, stockSymbol, unit);
  return per ? stockQty / per : stockQty;
}

export function formatLinkedQty(product: Product, stockQty: number) {
  const units = productSellUnits(product);
  const ordered = qtyUnits(units);
  const list = ordered.length ? ordered : units;
  const bits = list.map((u) => {
    const n = qtyInUnit(units, product.unit, u, stockQty);
    return `${formatStockQty(n)} ${u.name || unitLabel(u.symbol || product.unit)}`;
  });
  return bits.join(" = ") || `0 ${unitLabel(product.unit)}`;
}

export function formatLinkedPrice(units: ProductSellUnit[], stockSymbol: string, stockPrice: number) {
  const ordered = qtyUnits(units);
  const list = ordered.length ? ordered : units;
  return list
    .map((u) => `${money(priceFromStock(units, stockSymbol, stockPrice, u))}/${u.name || unitLabel(u.symbol || stockSymbol)}`)
    .join(" = ");
}

export function pricePerStock(units: ProductSellUnit[], stockSymbol: string, price: number, unit: ProductSellUnit) {
  const per = unitInStock(units, stockSymbol, unit);
  return per ? roundMoney(price / per) : roundMoney(price);
}

export function priceFromStock(units: ProductSellUnit[], stockSymbol: string, stockPrice: number, unit: ProductSellUnit) {
  return roundMoney(stockPrice * unitInStock(units, stockSymbol, unit));
}

export function pricesFromStockPrice(
  units: ProductSellUnit[],
  stockSymbol: string,
  stockPrice: number,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const unit of qtyUnits(units)) {
    next[unit.id] = priceFromStock(units, stockSymbol, stockPrice, unit);
  }
  return next;
}

export function cascadeDownPrices(
  units: ProductSellUnit[],
  stockSymbol: string,
  prices: Record<string, number>,
  source: ProductSellUnit,
  price: number,
): Record<string, number> {
  const ordered = qtyUnits(units);
  const index = ordered.findIndex((unit) => unit.id === source.id);
  const next = { ...prices, [source.id]: roundMoney(price) };
  if (index < 0) return next;
  const stockPrice = pricePerStock(units, stockSymbol, price, source);
  for (let i = index + 1; i < ordered.length; i += 1) {
    const unit = ordered[i];
    next[unit.id] = priceFromStock(units, stockSymbol, stockPrice, unit);
  }
  return next;
}

export function stockPriceFromMap(
  units: ProductSellUnit[],
  stockSymbol: string,
  prices: Record<string, number>,
) {
  const stock = units.find((unit) => unit.symbol === stockSymbol) ?? baseUnit(units);
  return stock ? prices[stock.id] ?? 0 : 0;
}

export function applyDerivedPrices(units: ProductSellUnit[], row: ProductSellUnit): ProductSellUnit {
  if (row.kind === "base") return row;
  const base = baseUnit(units);
  if (!base) return row;
  if (row.kind === "bigger") return withManual(row, deriveFromSource(base, row.contains, "multiply"));
  const pack = biggerUnit(units);
  const source = pack ?? base;
  return withManual(row, deriveFromSource(source, row.contains, "divide"));
}

export function deriveAll(units: ProductSellUnit[]) {
  const withBigger = units.map((u) => (u.kind === "bigger" ? applyDerivedPrices(units, u) : u));
  return withBigger.map((u) => applyDerivedPrices(withBigger, u));
}

export function containsLabel(base: ProductSellUnit | undefined, pack: ProductSellUnit | undefined, row: ProductSellUnit) {
  const extraName = row.name || unitLabel(row.symbol || "") || "unit";
  if (row.kind === "bigger") {
    const baseName = base?.name || unitLabel(base?.symbol || "") || "unit";
    return `${baseName} in 1 ${extraName}`;
  }
  const parent = pack ?? base;
  const parentName = parent?.name || unitLabel(parent?.symbol || "") || "unit";
  return `${extraName} in 1 ${parentName}`;
}

export function qtyBreakdown(product: Product, stockQty: number): { id: string; name: string; qty: number }[] {
  const units = productSellUnits(product);
  const list = qtyUnits(units);
  const rows = (list.length ? list : units).map((u) => ({
    id: u.id,
    name: u.name || unitLabel(u.symbol || product.unit),
    qty: qtyInUnit(units, product.unit, u, stockQty),
  }));
  return rows.length ? rows : [{ id: product.id, name: unitLabel(product.unit), qty: stockQty }];
}

export function stockBreakdown(product: Product) {
  return qtyBreakdown(product, product.stock);
}

export function priceBreakdown(product: Product, stockPrice: number): { id: string; name: string; value: number }[] {
  const units = productSellUnits(product);
  const list = qtyUnits(units);
  const rows = (list.length ? list : units).map((u) => ({
    id: u.id,
    name: u.name || unitLabel(u.symbol || product.unit),
    value: priceFromStock(units, product.unit, stockPrice, u),
  }));
  return rows.length ? rows : [{ id: product.id, name: unitLabel(product.unit), value: roundMoney(stockPrice) }];
}
