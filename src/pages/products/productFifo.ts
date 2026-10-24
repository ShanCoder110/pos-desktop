import type { ProductLotRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import {
  lotCostInStockUnit,
  productSellUnits,
  resolveStockUnitCost,
} from "@/pages/products/productQty";

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

const lotIndex = new WeakMap<ProductLotRow[], Map<string, ProductLotRow[]>>();
const productIndex = new WeakMap<Product[], Map<string, Product>>();

function lotsByProduct(lots: ProductLotRow[]) {
  let index = lotIndex.get(lots);
  if (!index) {
    index = new Map();
    for (const lot of lots) {
      const productLots = index.get(lot.productId) ?? [];
      productLots.push(lot);
      index.set(lot.productId, productLots);
    }
    lotIndex.set(lots, index);
  }
  return index;
}

function productsById(products: Product[]) {
  let index = productIndex.get(products);
  if (!index) {
    index = new Map(products.map((product) => [product.id, product]));
    productIndex.set(products, index);
  }
  return index;
}

export function fifoLotForProduct(lots: ProductLotRow[], productId: string) {
  return fifoLot(lotsByProduct(lots).get(productId) ?? []);
}

/** FIFO cost per stock unit — open lot first, otherwise catalog cost. */
export function fifoCostForProduct(product: Product, lots: ProductLotRow[]) {
  const lot = fifoLotForProduct(lots, product.id);
  const raw = lot ? lotCostInStockUnit(product, lot.purchasePrice) : product.cost;
  return resolveStockUnitCost(productSellUnits(product), product.unit, raw);
}

/** Remaining stock value at FIFO lot purchase cost (matches Lots → Value left). */
export function openLotStockValue(lots: ProductLotRow[], products: Product[], productId?: string) {
  const scoped = productId ? (lotsByProduct(lots).get(productId) ?? []) : lots;
  const productMap = productsById(products);
  return scoped
    .filter((lot) => lot.remainingQuantity > 0)
    .reduce((sum, lot) => {
      const product = productMap.get(lot.productId);
      const unitCost = product ? lotCostInStockUnit(product, lot.purchasePrice) : lot.purchasePrice;
      return sum + lot.remainingQuantity * unitCost;
    }, 0);
}
