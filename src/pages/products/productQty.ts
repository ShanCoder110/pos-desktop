import { symbolFromUnitName, unitNameFromSymbol } from "@/shared/constants/units";
import type { Product, ProductSellUnit } from "@/shared/types";
import { money } from "@/utils/format";
import { profitMarginPercent } from "@/utils/margin";
import { displayedToStockQuantity, stockQuantityPerUnit } from "@/utils/unitConversion";

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatStockQty(n: number) {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/** Whole stock units + optional decimal tail for split display (10 + .89 Roll). */
export function splitStockUnitDisplay(stockQty: number) {
  const rounded = Math.round(stockQty * 100) / 100;
  const whole = Math.floor(rounded + 1e-8);
  const fraction = Math.round((rounded - whole) * 100) / 100;
  return {
    whole,
    fraction: fraction > 1e-6 ? fraction : null,
    fractionText:
      fraction > 1e-6
        ? fraction.toFixed(2).replace(/^0\./, ".").replace(/0+$/, "").replace(/\.$/, "")
        : null,
  };
}

/** Signed stock change for branch rebalance previews (+1 / −1). */
export function signedStockQty(n: number) {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-6) return "";
  const abs = formatStockQty(Math.abs(n));
  return n > 0 ? `+${abs}` : `−${abs}`;
}

export function unitLabel(symbol: string) {
  return unitNameFromSymbol(symbol);
}

export function emptyPrices() {
  return { cost: 0, min: 0, wholesale: 0, price: 0 };
}

/** Length (and similar) symbols are usually subdivisions of a pack/roll — not aggregations. */
const SUBDIVISION_SYMBOLS = new Set(["m", "gaz", "ft", "g"]);

export function isSubdivisionSymbol(symbol?: string) {
  const s = symbol?.trim().toLowerCase();
  return !!s && SUBDIVISION_SYMBOLS.has(s);
}

export function isBiggerSymbol(symbol?: string) {
  const s = symbol?.trim().toLowerCase();
  if (!s) return false;
  if (SUBDIVISION_SYMBOLS.has(s)) return false;
  return true;
}

export function extraKind(symbol?: string): "bigger" | "smaller" {
  return isBiggerSymbol(symbol) ? "bigger" : "smaller";
}

/** Empty row for "+ Add unit" — user picks the unit and types the factor. */
export function suggestedExtraUnit(_units: ProductSellUnit[]): ProductSellUnit {
  return {
    id: crypto.randomUUID(),
    name: "",
    symbol: "",
    kind: "bigger",
    contains: 0,
    factorDirection: "multiply",
    ...emptyPrices(),
    barcode: "",
    priceManual: {},
    isBase: false,
    isDefault: false,
  };
}

/** Stored contains. Subdivision rows store "how many of me in 1 stock unit" (90 gaz in 1 roll). */
export function conversionFactor(unit: ProductSellUnit): number {
  return unit.contains > 0 ? unit.contains : 1;
}

/** How many stock units one of this sell unit equals. 1 gaz = 1/90 roll; 1 pack = 12 pieces. */
export function inventoryPerSellUnit(unit: ProductSellUnit): number {
  if (!unit.factorDirection && conversionFactor(unit) > 1 && isSubdivisionSymbol(unit.symbol)) {
    return 1 / conversionFactor(unit);
  }
  return stockQuantityPerUnit(unit);
}

/** Inventory / accounting anchor — smallest conversion factor (usually 1). */
export function canonicalUnit(units: ProductSellUnit[]): ProductSellUnit | undefined {
  if (!units.length) return undefined;
  return (
    units.find((unit) => unit.isBase) ??
    units.find((unit) => Math.abs(inventoryPerSellUnit(unit) - 1) < 1e-9) ??
    [...units].sort((left, right) => inventoryPerSellUnit(left) - inventoryPerSellUnit(right))[0]
  );
}

/**
 * UI preferred / default unit (Details + "Base unit" badge).
 * Independent of conversion factors — changing this must not rewrite prices or contains.
 */
export function preferredUnit(units: ProductSellUnit[]): ProductSellUnit | undefined {
  return (
    units.find((u) => u.isDefault) ??
    units.find((u) => u.isBase || u.kind === "base") ??
    canonicalUnit(units)
  );
}

export function baseUnit(units: ProductSellUnit[]) {
  return canonicalUnit(units);
}

/**
 * Normalize API/draft rows so `contains` is always relative to the smallest unit (= 1),
 * and `isBase` marks the UI preferred unit (not necessarily the inventory unit).
 */
export function normalizeSellUnits(units: ProductSellUnit[]): ProductSellUnit[] {
  if (!units.length) return units;
  const enriched = units.map((u) => ({
    ...emptyPrices(),
    ...u,
    barcode: u.barcode ?? "",
    priceManual: u.priceManual ?? {},
    contains: Number.isFinite(u.contains) ? u.contains : 0,
  }));
  const min = Math.min(...enriched.map((u) => conversionFactor(u)));
  const hasStockUnit = enriched.some((unit) => Math.abs(conversionFactor(unit) - 1) < 1e-6);
  const scale = hasStockUnit ? 1 : min > 0 ? min : 1;
  const inventoryId =
    enriched.find((unit) => unit.isBase)?.id ??
    enriched.find((unit) => Math.abs(inventoryPerSellUnit(unit) - 1) < 1e-9)?.id ??
    enriched.find((u) => Math.abs(conversionFactor(u) - scale) < 1e-9)?.id ??
    enriched[0]?.id;
  const preferredId = enriched.find((u) => u.isDefault)?.id ?? inventoryId;

  return enriched.map((u) => {
    const isInventory = u.id === inventoryId;
    const isPreferred = u.id === preferredId;
    const contains = isInventory
      ? 1
      : u.contains > 0
        ? roundStockQty(conversionFactor(u) / scale)
        : 0;
    return {
      ...u,
      contains,
      isBase: isInventory,
      isDefault: isPreferred,
      kind: (isInventory
        ? "base"
        : contains <= 0
          ? (u.kind ?? "bigger")
          : inventoryPerSellUnit({ ...u, contains }) > 1
            ? "bigger"
            : "smaller") as ProductSellUnit["kind"],
    };
  });
}

function withManual(
  row: ProductSellUnit,
  next: { cost: number; min: number; wholesale: number; price: number },
): ProductSellUnit {
  const manual = row.priceManual ?? {};
  return {
    ...row,
    cost: manual.cost ? row.cost : next.cost,
    min: manual.min ? row.min : next.min,
    wholesale: manual.wholesale ? row.wholesale : next.wholesale,
    price: manual.price ? row.price : next.price,
  };
}

export function deriveFromSource(
  source: ProductSellUnit,
  contains: number,
  mode: "multiply" | "divide",
) {
  if (!contains) return emptyPrices();
  const n = mode === "multiply" ? contains : 1 / contains;
  return {
    cost: roundMoney(source.cost * n),
    min: roundMoney(source.min * n),
    wholesale: roundMoney(source.wholesale * n),
    price: roundMoney(source.price * n),
  };
}

/** Scale prices between two units. 1 gaz = stock price / 90, 1 pack = piece price × 12. */
export function derivePricesBetween(source: ProductSellUnit, target: ProductSellUnit) {
  const from = inventoryPerSellUnit(source);
  const to = inventoryPerSellUnit(target);
  if (!from) return emptyPrices();
  const n = to / from;
  return {
    cost: roundMoney(source.cost * n),
    min: roundMoney(source.min * n),
    wholesale: roundMoney(source.wholesale * n),
    price: roundMoney(source.price * n),
  };
}

/** Stock / POS unit symbols that are sold by length (meter, gaz, foot). */
export function isLinearStockUnit(symbol?: string) {
  const unit = symbol?.trim().toLowerCase();
  return unit === "m" || unit === "gaz" || unit === "ft";
}

/** Cost and retail for margin — preferred UI base when set, else canonical. */
export function productBasePricing(
  product: Pick<Product, "cost" | "retail" | "unit" | "sellUnits">,
) {
  const units = product.sellUnits?.length ? qtyUnits(product.sellUnits) : [];
  if (units.length) {
    const base = preferredUnit(units) ?? canonicalUnit(units) ?? units[0];
    return { cost: base.cost, retail: base.price };
  }
  return { cost: product.cost, retail: product.retail };
}

export function productUnitProfit(
  product: Pick<Product, "cost" | "retail" | "unit" | "sellUnits">,
) {
  const { cost, retail } = productBasePricing(product);
  return retail - cost;
}

export function productMarginPct(product: Pick<Product, "cost" | "retail" | "unit" | "sellUnits">) {
  const { cost, retail } = productBasePricing(product);
  return profitMarginPercent(retail, cost);
}

export function biggerUnit(units: ProductSellUnit[]) {
  const extras = units
    .filter((u) => {
      const preferred = preferredUnit(units);
      return preferred?.id !== u.id && inventoryPerSellUnit(u) > 1;
    })
    .sort((a, b) => conversionFactor(b) - conversionFactor(a));
  return extras[0];
}

export function extraUnits(units: ProductSellUnit[]) {
  const preferred = preferredUnit(units);
  return units.filter((u) => u.id !== preferred?.id);
}

export function unitKind(unit: ProductSellUnit): "base" | "bigger" | "smaller" {
  if (unit.isBase || unit.kind === "base") return "base";
  if (isSubdivisionSymbol(unit.symbol) && unit.contains > 1) return "smaller";
  if (unit.kind === "pack" || unit.kind === "bigger") return "bigger";
  if (unit.kind === "small" || unit.kind === "smaller") return "smaller";
  if (conversionFactor(unit) > 1) return "bigger";
  if (conversionFactor(unit) > 0 && conversionFactor(unit) < 1) return "smaller";
  return "bigger";
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
    isBase: true,
    isDefault: true,
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
      isBase: false,
      isDefault: false,
    },
    base,
  ];
}

export function productSellUnits(product: Product): ProductSellUnit[] {
  const own = product.sellUnits?.length ? qtyUnits(normalizeSellUnits(product.sellUnits)) : [];
  if (own.length) return own;
  return qtyUnits(packSellUnits(product));
}

/** Display order: biggest → smallest by how much stock one unit represents. */
export function qtyUnits(units: ProductSellUnit[]) {
  return [...units].sort((a, b) => inventoryPerSellUnit(b) - inventoryPerSellUnit(a));
}

export function roundStockQty(n: number) {
  return Math.round(n * 10000) / 10000;
}

function roundQty(n: number) {
  return roundStockQty(n);
}

/** Qty of `unit` → canonical inventory qty. */
export function toBaseQty(units: ProductSellUnit[], unit: ProductSellUnit, qty: number) {
  void units;
  return displayedToStockQuantity(unit, qty);
}

export function unitConversionToBase(units: ProductSellUnit[], unit: ProductSellUnit): number {
  void units;
  return inventoryPerSellUnit(unit);
}

/** @deprecated Base change must not rescale qty — kept as no-op identity for callers. */
export function scaleQtyForBaseChange(qty: number, _factor: number) {
  return qty;
}

export function unitInStock(units: ProductSellUnit[], stockSymbol: string, unit: ProductSellUnit) {
  if (unit.symbol === stockSymbol) return 1;
  const stockUnit =
    units.find((u) => u.symbol === stockSymbol) ?? canonicalUnit(units) ?? preferredUnit(units);
  if (!stockUnit) return inventoryPerSellUnit(unit);
  const perStock = inventoryPerSellUnit(stockUnit);
  return perStock ? inventoryPerSellUnit(unit) / perStock : inventoryPerSellUnit(unit);
}

export function partsToStock(
  units: ProductSellUnit[],
  stockSymbol: string,
  parts: Record<string, number>,
) {
  return roundQty(
    units.reduce((sum, u) => sum + (parts[u.id] || 0) * unitInStock(units, stockSymbol, u), 0),
  );
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

/** Whole packs + remainder pieces, e.g. `8 Pack + 7 Piece`. */
export function formatMixedQtyFromUnits(
  units: ProductSellUnit[],
  stockSymbol: string,
  stockQty: number,
) {
  const parts = splitStockQty(units, stockSymbol, stockQty);
  const bits = qtyUnits(units)
    .map((u) => {
      const n = parts[u.id];
      if (!n) return null;
      return `${formatStockQty(n)} ${u.name || unitLabel(u.symbol || stockSymbol)}`;
    })
    .filter(Boolean);
  return bits.join(" + ") || `0 ${unitLabel(stockSymbol)}`;
}

export function formatMixedQty(product: Product, stockQty: number) {
  return formatMixedQtyFromUnits(productSellUnits(product), product.unit, stockQty);
}

export function stockFromUnitQty(
  units: ProductSellUnit[],
  stockSymbol: string,
  unit: ProductSellUnit,
  qty: number,
) {
  return roundQty(qty * unitInStock(units, stockSymbol, unit));
}

/** Stock qty from a typed display amount — keeps extra precision for sub-unit round-trips. */
export function stockFromDisplayQty(
  units: ProductSellUnit[],
  stockSymbol: string,
  unit: ProductSellUnit,
  displayQty: number,
) {
  if (!displayQty) return 0;
  const stock = displayQty * unitInStock(units, stockSymbol, unit);
  return Math.round(stock * 1_000_000) / 1_000_000;
}

export function qtyInUnit(
  units: ProductSellUnit[],
  stockSymbol: string,
  unit: ProductSellUnit,
  stockQty: number,
) {
  const per = unitInStock(units, stockSymbol, unit);
  return per ? stockQty / per : stockQty;
}

/** Display qty for inputs — snaps near-whole numbers (e.g. 2.997 → 3 Gaz). */
export function displayQtyFromStock(
  units: ProductSellUnit[],
  stockSymbol: string,
  unit: ProductSellUnit,
  stockQty: number,
) {
  if (!stockQty) return 0;
  const raw = qtyInUnit(units, stockSymbol, unit, stockQty);
  const rounded = roundStockQty(raw);
  const nearest = Math.round(rounded);
  if (Math.abs(rounded - nearest) < 0.051) return nearest;
  return rounded;
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

export function formatLinkedPrice(
  units: ProductSellUnit[],
  stockSymbol: string,
  stockPrice: number,
) {
  const ordered = qtyUnits(units);
  const list = ordered.length ? ordered : units;
  return list
    .map(
      (u) =>
        `${money(priceFromStock(units, stockSymbol, stockPrice, u))}/${u.name || unitLabel(u.symbol || stockSymbol)}`,
    )
    .join(" = ");
}

export function pricePerStock(
  units: ProductSellUnit[],
  stockSymbol: string,
  price: number,
  unit: ProductSellUnit,
) {
  const per = unitInStock(units, stockSymbol, unit);
  return per ? roundMoney(price / per) : roundMoney(price);
}

export function priceFromStock(
  units: ProductSellUnit[],
  stockSymbol: string,
  stockPrice: number,
  unit: ProductSellUnit,
) {
  return roundMoney(stockPrice * unitInStock(units, stockSymbol, unit));
}

/**
 * Pick the stock-unit cost from priced sell units. When the user types cost in
 * Gaz (56) but Roll still shows 5000, prefer the smaller-unit entry so 1 Roll
 * saves as 5040 — not 5000 with Gaz derived as 55.56.
 */
export function resolveStockUnitCost(
  units: ProductSellUnit[],
  stockSymbol: string,
  fallback = 0,
): number {
  const ordered = qtyUnits(units);
  const stock = units.find((unit) => unit.symbol === stockSymbol) ?? baseUnit(units);
  if (!stock) return fallback;

  const manual = ordered.filter((unit) => unit.priceManual?.cost && unit.cost > 0);
  if (manual.length) {
    const source = manual.find((unit) => unit.symbol !== stockSymbol) ?? manual[manual.length - 1];
    return pricePerStock(units, stockSymbol, source.cost, source);
  }

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const unit = ordered[index];
    if (unit.symbol === stockSymbol || unit.cost <= 0) continue;
    const implied = pricePerStock(units, stockSymbol, unit.cost, unit);
    if (Math.abs(implied - stock.cost) > 0.015) return implied;
  }

  return stock.cost > 0 ? stock.cost : fallback;
}

/**
 * Lot FIFO cost is stored per stock unit (Roll). If the saved number is clearly
 * a smaller-unit price (Gaz), convert with the same ratio as qty (1 Roll = 90 Gaz).
 */
export function lotCostInStockUnit(product: Product, storedCost: number) {
  if (!(storedCost > 0)) return storedCost;
  const stockQtyOne = qtyBreakdown(product, 1).filter((row) => row.qty > 0);
  const smaller = stockQtyOne.find((row) => row.qty > 1.01);
  const factor = smaller?.qty ?? 0;
  if (factor <= 1.01) return storedCost;
  const stockSell = Math.max(product.min ?? 0, product.retail ?? 0);
  if (stockSell <= 0) return storedCost;
  if (storedCost >= stockSell * 0.4) return storedCost;
  return roundMoney(storedCost * factor);
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
  return stock ? (prices[stock.id] ?? 0) : 0;
}

export type UnitPriceKey = "cost" | "min" | "wholesale" | "price";

export function proportionalPriceParentName(
  units: ProductSellUnit[],
  unit: ProductSellUnit,
): string {
  const source = preferredUnit(units) ?? canonicalUnit(units);
  if (!source || source.id === unit.id) {
    const canon = canonicalUnit(units);
    return canon?.name || unitLabel(canon?.symbol ?? "") || "product unit";
  }
  return source.name || unitLabel(source.symbol ?? "") || "product unit";
}

/** Minimum allowed price for a derived unit (same math as auto-fill). */
export function proportionalUnitPrice(
  units: ProductSellUnit[],
  unit: ProductSellUnit,
  key: UnitPriceKey,
): number | null {
  const source = preferredUnit(units) ?? canonicalUnit(units);
  if (!source || source.id === unit.id || !conversionFactor(unit)) return null;
  return derivePricesBetween(source, unit)[key];
}

export function applyDerivedPrices(
  units: ProductSellUnit[],
  row: ProductSellUnit,
): ProductSellUnit {
  const source = preferredUnit(units) ?? canonicalUnit(units);
  if (!source || row.id === source.id) return row;
  if (!conversionFactor(row)) return row;
  return withManual(row, derivePricesBetween(source, row));
}

export function deriveAll(units: ProductSellUnit[]) {
  const source = preferredUnit(units) ?? canonicalUnit(units);
  if (!source) return units;
  return units.map((u) => (u.id === source.id ? u : applyDerivedPrices(units, u)));
}

/**
 * Preferred / "Base unit" badge only — does not touch contains, factorDirection, or prices.
 * Inventory (Lots) stays on the canonical stock unit.
 */
export function setPreferredUnit(units: ProductSellUnit[], nextId: string): ProductSellUnit[] {
  if (!units.some((unit) => unit.id === nextId)) return units;
  return units.map((unit) => {
    const preferred = unit.id === nextId;
    return {
      ...unit,
      isDefault: preferred,
      kind: unit.isBase ? ("base" as const) : unit.kind,
    };
  });
}

/**
 * Rewrite factors so `nextId` becomes the inventory (factor 1) unit.
 * Prefer `setPreferredUnit` for the UI "Set as base" button.
 */
export function applyBaseUnitChange(units: ProductSellUnit[], nextId: string): ProductSellUnit[] {
  const next = units.find((unit) => unit.id === nextId);
  if (!next) return units;
  const perNew = inventoryPerSellUnit(next);
  if (!(perNew > 0)) return units;
  return units.map((unit) => {
    if (unit.id === nextId) {
      return {
        ...unit,
        contains: 1,
        factorDirection: "multiply",
        isBase: true,
        isDefault: true,
        kind: "base",
      };
    }
    const ratio = inventoryPerSellUnit(unit) / perNew;
    const inside = ratio < 1;
    return {
      ...unit,
      contains: Math.round((inside ? 1 / ratio : ratio) * 1e6) / 1e6,
      factorDirection: inside ? "divide" : "multiply",
      isBase: false,
      isDefault: false,
      kind: inside ? "smaller" : "bigger",
    };
  });
}

/**
 * Typed factor direction.
 * - subdivision (gaz/m/…) + N>1 → divide ("1 Roll contains N Gaz")
 * - N<1 → multiply ("1 Gaz = 0.011111 Roll")
 * - pack/box + N>1 → multiply ("1 Pack contains N Piece")
 */
export function factorDirectionForContains(
  current: ProductSellUnit["factorDirection"],
  contains: number,
  symbol?: string,
): "multiply" | "divide" {
  if (contains > 0 && contains < 1) return "multiply";
  if (isSubdivisionSymbol(symbol) && contains > 1) return "divide";
  if (contains > 1 && current === "divide") return "divide";
  return "multiply";
}

/** Direction used for labels/prices when the row omitted it. */
export function resolvedFactorDirection(unit: ProductSellUnit): "multiply" | "divide" {
  if (unit.factorDirection === "divide" || unit.factorDirection === "multiply") {
    return unit.factorDirection;
  }
  if (isSubdivisionSymbol(unit.symbol) && conversionFactor(unit) > 1) return "divide";
  return "multiply";
}

/** Lot cost is per stock unit. Multiply by this when `nextId` becomes the stock unit. */
export function baseChangeCostFactor(units: ProductSellUnit[], nextId: string) {
  const next = units.find((unit) => unit.id === nextId);
  const stock = canonicalUnit(units) ?? preferredUnit(units);
  if (!next || !stock || next.id === stock.id) return 1;
  const perStock = inventoryPerSellUnit(stock) || 1;
  const factor = inventoryPerSellUnit(next) / perStock;
  return factor > 0 ? factor : 1;
}

function namesUnit(unit: ProductSellUnit, symbol: string) {
  const needle = symbol.trim().toLowerCase();
  if (!needle) return false;
  const sym = (unit.symbol ?? "").trim().toLowerCase();
  const name = (unit.name ?? "").trim().toLowerCase();
  const label = unitLabel(symbol).trim().toLowerCase();
  return sym === needle || name === needle || name === label || sym === label;
}

/** Base-unit dropdown. Picking a unit that already has a card makes that card preferred only. */
export function assignBaseSymbol(units: ProductSellUnit[], symbol: string): ProductSellUnit[] {
  const preferred = preferredUnit(units);
  if (!preferred || !symbol.trim()) return units;
  const existing = units.find((unit) => unit.id !== preferred.id && namesUnit(unit, symbol));
  if (existing) return setPreferredUnit(units, existing.id);
  return setPreferredUnit(
    units.map((row) =>
      row.id === preferred.id
        ? { ...row, symbol, name: unitLabel(symbol), kind: "base" as const }
        : row,
    ),
    preferred.id,
  );
}

export type SellUnitsValidationError =
  "unitNameRequired" | "unitNameDuplicate" | "unitFactorInvalid" | "unitBaseRequired";

/**
 * Opening stock on create: zero is allowed (receive later via lots).
 * Negatives are rejected.
 */
export function validateOpeningStock(stock: number): "openingQty" | null {
  if (!Number.isFinite(stock) || stock < 0) return "openingQty";
  return null;
}

/** Positive factors, unique names, exactly one preferred base. */
export function validateSellUnits(units: ProductSellUnit[]): SellUnitsValidationError | null {
  const list = qtyUnits(units);
  if (!list.length) return "unitBaseRequired";
  const defaults = list.filter((unit) => unit.isDefault);
  if (defaults.length !== 1 && !preferredUnit(list)) return "unitBaseRequired";
  if (defaults.length > 1) return "unitBaseRequired";
  const stock = stockUnitForLabel(list) ?? canonicalUnit(list);
  const seen = new Set<string>();
  for (const unit of list) {
    const name = (unit.name || unitLabel(unit.symbol || "")).trim().toLowerCase();
    if (!name) return "unitNameRequired";
    if (seen.has(name)) return "unitNameDuplicate";
    seen.add(name);
    // Non-stock units must have contains > 0 (0 and negatives are invalid).
    if (stock && unit.id !== stock.id && !(unit.contains > 0)) return "unitFactorInvalid";
  }
  return null;
}

export function sellUnitOptionValue(
  row: ProductSellUnit,
  masters: { symbol: string; name: string }[],
) {
  const match = masters.find((unit) => namesUnit(row, unit.symbol) || namesUnit(row, unit.name));
  if (match) return match.symbol;
  const named = symbolFromUnitName(row.name || row.symbol || "");
  const byName = masters.find((unit) => unit.symbol.toLowerCase() === named.toLowerCase());
  if (byName && named.toLowerCase() !== "pc") return byName.symbol;
  if (byName && (row.symbol || row.name || "").trim().toLowerCase() === "pc") return byName.symbol;
  return row.symbol || row.name || "";
}

export function sellUnitOptions(
  row: ProductSellUnit,
  units: ProductSellUnit[],
  masters: { symbol: string; name: string }[],
) {
  const value = sellUnitOptionValue(row, masters);
  const options = masters
    .filter((unit, index, all) => {
      const key = unit.name.trim().toLowerCase();
      if (all.findIndex((item) => item.name.trim().toLowerCase() === key) !== index) return false;
      const taken = units.some(
        (other) =>
          other.id !== row.id && (namesUnit(other, unit.symbol) || namesUnit(other, unit.name)),
      );
      const mine = namesUnit(row, unit.symbol) || namesUnit(row, unit.name);
      return !taken || mine;
    })
    .map((unit) => ({ value: unit.symbol, label: unit.name }));
  if (value && !options.some((option) => option.value === value)) {
    options.unshift({ value, label: row.name || unitLabel(value) || value });
  }
  return options;
}

function stockUnitForLabel(unitsList: ProductSellUnit[]) {
  return (
    unitsList.find(
      (unit) =>
        resolvedFactorDirection(unit) !== "divide" && Math.abs(conversionFactor(unit) - 1) < 1e-6,
    ) ?? canonicalUnit(unitsList)
  );
}

/** Stable sentence. Subdivision always reads as "1 Roll contains", never "1 Gaz contains". */
export function containsLabel(
  baseOrUnits: ProductSellUnit | ProductSellUnit[] | undefined,
  packOrRow?: ProductSellUnit,
  maybeRow?: ProductSellUnit,
) {
  const unitsList = Array.isArray(baseOrUnits)
    ? baseOrUnits
    : ([baseOrUnits, packOrRow, maybeRow].filter(Boolean) as ProductSellUnit[]);
  const row = Array.isArray(baseOrUnits) ? packOrRow : maybeRow;
  if (!row) return "Contains";
  const stock = stockUnitForLabel(unitsList);
  if (!stock || stock.id === row.id) return "Stock unit";
  const stockName = stock.name || unitLabel(stock.symbol || "") || "unit";
  const rowName = row.name || unitLabel(row.symbol || "") || "unit";
  if (resolvedFactorDirection(row) === "divide") return `1 ${stockName} contains`;
  return `1 ${rowName} contains`;
}

/** One-line check under the factor field: "1 Roll = 7 Gaz". */
export function containsRelationHint(unitsList: ProductSellUnit[], row: ProductSellUnit) {
  const stock = stockUnitForLabel(unitsList);
  if (!stock || stock.id === row.id || !(row.contains > 0)) return "";
  const n = formatStockQty(row.contains);
  const stockName = stock.name || unitLabel(stock.symbol || "") || "unit";
  const rowName = row.name || unitLabel(row.symbol || "") || "unit";
  if (resolvedFactorDirection(row) === "divide") return `1 ${stockName} = ${n} ${rowName}`;
  return `1 ${rowName} = ${n} ${stockName}`;
}

export function qtyBreakdown(
  product: Product,
  stockQty: number,
): { id: string; name: string; qty: number }[] {
  const units = productSellUnits(product);
  const list = qtyUnits(units);
  const rows = (list.length ? list : units).map((u) => ({
    id: u.id,
    name: u.name || unitLabel(u.symbol || product.unit),
    qty: qtyInUnit(units, product.unit, u, stockQty),
  }));
  return rows.length ? rows : [{ id: product.id, name: unitLabel(product.unit), qty: stockQty }];
}

/** Whole stock-unit counts with equivalent or remainder amounts in other units (no 10.89 Roll). */
export function displayQtyBreakdown(
  product: Product,
  stockQty: number,
): { id: string; name: string; qty: number }[] {
  const units = productSellUnits(product);
  const list = qtyUnits(units);
  const stockUnitObj =
    list.find((u) => u.symbol === product.unit) ??
    canonicalUnit(units) ??
    baseUnit(units) ??
    list[0];

  if (!list.length || !stockUnitObj) {
    return [{ id: product.id, name: unitLabel(product.unit), qty: stockQty }];
  }

  if (list.length === 1) {
    return [
      {
        id: stockUnitObj.id,
        name: stockUnitObj.name || unitLabel(stockUnitObj.symbol || product.unit),
        qty: stockQty,
      },
    ];
  }

  const parts = splitStockQty(units, product.unit, stockQty);
  const rows: { id: string; name: string; qty: number }[] = [
    {
      id: stockUnitObj.id,
      name: stockUnitObj.name || unitLabel(stockUnitObj.symbol || product.unit),
      qty: stockQty,
    },
  ];
  for (const u of list) {
    if (u.id === stockUnitObj.id) continue;
    const splitQty = parts[u.id] ?? 0;
    if (splitQty > 0) {
      rows.push({
        id: u.id,
        name: u.name || unitLabel(u.symbol || product.unit),
        qty: splitQty,
      });
    }
  }
  return rows;
}

/** Exact stock-unit total plus physical split in smaller units (branch stock panels). */
export function branchQtyBreakdown(
  product: Product,
  stockQty: number,
): {
  exact: { name: string; qty: number };
  whole: number;
  fraction: number | null;
  fractionText: string | null;
  parts: { name: string; qty: number }[];
} {
  const units = productSellUnits(product);
  const list = qtyUnits(units);
  const stockUnitObj =
    list.find((u) => u.symbol === product.unit) ??
    canonicalUnit(units) ??
    baseUnit(units) ??
    list[0];
  const stockName = stockUnitObj
    ? stockUnitObj.name || unitLabel(stockUnitObj.symbol || product.unit)
    : unitLabel(product.unit);
  const split = splitStockUnitDisplay(stockQty);

  if (!stockUnitObj || list.length <= 1) {
    return {
      exact: { name: stockName, qty: stockQty },
      whole: split.whole,
      fraction: split.fraction,
      fractionText: split.fractionText,
      parts: [],
    };
  }

  const parts = splitStockQty(units, product.unit, stockQty);
  const wholeStock = parts[stockUnitObj.id] ?? 0;
  const hasRemainder = Math.abs(stockQty - wholeStock) > 1e-6;

  const secondary = list
    .filter((u) => u.id !== stockUnitObj.id)
    .map((u) => {
      const name = u.name || unitLabel(u.symbol || product.unit);
      const splitQty = parts[u.id] ?? 0;
      if (splitQty > 0) return { name, qty: splitQty };
      if (!hasRemainder) return { name, qty: qtyInUnit(units, product.unit, u, stockQty) };
      return null;
    })
    .filter((row): row is { name: string; qty: number } => row != null && row.qty > 0);

  return {
    exact: { name: stockName, qty: stockQty },
    whole: split.whole,
    fraction: split.fraction,
    fractionText: split.fractionText,
    parts: secondary,
  };
}

export function stockBreakdown(product: Product) {
  return qtyBreakdown(product, product.stock);
}

export function priceBreakdown(
  product: Product,
  stockPrice: number,
): { id: string; name: string; value: number }[] {
  const units = productSellUnits(product);
  const list = qtyUnits(units);
  const resolvedStock = resolveStockUnitCost(units, product.unit, stockPrice);
  const rows = (list.length ? list : units).map((u) => ({
    id: u.id,
    name: u.name || unitLabel(u.symbol || product.unit),
    value: priceFromStock(units, product.unit, resolvedStock, u),
  }));
  return rows.length
    ? rows
    : [{ id: product.id, name: unitLabel(product.unit), value: roundMoney(stockPrice) }];
}
