import type { Product, ProductSellUnit } from "@/shared/types";
import { inventoryPerSellUnit, normalizeSellUnits } from "@/pages/products/productQty";
import { productSellUnits as creditUnits } from "@/pages/credit/creditSaleUtils";
import { defaultTransactionUnit, displayedToStockQuantity } from "@/utils/unitConversion";

export type SalePriceTier = "retail" | "wholesale" | "minimum";

export function unitsForProduct(product: Product): ProductSellUnit[] {
  if (product.sellUnits?.length) return normalizeSellUnits(product.sellUnits);
  return creditUnits(product);
}

export function resolveSellUnit(product: Product, unitId?: string): ProductSellUnit | undefined {
  const units = unitsForProduct(product);
  if (unitId) {
    const hit = units.find((u) => u.id === unitId);
    if (hit) return hit;
  }
  return defaultTransactionUnit(product, units);
}

/** Exact product barcode → undefined (default unit). Exact sell-unit barcode → that unit. */
export function resolveMatchedUnitId(
  product: Product,
  query: string,
  matchedUnitId?: string | null,
): string | undefined {
  if (matchedUnitId) {
    const hit = resolveSellUnit(product, matchedUnitId);
    if (hit?.id) return hit.id;
  }
  const needle = query.trim().toLowerCase();
  if (!needle) return undefined;
  if ((product.barcode ?? "").toLowerCase() === needle) return undefined;
  const unit = unitsForProduct(product).find(
    (u) => (u.barcode ?? "").trim().toLowerCase() === needle,
  );
  return unit?.id;
}

/** Alphanumeric-only key so "pmx001" matches SKU "PMX-001". */
export function productSearchCompactKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function productMatchesQuery(product: Product, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if ((product.name ?? "").toLowerCase().includes(q)) return true;
  const productNo = product.productNo;
  if (productNo != null && productNo > 0 && String(productNo).includes(q)) return true;
  if ((product.sku ?? "").toLowerCase().includes(q)) return true;
  if ((product.barcode ?? "").toLowerCase().includes(q)) return true;
  if (unitsForProduct(product).some((u) => (u.barcode ?? "").toLowerCase().includes(q))) {
    return true;
  }
  const compact = productSearchCompactKey(query);
  if (!compact) return false;
  if (productNo != null && productNo > 0 && String(productNo).includes(compact)) return true;
  if (productSearchCompactKey(product.sku ?? "").includes(compact)) return true;
  if (productSearchCompactKey(product.barcode ?? "").includes(compact)) return true;
  return unitsForProduct(product).some((u) =>
    productSearchCompactKey(u.barcode ?? "").includes(compact),
  );
}

function searchWords(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/[\s\-_+/]+/)
    .filter(Boolean);
}

/**
 * Lower = better.
 * Typing "r": 1st word starts with r, then 2nd word, then 3rd… then mid-word substring.
 */
export function nameSearchRank(name: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 10_000;
  const n = name.trim().toLowerCase();
  if (!n) return 10_000;
  if (n === q) return 0;
  const words = searchWords(n);
  const wordIndex = words.findIndex((word) => word.startsWith(q));
  if (wordIndex >= 0) return 1 + wordIndex;
  const at = n.indexOf(q);
  if (at >= 0) return 500 + at;
  return 10_000;
}

export function compareNameSearch(a: string, b: string, query: string): number {
  const diff = nameSearchRank(a, query) - nameSearchRank(b, query);
  return diff !== 0 ? diff : a.localeCompare(b);
}

export function productSearchRank(product: Product, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 10_000;
  if (product.productNo != null && product.productNo > 0 && String(product.productNo) === q) {
    return 0;
  }
  const byName = nameSearchRank(product.name ?? "", q);
  const byUrdu = nameSearchRank(product.urduName ?? "", q);
  const nameRank = Math.min(byName, byUrdu);
  if (nameRank < 500) return nameRank;
  if ((product.sku ?? "").toLowerCase().startsWith(q)) return 800;
  if ((product.barcode ?? "").toLowerCase().startsWith(q)) return 800;
  if (nameRank < 10_000) return nameRank;
  if ((product.sku ?? "").toLowerCase().includes(q)) return 900;
  if ((product.barcode ?? "").toLowerCase().includes(q)) return 900;
  return 10_000;
}

export function compareProductSearch(a: Product, b: Product, query: string): number {
  const diff = productSearchRank(a, query) - productSearchRank(b, query);
  return diff !== 0 ? diff : (a.name ?? "").localeCompare(b.name ?? "");
}

/** Selling price for one displayed unit at the given tier (uses product_units row, not base×factor). */
export function unitTierPrice(unit: ProductSellUnit | undefined, tier: SalePriceTier): number {
  if (!unit) return 0;
  if (tier === "minimum") return Number(unit.min) || 0;
  if (tier === "wholesale") return Number(unit.wholesale) || 0;
  return Number(unit.price) || 0;
}

export function posTierPrice(
  product: Product,
  unitId: string,
  tier: "retail" | "wholesale",
): number {
  const unit = resolveSellUnit(product, unitId);
  return unitTierPrice(unit, tier === "wholesale" ? "wholesale" : "retail");
}

export function creditTierPrice(unit: ProductSellUnit | undefined, tier: SalePriceTier): number {
  return unitTierPrice(unit, tier);
}

/** Stock units consumed by one displayed unit. */
export function stockPerUnit(unit: ProductSellUnit): number {
  return inventoryPerSellUnit(unit);
}

function round6(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

/** Base (stock) qty for a displayed qty. Uses the containment saved on that unit. */
export function toBaseQty(product: Product, unitId: string, qty: number): number {
  const unit = resolveSellUnit(product, unitId);
  if (!unit) return round6(qty);
  return displayToBaseQty(unit, qty);
}

export function displayToBaseQty(unit: ProductSellUnit, displayQty: number): number {
  return round6(displayedToStockQuantity(unit, displayQty));
}

/** Whether inventory contains at least one complete unit (for example one full pack). */
export function hasCompleteSellUnit(unit: ProductSellUnit, baseAvailable: number): boolean {
  return baseAvailable + 0.000001 >= displayToBaseQty(unit, 1);
}

/**
 * How many of this sell unit can be taken from base stock.
 * Whole packs/rolls are floored; length-style units (factor ≤ 1) stay fractional.
 */
export function availableDisplayQty(
  unit: ProductSellUnit | undefined,
  baseAvailable: number,
): number {
  if (!unit) return Math.max(0, baseAvailable);
  const basePerUnit = displayToBaseQty(unit, 1);
  if (!(basePerUnit > 0)) return Math.max(0, baseAvailable);
  const available = Math.max(0, baseAvailable / basePerUnit);
  return basePerUnit > 1 ? Math.floor(available + 1e-9) : +available.toFixed(4);
}

/** Whole units only — credit / repair qty fields never take fractions. */
export function availableWholeQty(
  unit: ProductSellUnit | undefined,
  baseAvailable: number,
): number {
  return Math.max(0, Math.floor(availableDisplayQty(unit, baseAvailable) + 1e-9));
}

export function parseWholeQtyDraft(raw: string) {
  return raw.replace(/[^\d]/g, "");
}

export function wholeQty(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value + 1e-9);
}

/**
 * POS customer balance is the negated ledger: negative = Due (owes), positive = Cr (advance).
 * `paidNow` is money kept, not change handed back.
 */
export function balanceAfterSale(currentBalance: number, billTotal: number, paidNow: number) {
  return +(currentBalance - billTotal + paidNow).toFixed(2);
}

/** Convert POS Due/Cr sign back to ledger (positive = Owes, negative = Advance). */
export function posBalanceToLedger(posBalance: number) {
  return posBalance === 0 ? 0 : -posBalance;
}

export function lineTotal(displayQty: number, unitPrice: number): number {
  return +(displayQty * unitPrice).toFixed(2);
}

export function lineProfit(displayQty: number, unitPrice: number, unitCost: number): number {
  return +((unitPrice - unitCost) * displayQty).toFixed(2);
}

export function unitCostPerDisplay(unit: ProductSellUnit): number {
  return Number(unit.cost) || 0;
}

export type PosPriceMode = "retail" | "wholesale";

/**
 * P2-8: selecting Walk-in/guest forces retail for the cart toggle.
 * Selecting a named customer keeps the cashier's current mode.
 */
export function priceModeForCustomerSwitch(
  nextIsWalkIn: boolean,
  currentMode: PosPriceMode,
): PosPriceMode {
  return nextIsWalkIn ? "retail" : currentMode;
}

/**
 * List/min prices for a cart line's unit row at retail or wholesale (not base×factor).
 * Wholesale with unset/0 unit wholesale falls back to that unit's retail price.
 */
export function cartLineTierPrices(
  product: Product,
  productUnitId: string,
  mode: PosPriceMode,
): { listPrice: number; minPrice: number; usedRetailFallback: boolean } {
  const unit = resolveSellUnit(product, productUnitId);
  const minPrice = unitTierPrice(unit, "minimum");
  if (mode !== "wholesale") {
    return { listPrice: unitTierPrice(unit, "retail"), minPrice, usedRetailFallback: false };
  }
  const wholesale = unitTierPrice(unit, "wholesale");
  if (wholesale > 0) {
    return { listPrice: wholesale, minPrice, usedRetailFallback: false };
  }
  return {
    listPrice: unitTierPrice(unit, "retail"),
    minPrice,
    usedRetailFallback: true,
  };
}

/** When switching a line between sell units, keep base qty and apply target unit tier prices. */
export function convertLineToUnit(
  product: Product,
  baseQty: number,
  priceMode: PosPriceMode,
  targetUnitId: string,
): {
  productUnitId: string;
  qty: number;
  listPrice: number;
  unitPrice: number;
  minPrice: number;
  sellUnit: string;
  packSize: number;
  usedRetailFallback: boolean;
} | null {
  const target = resolveSellUnit(product, targetUnitId);
  if (!target?.id) return null;
  const { listPrice, minPrice, usedRetailFallback } = cartLineTierPrices(
    product,
    target.id,
    priceMode,
  );
  return {
    productUnitId: target.id,
    // Keep the unrounded converted quantity in cart state. The POS formats it for
    // display, but calculations must retain the exact value (for example, one
    // piece is 1 / 12 of a 12-piece pack, not 0.0833 packs).
    qty: baseQty / stockPerUnit(target),
    listPrice,
    unitPrice: listPrice,
    minPrice,
    sellUnit: target.name || target.symbol || product.unit,
    packSize: stockPerUnit(target),
    usedRetailFallback,
  };
}
