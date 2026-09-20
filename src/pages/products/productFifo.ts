import type { ProductLotRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { lotCostInStockUnit } from "@/pages/products/productQty";

export function fifoLots(lots: ProductLotRow[]) {
  return lots
    .filter((l) => l.remainingQuantity > 0)
    .slice()
    .sort(
      (a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.lotNumber.localeCompare(b.lotNumber),
    );
}

export function fifoLot(lots: ProductLotRow[]) {
  return fifoLots(lots)[0] ?? null;
}

export function fifoLotForProduct(lots: ProductLotRow[], productId: string) {
  return fifoLot(lots.filter((lot) => lot.productId === productId));
}

/** FIFO cost per stock unit — open lot first, otherwise catalog cost. */
export function fifoCostForProduct(product: Product, lots: ProductLotRow[]) {
  const lot = fifoLotForProduct(lots, product.id);
  return lot ? lotCostInStockUnit(product, lot.purchasePrice) : product.cost;
}

/** Remaining stock value at FIFO lot purchase cost (matches Lots → Value left). */
export function openLotStockValue(lots: ProductLotRow[], products: Product[], productId?: string) {
  const scoped = productId ? lots.filter((lot) => lot.productId === productId) : lots;
  return scoped
    .filter((lot) => lot.remainingQuantity > 0)
    .reduce((sum, lot) => {
      const product = products.find((row) => row.id === lot.productId);
      const unitCost = product ? lotCostInStockUnit(product, lot.purchasePrice) : lot.purchasePrice;
      return sum + lot.remainingQuantity * unitCost;
    }, 0);
}
