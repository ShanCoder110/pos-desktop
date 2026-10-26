import {
  baseUnit,
  priceFromStock,
  pricePerStock,
  productSellUnits,
} from "@/pages/products/productQty";
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
    cost: overlay.purchasePrice
      ? priceFromStock(units, product.unit, overlay.purchasePrice, unit)
      : unit.cost,
    min: unit.id === stock?.id && overlay.minimumPrice ? overlay.minimumPrice : unit.min,
    wholesale:
      unit.id === stock?.id && overlay.wholesalePrice ? overlay.wholesalePrice : unit.wholesale,
    price: unit.id === stock?.id && overlay.retailPrice ? overlay.retailPrice : unit.price,
  }));
}

/** Cost converts by quantity; min/wholesale/retail can differ independently by unit. */
export function editLotUnitPrice(
  units: ProductSellUnit[],
  stockSymbol: string,
  unitId: string,
  key: LotUnitPriceKey,
  value: number,
): ProductSellUnit[] {
  const source = units.find((unit) => unit.id === unitId);
  if (!source) return units;
  if (key !== "cost") {
    return units.map((unit) =>
      unit.id === unitId
        ? { ...unit, [key]: value, priceManual: { ...unit.priceManual, [key]: true } }
        : unit,
    );
  }
  const stockCost = pricePerStock(units, stockSymbol, value, source);
  return units.map((unit) => ({
    ...unit,
    cost: unit.id === source.id ? value : priceFromStock(units, stockSymbol, stockCost, unit),
    priceManual: unit.id === source.id ? { ...unit.priceManual, cost: true } : unit.priceManual,
  }));
}
