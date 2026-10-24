import type { ProductLotRow, StockTransferRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { productSellUnits, roundStockQty, toBaseQty } from "@/pages/products/productQty";
import {
  deleteTransfer,
  movedTransferQty,
  replaceReceivedRepairTransfer,
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
  const remainingByLot = new Map<string, number>();

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
      const available = remainingByLot.get(lot.id) ?? branchQty(lot, sourceBranchId);
      const quantity = roundStockQty(Math.min(remaining, available));
      if (quantity > 0) items.push({ productId: product.id, productLotId: lot.id, quantity });
      remainingByLot.set(lot.id, roundStockQty(available - quantity));
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

/** Virtually restore the original transfer while planning an atomic replacement. */
export function lotsWithRestoredRepairTransfer(
  lots: ProductLotRow[],
  transfer: StockTransferRow,
): ProductLotRow[] {
  const restoredByLot = new Map<string, number>();
  for (const item of transfer.items) {
    restoredByLot.set(
      item.productLotId,
      roundStockQty(
        (restoredByLot.get(item.productLotId) ?? 0) + movedTransferQty(item, transfer.status),
      ),
    );
  }
  return lots.map((lot) => {
    const restored = restoredByLot.get(lot.id) ?? 0;
    if (!restored) return lot;
    const allocations = [...(lot.branchAllocations ?? [])];
    const index = allocations.findIndex((row) => row.branchId === transfer.fromBranchId);
    if (index >= 0) {
      allocations[index] = {
        ...allocations[index],
        quantity: roundStockQty(allocations[index].quantity + restored),
      };
    } else {
      allocations.push({ branchId: transfer.fromBranchId, quantity: restored });
    }
    return { ...lot, branchAllocations: allocations };
  });
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

export function replaceRepairAddTransfer(params: {
  original: StockTransferRow;
  lines: RepairTransferLineMeta[];
  products: Product[];
  lots: ProductLotRow[];
}) {
  const { original, lines, products, lots } = params;
  const restoredLots = lotsWithRestoredRepairTransfer(lots, original);
  const { items, metadata } = allocateRepairItems(
    lines,
    products,
    restoredLots,
    original.fromBranchId,
  );
  return replaceReceivedRepairTransfer(original.id, {
    fromBranchId: original.fromBranchId,
    toBranchId: original.toBranchId,
    notes: encodeRepairTransfer(metadata),
    items,
  });
}
