import { baseUnit, editUnitRate, productSellUnits } from "@/pages/products/productQty";
import type { Product, ProductSellUnit } from "@/shared/types";

export type LotPriceOverlay = {
  purchasePrice: number;
  minimumPrice: number;
  wholesalePrice: number;
  retailPrice: number;
};

export type LotUnitPriceKey = "cost" | "min" | "wholesale" | "price";

/** A lot has one cost and one set of stock-unit prices. Other selling units keep their own tiers. */
export function seedLotUnits(product: Product, overlay?: LotPriceOverlay): ProductSellUnit[] {
  const units = productSellUnits(product);
  if (!overlay) return units.map((unit) => ({ ...unit }));
  const stock = units.find((unit) => unit.symbol === product.unit) ?? baseUnit(units);
  return units.map((unit) => ({
    ...unit,
    cost: unit.id === stock?.id && overlay.purchasePrice ? overlay.purchasePrice : unit.cost,
    min: unit.id === stock?.id && overlay.minimumPrice ? overlay.minimumPrice : unit.min,
    wholesale:
      unit.id === stock?.id && overlay.wholesalePrice ? overlay.wholesalePrice : unit.wholesale,
    price: unit.id === stock?.id && overlay.retailPrice ? overlay.retailPrice : unit.price,
  }));
}

/** Every rate is independent; only the stock unit's cost controls the receipt total. */
export function editLotUnitPrice(
  units: ProductSellUnit[],
  stockSymbol: string,
  unitId: string,
  key: LotUnitPriceKey,
  value: number,
): ProductSellUnit[] {
  void stockSymbol;
  return editUnitRate(units, unitId, key, value);
}
