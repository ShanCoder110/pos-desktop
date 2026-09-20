import { baseUnit, productSellUnits } from "@/pages/products/productQty";
import type { ProductLotRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";

export function lastOpenLotForProduct(lots: ProductLotRow[], productId: string) {
  return (
    lots
      .filter((lot) => lot.productId === productId && lot.remainingQuantity > 0)
      .slice()
      .sort(
        (a, b) =>
          b.receivedAt.localeCompare(a.receivedAt) || b.lotNumber.localeCompare(a.lotNumber),
      )[0] ?? null
  );
}

export function quickReorderPrefill(product: Product, lots: ProductLotRow[]) {
  const last = lastOpenLotForProduct(lots, product.id);
  const minimum = Math.max(1, product.minimumStock ?? 1);
  return {
    quantity: last?.originalQuantity ?? minimum,
    supplierId: last?.supplierId ?? "",
    cost: last?.purchasePrice ?? product.cost ?? 0,
    fromLot: last,
  };
}

/** product_units.id for the stock (base) sell unit — not products.base_unit_id (master units row). */
export function productStockUnitId(product: Product) {
  const apiUnits = product.sellUnits ?? [];
  const stock =
    apiUnits.find((unit) => unit.isBase) ??
    apiUnits.find((unit) => unit.symbol === product.unit) ??
    apiUnits[0];
  if (stock?.id) return stock.id;

  const derived = productSellUnits(product);
  const fallback = derived.find((unit) => unit.kind === "base") ?? baseUnit(derived);
  return fallback?.id && !fallback.id.endsWith("-u") && !fallback.id.endsWith("-pack")
    ? fallback.id
    : "";
}
