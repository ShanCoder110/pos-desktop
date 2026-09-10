import type { Lot, Product, StockPick } from "@/shared/types";

export type ConsumeResult = {
  price: number;
  minFloor: number;
  lotsNote: string;
  used: { lot: Lot; qty: number }[];
};

/** On-hand from the live product row (FIFO is applied server-side on sale). */
export function remainingStock(product: Product) {
  return product.stock;
}

export function consumeLots(
  product: Product,
  qty: number,
  _pick: StockPick,
  _supplierId?: string,
): ConsumeResult | { error: string } {
  const shopLeft = remainingStock(product);
  if (qty > shopLeft) {
    return { error: `Only ${shopLeft} ${product.unit} left in shop` };
  }

  return {
    price: product.retail,
    minFloor: product.min,
    lotsNote: `${qty} ${product.unit} (FIFO on complete)`,
    used: [],
  };
}
