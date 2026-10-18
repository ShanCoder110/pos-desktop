import type { ProductLotRow, StockTransferRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { productSellUnits, roundStockQty, toBaseQty } from "@/pages/products/productQty";
import {
  createTransfer,
  deleteTransfer,
  receiveTransfer,
  sendTransfer,
} from "@/services/transfers";
import {
  decodeRepairVoid,
  encodeRepairTransfer,
  type RepairTransferLineMeta,
} from "./repairShopTransfer";

function branchQty(lot: ProductLotRow, branchId: string) {
  return lot.branchAllocations?.find((row) => row.branchId === branchId)?.quantity ?? 0;
}

function unitFor(product: Product, unitId: string) {
  const units = productSellUnits(product);
  return (
    units.find((unit) => unit.id === unitId) ?? units.find((unit) => unit.isDefault) ?? units[0]
  );
}

export function allocateRepairItems(
  lines: RepairTransferLineMeta[],
  products: Product[],
  lots: ProductLotRow[],
  sourceBranchId: string,
) {
  const items: { productId: string; productLotId: string; quantity: number }[] = [];
  const metadata: RepairTransferLineMeta[] = [];

  for (const line of lines) {
    const product = products.find((row) => row.id === line.productId);
    const unit = product ? unitFor(product, line.unitId) : undefined;
    if (!product || !unit) {
      throw new Error("A product on this record is no longer available.");
    }
    const baseQuantity = roundStockQty(toBaseQty(productSellUnits(product), unit, line.quantity));
    let remaining = baseQuantity;
    const fifoLots = lots
      .filter((lot) => lot.productId === product.id && branchQty(lot, sourceBranchId) > 0)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    for (const lot of fifoLots) {
      const quantity = roundStockQty(Math.min(remaining, branchQty(lot, sourceBranchId)));
      if (quantity > 0) items.push({ productId: product.id, productLotId: lot.id, quantity });
      remaining = roundStockQty(remaining - quantity);
      if (remaining <= 0) break;
    }
    if (remaining > 1e-6) {
      throw new Error(`Not enough stock for ${product.name}.`);
    }
    metadata.push({
      ...line,
      unitName: unit.name || product.unit,
      baseQuantity,
      unitCost: unit.cost,
    });
  }

  return { items, metadata };
}

/** Drop stuck reverse/void transfers first, then permanently delete the record. */
export async function permanentlyDeleteRepairTransfer(
  transfer: StockTransferRow,
  allTransfers: StockTransferRow[],
) {
  const stuckVoids = allTransfers.filter((row) => decodeRepairVoid(row.notes) === transfer.id);
  for (const stuck of stuckVoids) {
    await deleteTransfer(stuck.id);
  }
  await deleteTransfer(transfer.id);
}

export async function createRepairAddTransfer(params: {
  sourceBranchId: string;
  repairBranchId: string;
  lines: RepairTransferLineMeta[];
  products: Product[];
  lots: ProductLotRow[];
}) {
  const { sourceBranchId, repairBranchId, lines, products, lots } = params;
  if (!lines.length) return null;
  const { items, metadata } = allocateRepairItems(lines, products, lots, sourceBranchId);
  const created = await createTransfer({
    fromBranchId: sourceBranchId,
    toBranchId: repairBranchId,
    notes: encodeRepairTransfer(metadata),
    items,
  });
  await sendTransfer(created.id);
  await receiveTransfer(created.id);
  return created;
}
