import type { ProductLotRow, StockTransferRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { movedTransferQty } from "@/services/transfers";

export function lotBranchQty(lot: ProductLotRow | undefined, branchId: string) {
  if (!lot) return 0;
  return lot.branchAllocations?.find((row) => row.branchId === branchId)?.quantity ?? 0;
}

export type BranchLotSnapshot = {
  before: number;
  after: number;
};

export function branchLotSnapshots(
  transfer: StockTransferRow,
  lot: ProductLotRow | undefined,
  movedQty: number,
): { from: BranchLotSnapshot; to: BranchLotSnapshot } | null {
  if (!lot || movedQty <= 0) return null;

  const fromCurrent = lotBranchQty(lot, transfer.fromBranchId);
  const toCurrent = lotBranchQty(lot, transfer.toBranchId);

  if (transfer.status === "COMPLETED") {
    return {
      from: { before: fromCurrent + movedQty, after: fromCurrent },
      to: { before: toCurrent - movedQty, after: toCurrent },
    };
  }

  if (transfer.status === "PENDING") {
    return {
      from: { before: fromCurrent, after: fromCurrent - movedQty },
      to: { before: toCurrent, after: toCurrent + movedQty },
    };
  }

  return null;
}

export function transferTotalMoved(transfer: StockTransferRow) {
  return transfer.items.reduce((sum, item) => sum + movedTransferQty(item, transfer.status), 0);
}

export type BranchStockSummary = {
  fromBefore: number;
  fromAfter: number;
  toBefore: number;
  toAfter: number;
};

/** Sum lot-level before/after snapshots across all items on a transfer. */
export function transferBranchStockSummary(
  transfer: StockTransferRow,
  lots: ProductLotRow[],
): BranchStockSummary | null {
  let fromBefore = 0;
  let fromAfter = 0;
  let toBefore = 0;
  let toAfter = 0;
  let found = false;

  for (const item of transfer.items) {
    const lot = lots.find((row) => row.id === item.productLotId);
    const moved = movedTransferQty(item, transfer.status);
    const snap = branchLotSnapshots(transfer, lot, moved);
    if (!snap) continue;
    found = true;
    fromBefore += snap.from.before;
    fromAfter += snap.from.after;
    toBefore += snap.to.before;
    toAfter += snap.to.after;
  }

  return found ? { fromBefore, fromAfter, toBefore, toAfter } : null;
}

export function transferProductLabel(transfer: StockTransferRow, products: Product[]) {
  const names = transfer.items
    .map((item) => products.find((row) => row.id === item.productId)?.name)
    .filter(Boolean) as string[];
  if (!names.length) return "—";
  const unique = [...new Set(names)];
  if (unique.length === 1) return unique[0];
  return `${unique[0]} +${unique.length - 1}`;
}
