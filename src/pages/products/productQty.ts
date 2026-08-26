import { units as unitRows } from "@/shared/domain/mock";
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
  return unitRows.find((u) => u.symbol === symbol)?.name ?? symbol;
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

export function productSellUnits(product: Product): ProductSellUnit[] {
  if (product.sellUnits?.length) return product.sellUnits;
  return [
    {
      id: `${product.id}-u`,
      name: unitLabel(product.unit),
      symbol: product.unit,
      kind: "base",
      contains: 1,
      ...emptyPrices(),
      barcode: "",
    },
  ];
}

export function qtyUnits(units: ProductSellUnit[]) {
  const bigger = units.filter((u) => unitKind(u) === "bigger");
  const base = units.filter((u) => unitKind(u) === "base");
  const smaller = units.filter((u) => unitKind(u) === "smaller");
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

function metersPerPack(units: ProductSellUnit[]) {
  const base = baseUnit(units);
  const pack = biggerUnit(units);
  const small =
    units.find((u) => u.kind === "smaller" && (u.symbol === "m" || u.symbol === "gaz")) ??
    units.find((u) => u.kind === "smaller");
  if (pack && base && !isBiggerSymbol(base.symbol) && pack.contains > 1) return pack.contains;
  if (isBiggerSymbol(base?.symbol) && small && small.contains > 1) return small.contains;
  return 0;
}

export function stockBreakdown(product: Product): { name: string; qty: number }[] {
  const units = product.sellUnits?.length
    ? product.sellUnits
    : product.packQty && product.packQty > 1
      ? ([
          { name: unitLabel(product.unit), symbol: product.unit, kind: "base", contains: 1 },
          { name: "Pack", symbol: "pk", kind: "bigger", contains: product.packQty },
        ] as ProductSellUnit[])
      : ([{ name: unitLabel(product.unit), symbol: product.unit, kind: "base", contains: 1 }] as ProductSellUnit[]);
  const base = baseUnit(units);
  const pack = biggerUnit(units);
  const perPack = metersPerPack(units);
  const stockInPack = perPack > 1 ? product.stock / perPack : product.stock;

  const rows = units.map((u) => {
    const name = u.name || unitLabel(u.symbol || product.unit);
    if (u.kind === "bigger" || (isBiggerSymbol(u.symbol) && u.kind === "base" && perPack > 1)) {
      return { name, qty: stockInPack };
    }
    if (u.kind === "base" || u.symbol === product.unit) {
      return { name, qty: product.stock };
    }
    if (pack && u.contains > 0) return { name, qty: stockInPack * u.contains };
    if (u.contains > 0 && base && !isBiggerSymbol(base.symbol)) return { name, qty: product.stock * u.contains };
    return { name, qty: product.stock };
  });
  if (rows.length) return rows;
  return [{ name: unitLabel(product.unit), qty: product.stock }];
}
