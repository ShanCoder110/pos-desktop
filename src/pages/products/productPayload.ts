import { baseUnit, qtyUnits, unitLabel } from "@/pages/products/productQty";
import type { Product } from "@/shared/types";

type UnitRow = { id: string; symbol: string };
type CategoryRow = { id: string; name: string };

export function resolveCategoryId(
  product: Pick<Product, "category" | "categoryId">,
  categories: CategoryRow[],
) {
  if (product.categoryId) {
    const byId = categories.find((row) => row.id === product.categoryId);
    if (byId) return byId;
  }
  if (product.category) {
    const byName = categories.find((row) => row.name === product.category);
    if (byName) return byName;
  }
  return undefined;
}

function unitIdForSymbol(symbol: string, units: UnitRow[], fallbackId: string) {
  return units.find((unit) => unit.symbol === symbol)?.id ?? fallbackId;
}

function mapSellUnits(product: Product, units: UnitRow[]) {
  const rows = qtyUnits(product.sellUnits ?? []);
  const base = baseUnit(rows) ?? rows[0];
  const baseSymbol = base?.symbol ?? product.unit;
  const baseUnitId = unitIdForSymbol(baseSymbol, units, product.baseUnitId ?? "");
  if (!baseUnitId) return null;

  const mapped = rows.map((unit) => ({
    unitId: unitIdForSymbol(unit.symbol ?? baseSymbol, units, baseUnitId),
    name: unit.name || unitLabel(unit.symbol ?? baseSymbol),
    contains: unit.contains,
    cost: unit.cost,
    min: unit.min,
    wholesale: unit.wholesale,
    price: unit.price,
    barcode: unit.barcode?.trim() || undefined,
    isBase: unit.kind === "base",
    isDefault: unit.kind === "base",
  }));

  return { baseUnitId, sellUnits: mapped };
}

type OpeningStockRow = {
  branchId: string;
  supplierId?: string;
  quantity: number;
  cost: number;
  receivedDate: string;
};

export function buildCreateProductPayload(
  product: Product,
  options: {
    categoryId: string;
    units: UnitRow[];
    branchQuantities: Record<string, number>;
  },
) {
  const mapped = mapSellUnits(product, options.units);
  if (!mapped) return null;

  const payload: Record<string, unknown> = {
    name: product.name.trim(),
    categoryId: options.categoryId,
    baseUnitId: mapped.baseUnitId,
    isManufactured: product.isManufactured,
    minimumStock: product.minimumStock ?? 0,
    sellUnits: mapped.sellUnits,
  };

  if (product.barcode?.trim()) payload.barcode = product.barcode.trim();
  if (product.warrantyEnabled && product.warrantyQty > 0) {
    payload.warrantyQty = product.warrantyQty;
    payload.warrantyUnit = product.warrantyUnit;
    if (product.warrantyNote?.trim()) payload.warrantyNote = product.warrantyNote.trim();
  }

  const receivedDate = new Date().toISOString().slice(0, 10);
  const openingStocks: OpeningStockRow[] = Object.entries(options.branchQuantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([branchId, quantity]) => ({
      branchId,
      supplierId: product.supplierId || undefined,
      quantity,
      cost: product.cost,
      receivedDate,
    }));
  if (openingStocks.length) payload.openingStocks = openingStocks;

  return payload;
}

export function buildUpdateProductPayload(
  product: Product,
  options: {
    categoryId: string;
    units: UnitRow[];
  },
) {
  const mapped = mapSellUnits(product, options.units);
  if (!mapped) return null;

  return {
    name: product.name.trim(),
    categoryId: options.categoryId,
    minimumStock: product.minimumStock ?? 0,
    warrantyQty: product.warrantyEnabled ? product.warrantyQty : 0,
    warrantyUnit: product.warrantyUnit,
    warrantyNote: product.warrantyNote?.trim() || undefined,
    sellUnits: mapped.sellUnits,
  };
}
