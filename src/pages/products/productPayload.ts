import { qtyUnits, unitLabel } from "@/pages/products/productQty";
import type { Product } from "@/shared/types";

type UnitRow = { id: string; symbol: string; name?: string };
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
  const needle = symbol.trim().toLowerCase();
  return (
    units.find((unit) => unit.symbol.toLowerCase() === needle)?.id ??
    units.find((unit) => unit.name?.toLowerCase() === needle)?.id ??
    fallbackId
  );
}

function mapSellUnits(product: Product, units: UnitRow[]) {
  const rows = qtyUnits(product.sellUnits ?? []);
  const stock =
    rows.find((unit) => unit.kind === "base") ??
    rows.find((unit) => unit.symbol === product.unit) ??
    rows.find((unit) => (unit.contains || 1) <= 1) ??
    rows[0];
  const baseSymbol = stock?.symbol ?? product.unit;
  const baseUnitId = unitIdForSymbol(baseSymbol, units, product.baseUnitId ?? "");
  if (!baseUnitId || !stock) return null;

  const mapped = rows.map((unit) => {
    const isStock = unit.id === stock.id;
    return {
      ...(unit.id?.trim() ? { id: unit.id } : {}),
      unitId: unitIdForSymbol(unit.symbol ?? baseSymbol, units, baseUnitId),
      name: unit.name || unitLabel(unit.symbol ?? baseSymbol),
      contains: isStock ? 1 : unit.contains,
      cost: unit.cost,
      min: unit.min,
      wholesale: unit.wholesale,
      price: unit.price,
      barcode: unit.barcode?.trim() || undefined,
      isBase: isStock,
      isDefault: isStock,
    };
  });

  return { baseUnitId, sellUnits: mapped };
}

export function buildCreateProductPayload(
  product: Product,
  options: {
    categoryId: string;
    units: UnitRow[];
    branchId?: string;
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
  const openingRows = (product.branchStock ?? [])
    .filter((row) => row.quantity > 0)
    .map((row) => ({
      branchId: row.branchId,
      supplierId: product.supplierId || undefined,
      quantity: row.quantity,
      cost: product.cost,
      receivedDate,
    }));

  if (openingRows.length > 1) {
    payload.openingStocks = openingRows;
  } else if (openingRows.length === 1) {
    payload.openingStock = openingRows[0];
  } else if (product.stock > 0 && options.branchId) {
    payload.openingStock = {
      branchId: options.branchId,
      supplierId: product.supplierId || undefined,
      quantity: product.stock,
      cost: product.cost,
      receivedDate,
    };
  }

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
