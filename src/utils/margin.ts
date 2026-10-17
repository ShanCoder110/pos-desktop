/** Profit = selling price − cost price (same currency unit). */
export function profitAmount(sellingPrice: number, costPrice: number): number {
  const sell = Number(sellingPrice);
  const cost = Number(costPrice);
  if (!Number.isFinite(sell) || !Number.isFinite(cost)) return 0;
  return sell - cost;
}

/**
 * Profit margin (%) = (Profit / Selling Price) × 100.
 * Returns 0 when selling price is not positive.
 */
export function profitMarginPercent(sellingPrice: number, costPrice: number): number {
  const sell = Number(sellingPrice);
  const cost = Number(costPrice);
  if (!Number.isFinite(sell) || sell <= 0) return 0;
  if (!Number.isFinite(cost) || cost < 0) return 0;
  const profit = sell - cost;
  return (profit / sell) * 100;
}

/**
 * Markup (%) = (Profit / Cost Price) × 100.
 * Returns 0 when cost is not positive (avoids division blow-ups).
 */
export function markupPercent(sellingPrice: number, costPrice: number): number {
  const sell = Number(sellingPrice);
  const cost = Number(costPrice);
  if (!Number.isFinite(sell) || !Number.isFinite(cost) || cost <= 0) return 0;
  const profit = sell - cost;
  return (profit / cost) * 100;
}
