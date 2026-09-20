import { PRODUCT_COPY, PRODUCT_UNIT_PRICE_TIERS } from "@/shared/constants/products";
import {
  proportionalPriceParentName,
  proportionalUnitPrice,
  type UnitPriceKey,
} from "@/pages/products/productQty";
import type { ProductSellUnit } from "@/shared/types";
import { money } from "@/utils/format";

export const UNIT_PRICE_KEYS: UnitPriceKey[] = ["cost", "min", "wholesale", "price"];

export function unitPriceMissingError(value: number): string | undefined {
  if (value > 0) return undefined;
  return PRODUCT_COPY.unitPriceRequired;
}

export function firstMissingUnitPrice(
  units: ProductSellUnit[],
): { unitId: string; key: UnitPriceKey } | null {
  for (const unit of units) {
    for (const key of UNIT_PRICE_KEYS) {
      if (unit[key] <= 0) return { unitId: unit.id, key };
    }
  }
  return null;
}

export function hasMissingUnitPrices(units: ProductSellUnit[]): boolean {
  return firstMissingUnitPrice(units) != null;
}

export function derivedUnitPriceError(
  units: ProductSellUnit[],
  unit: ProductSellUnit,
  key: UnitPriceKey,
  value: number,
): string | undefined {
  if (unit.kind === "base") return undefined;
  const floor = proportionalUnitPrice(units, unit, key);
  if (floor == null || floor <= 0) return undefined;
  if (value <= 0) return undefined;
  if (value + 1e-6 >= floor) return undefined;
  const parentName = proportionalPriceParentName(units, unit);
  return PRODUCT_COPY.derivedPriceTooLow(PRODUCT_UNIT_PRICE_TIERS[key], money(floor), parentName);
}

export function hasInvalidDerivedUnitPrices(units: ProductSellUnit[]): boolean {
  return units.some((unit) =>
    UNIT_PRICE_KEYS.some((key) => Boolean(derivedUnitPriceError(units, unit, key, unit[key]))),
  );
}

export function unitPriceFieldError(
  units: ProductSellUnit[],
  unit: ProductSellUnit,
  key: UnitPriceKey,
  value: number,
  showMissing = false,
): string | undefined {
  const missing = showMissing ? unitPriceMissingError(value) : undefined;
  return missing ?? derivedUnitPriceError(units, unit, key, value);
}
