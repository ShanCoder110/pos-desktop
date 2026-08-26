import type { ProductLotRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { emptyPrices } from "@/pages/products/productQty";

export function blankProduct(): Product {
  return {
    id: crypto.randomUUID(),
    sku: "",
    name: "",
    barcode: "",
    category: "",
    unit: "pc",
    supplierId: "",
    minimumStock: 0,
    isLinear: false,
    isManufactured: false,
    packQty: null,
    packPrice: 0,
    cost: 0,
    min: 0,
    wholesale: 0,
    retail: 0,
    warrantyEnabled: false,
    warrantyQty: 0,
    warrantyUnit: "months",
    warrantyDays: 0,
    warrantyNote: "",
    claims: 0,
    damaged: 0,
    stock: 0,
    components: [],
    sellUnits: [
      {
        id: crypto.randomUUID(),
        name: "Piece",
        symbol: "pc",
        kind: "base",
        contains: 1,
        ...emptyPrices(),
        barcode: "",
        priceManual: {},
      },
    ],
  };
}

export function nextLotNumber(lots: ProductLotRow[]) {
  const nums = lots.map((l) => Number(String(l.lotNumber).replace(/\D/g, ""))).filter((n) => Number.isFinite(n));
  const n = Math.max(2400, ...nums, 0) + 1;
  return `L-${String(n).padStart(4, "0")}`;
}

export function openingLot(product: Product, lots: ProductLotRow[]): ProductLotRow {
  const qty = Math.max(0, product.stock);
  return {
    id: crypto.randomUUID(),
    productId: product.id,
    supplierId: product.supplierId ?? "",
    lotNumber: nextLotNumber(lots),
    purchasePrice: product.cost,
    originalQuantity: qty,
    remainingQuantity: qty,
    damagedQuantity: 0,
    receivedAt: new Date().toISOString().slice(0, 10),
    expiryDate: null,
    createdBy: "u1",
  };
}

export function fifoLots(lots: ProductLotRow[]) {
  return lots
    .filter((l) => l.remainingQuantity > 0)
    .slice()
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.lotNumber.localeCompare(b.lotNumber));
}

export function fifoLot(lots: ProductLotRow[]) {
  return fifoLots(lots)[0] ?? null;
}

export function lotTotals(lots: ProductLotRow[]) {
  return {
    stock: lots.reduce((s, l) => s + l.remainingQuantity, 0),
    damaged: lots.reduce((s, l) => s + l.damagedQuantity, 0),
  };
}

export function setLotQty(lot: ProductLotRow, remaining: number): ProductLotRow {
  const cap = Math.max(0, lot.originalQuantity - lot.damagedQuantity);
  return { ...lot, remainingQuantity: Math.min(Math.max(0, remaining), cap) };
}

export function setLotDamage(lot: ProductLotRow, damaged: number): ProductLotRow {
  const maxDamage = lot.damagedQuantity + lot.remainingQuantity;
  const next = Math.min(Math.max(0, damaged), maxDamage);
  return {
    ...lot,
    damagedQuantity: next,
    remainingQuantity: lot.remainingQuantity - (next - lot.damagedQuantity),
  };
}

export function syncProductStock(products: Product[], lots: ProductLotRow[], productId: string): Product[] {
  const totals = lotTotals(lots.filter((l) => l.productId === productId));
  return products.map((p) => (p.id === productId ? { ...p, stock: totals.stock, damaged: totals.damaged } : p));
}
