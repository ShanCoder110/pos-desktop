import type { Lot, Product, StockPick } from "@/shared/types";
import { productTotalStock } from "@/utils/productStock";

export type ConsumeResult = {
  price: number;
  minFloor: number;
  lotsNote: string;
  used: { lot: Lot; qty: number }[];
};

/** Sellable pool across all branches (server allocates from this branch, then main, then others). */
export function remainingStock(product: Product) {
  return productTotalStock(product);
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
