import type { ProductLotRow, StockTransferRow } from "@/shared/domain/types";
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
