import {
  canonicalUnit,
  conversionFactor,
  isSubdivisionSymbol,
  preferredUnit,
  qtyUnits,
  unitLabel,
} from "@/pages/products/productQty";
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

/**
 * Inventory `is_base` / `baseUnitId` = canonical unit (factor 1).
 * UI preferred base = `isDefault` only — does not redefine conversions.
 */
function mapSellUnits(product: Product, units: UnitRow[]) {
  const rows = qtyUnits(product.sellUnits ?? []);
  const inventory = canonicalUnit(rows) ?? rows[0];
  const preferred = preferredUnit(rows) ?? inventory;
  if (!inventory) return null;

  const inventorySymbol = inventory.symbol ?? product.unit;
  const baseUnitId = unitIdForSymbol(inventorySymbol, units, product.baseUnitId ?? "");
  if (!baseUnitId) return null;

  const mapped = rows.map((unit) => {
    const isInventory = unit.id === inventory.id;
    const isPreferred = unit.id === preferred.id;
    return {
      ...(unit.id?.trim() ? { id: unit.id } : {}),
      unitId: unitIdForSymbol(unit.symbol ?? inventorySymbol, units, baseUnitId),
      name: unit.name || unitLabel(unit.symbol ?? inventorySymbol),
      contains: isInventory ? 1 : conversionFactor(unit),
      factorDirection: isInventory
        ? "multiply"
        : (unit.factorDirection ??
          (isSubdivisionSymbol(unit.symbol) && conversionFactor(unit) > 1 ? "divide" : "multiply")),
      cost: unit.cost,
      min: unit.min,
      wholesale: unit.wholesale,
      price: unit.price,
      barcode: unit.barcode?.trim() || undefined,
      isBase: isInventory,
      isDefault: isPreferred,
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

  const inventory = canonicalUnit(product.sellUnits ?? []);
  const openingCost = inventory?.cost ?? product.cost;

  const payload: Record<string, unknown> = {
    name: product.name.trim(),
    categoryId: options.categoryId,
    baseUnitId: mapped.baseUnitId,
    isManufactured: product.isManufactured,
    minimumStock: product.minimumStock ?? 0,
    sellUnits: mapped.sellUnits,
  };

  const sku = product.sku?.trim();
  if (sku) payload.sku = sku;
  if (product.barcode?.trim()) payload.barcode = product.barcode.trim();
  if (product.warrantyEnabled && product.warrantyQty > 0) {
    payload.warrantyQty = product.warrantyQty;
    payload.warrantyUnit = product.warrantyUnit;
    if (product.warrantyNote?.trim()) payload.warrantyNote = product.warrantyNote.trim();
  }

  const receivedDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const openingRows = (product.branchStock ?? [])
    .filter((row) => row.quantity > 0)
    .map((row) => ({
      branchId: row.branchId,
      supplierId: product.supplierId || undefined,
      quantity: row.quantity,
      cost: openingCost,
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
      cost: openingCost,
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

  const payload: Record<string, unknown> = {
    name: product.name.trim(),
    categoryId: options.categoryId,
    minimumStock: product.minimumStock ?? 0,
    warrantyQty: product.warrantyEnabled ? product.warrantyQty : 0,
    warrantyUnit: product.warrantyUnit,
    warrantyNote: product.warrantyNote?.trim() || undefined,
    sellUnits: mapped.sellUnits,
  };
  // Always send sku on update so owner/manager can change it; cashiers get 403 from API.
  payload.sku = product.sku?.trim() ?? "";
  return payload;
}
