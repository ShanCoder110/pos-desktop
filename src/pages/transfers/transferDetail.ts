import {
  formatStockQty,
  productSellUnits,
  qtyBreakdown,
  qtyInUnit,
  qtyUnits,
  unitLabel,
} from "@/pages/products/productQty";
import type { ProductLotRow, StockTransferRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { TRANSFER_COPY } from "@/shared/constants/products";
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

export function transferStockHasMultiUnit(product: Product) {
  return productSellUnits(product).length > 1;
}

function transferStockBreakdownText(product: Product, stockQty: number) {
  const rows = qtyBreakdown(product, stockQty).filter((row) => row.qty > 0);
  if (!rows.length) return `0 ${unitLabel(product.unit)}`;
  return rows.map((row) => `${formatStockQty(row.qty)} ${row.name}`).join(" · ");
}

export type TransferStockQtyPair = {
  id: string;
  name: string;
  before: number;
  after: number;
};

function transferQtyPairLine(pair: TransferStockQtyPair) {
  return `${formatStockQty(pair.before)} → ${formatStockQty(pair.after)} ${pair.name}`;
}

export function transferStockQtyPairs(
  product: Product,
  before: number,
  after: number,
): { primary: TransferStockQtyPair; secondary: TransferStockQtyPair[] } {
  const units = productSellUnits(product);
  const list = qtyUnits(units);
  const stockName = unitLabel(product.unit);
  const pairs = (list.length ? list : units).map((unit) => ({
    id: unit.id,
    name: unit.name || unitLabel(unit.symbol || product.unit),
    before: qtyInUnit(units, product.unit, unit, before),
    after: qtyInUnit(units, product.unit, unit, after),
  }));
  const primary = pairs.find((row) => row.name === stockName) ?? pairs[0];
  const secondary = pairs
    .filter((row) => row.id !== primary.id)
    .filter((row) => row.before > 0 || row.after > 0);
  return { primary, secondary };
}

export function transferStockCompactLine(before: number, after: number, product?: Product) {
  if (product) return transferQtyPairLine(transferStockQtyPairs(product, before, after).primary);
  const unit = "unit";
  return `${formatStockQty(before)} → ${formatStockQty(after)} ${unit}`;
}

export function transferStockSecondaryLine(product: Product, before: number, after: number) {
  const { secondary } = transferStockQtyPairs(product, before, after);
  if (!secondary.length) return null;
  return secondary.map(transferQtyPairLine).join(" · ");
}

export type TransferMovedQtyRow = {
  id: string;
  name: string;
  qty: number;
};

export function transferMovedQtyRows(product: Product, stockQty: number) {
  const units = productSellUnits(product);
  const list = qtyUnits(units);
  const stockName = unitLabel(product.unit);
  const rows = (list.length ? list : units).map((unit) => ({
    id: unit.id,
    name: unit.name || unitLabel(unit.symbol || product.unit),
    qty: qtyInUnit(units, product.unit, unit, stockQty),
  }));
  const primary = rows.find((row) => row.name === stockName) ?? rows[0];
  const secondary = rows.filter((row) => row.id !== primary.id && row.qty > 0);
  return { primary, secondary };
}

export function transferMovedCompactLine(movedQty: number, product?: Product) {
  if (!product) return formatStockQty(movedQty);
  const { primary } = transferMovedQtyRows(product, movedQty);
  return `${formatStockQty(primary.qty)} ${primary.name}`;
}

export function transferMovedSecondaryLine(product: Product, movedQty: number) {
  const { secondary } = transferMovedQtyRows(product, movedQty);
  if (!secondary.length) return null;
  return secondary.map((row) => `${formatStockQty(row.qty)} ${row.name}`).join(" · ");
}

export function transferMovedTooltipLines(product: Product, movedQty: number) {
  return [TRANSFER_COPY.detailMovedQty, transferStockBreakdownText(product, movedQty)];
}

/** Tooltip lines for full per-unit before/after (Products table stock-hover pattern). */
export function transferStockBreakdownTooltipLines(
  product: Product,
  before: number,
  after: number,
) {
  return [
    TRANSFER_COPY.detailBefore,
    transferStockBreakdownText(product, before),
    TRANSFER_COPY.detailAfter,
    transferStockBreakdownText(product, after),
  ];
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
