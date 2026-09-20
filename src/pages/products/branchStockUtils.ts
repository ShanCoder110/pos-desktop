import type { LotBranchRow } from "@/pages/lots/LotBranchFields";
import type { ProductBranchStock } from "@/shared/types";

type BranchRow = { id: string; name: string };

const STOCK_EPS = 1e-6;

export function preciseStockQty(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Set one branch qty; optionally pull the excess from the branch with most stock. */
export function rebalanceBranchQuantity(
  rows: LotBranchRow[],
  branchId: string,
  requestedQty: number,
  totalQty: number,
  autoPull: boolean,
): LotBranchRow[] {
  const total = preciseStockQty(totalQty);
  let next = Math.max(0, preciseStockQty(requestedQty));
  next = Math.min(next, total);

  const others = rows.filter((row) => row.branchId !== branchId);
  const otherSum = others.reduce((sum, row) => sum + row.quantity, 0);
  const freePool = preciseStockQty(total - otherSum);

  if (!autoPull || rows.length < 2) {
    next = Math.min(next, Math.max(0, freePool));
    return rows.map((row) =>
      row.branchId === branchId ? { ...row, quantity: next, selected: next > STOCK_EPS } : row,
    );
  }

  const donor = [...others].sort((a, b) => b.quantity - a.quantity)[0];
  const maxAchievable = preciseStockQty(freePool + (donor?.quantity ?? 0));
  next = Math.min(next, maxAchievable);

  if (next <= freePool + STOCK_EPS) {
    return rows.map((row) =>
      row.branchId === branchId ? { ...row, quantity: next, selected: next > STOCK_EPS } : row,
    );
  }

  const pull = preciseStockQty(next - freePool);
  return rows.map((row) => {
    if (row.branchId === branchId) {
      return { ...row, quantity: next, selected: next > STOCK_EPS };
    }
    if (donor && row.branchId === donor.branchId) {
      const quantity = preciseStockQty(Math.max(0, row.quantity - pull));
      return { ...row, quantity, selected: quantity > STOCK_EPS };
    }
    return row;
  });
}

export function mergeBranchStock(
  branches: BranchRow[],
  rows: ProductBranchStock[] = [],
): ProductBranchStock[] {
  return branches.map((branch) => {
    const row = rows.find((entry) => entry.branchId === branch.id);
    return {
      branchId: branch.id,
      branchName: branch.name,
      quantity: row?.quantity ?? 0,
    };
  });
}

export function branchStockToLotRows(rows: ProductBranchStock[]): LotBranchRow[] {
  return rows.map((row) => ({
    branchId: row.branchId,
    branchName: row.branchName,
    selected: row.quantity > 0,
    quantity: row.quantity,
  }));
}

export function lotRowsToBranchStock(rows: LotBranchRow[]): ProductBranchStock[] {
  return rows.map((row) => ({
    branchId: row.branchId,
    branchName: row.branchName,
    quantity: row.quantity,
  }));
}
