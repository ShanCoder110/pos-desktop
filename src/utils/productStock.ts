import { formatStockQty, unitLabel } from "@/pages/products/productQty";
import type { Product } from "@/shared/types";

export type ProductBranchStock = {
  branchId: string;
  branchName: string;
  quantity: number;
};

export function productBranchStockRows(product: Product): ProductBranchStock[] {
  return product.branchStock ?? [];
}

export function productTotalStock(product: Product) {
  if (product.totalStock != null) return product.totalStock;
  const rows = productBranchStockRows(product);
  if (rows.length) return rows.reduce((sum, row) => sum + row.quantity, 0);
  return product.stock;
}

export function productBranchStock(product: Product, branchId?: string) {
  if (!branchId) return product.stock;
  const row = productBranchStockRows(product).find((entry) => entry.branchId === branchId);
  return row?.quantity ?? product.stock;
}

export function branchStockTooltip(product: Product) {
  const total = productTotalStock(product);
  const rows = productBranchStockRows(product).filter((row) => row.quantity > 0);
  const unit = unitLabel(product.unit);
  if (!rows.length) return `Total: ${formatStockQty(total)} ${unit}`;
  return [
    `Total: ${formatStockQty(total)} ${unit}`,
    ...rows.map((row) => `${row.branchName}: ${formatStockQty(row.quantity)} ${unit}`),
  ].join("\n");
}

export function posStockLabel(product: Product, branchId?: string) {
  const total = productTotalStock(product);
  const branch = productBranchStock(product, branchId);
  const unit = unitLabel(product.unit);
  if (!branchId || branch === total) return `${formatStockQty(total)} ${unit}`;
  return `Here ${formatStockQty(branch)} ${unit} · Total ${formatStockQty(total)} ${unit}`;
}

/** Compact POS qty: this branch · shop total. No lot numbers. */
export function posStockCompact(product: Product, branchId?: string) {
  const total = productTotalStock(product);
  const branch = productBranchStock(product, branchId);
  if (!branchId || branch === total) return formatStockQty(total);
  return `${formatStockQty(branch)} · ${formatStockQty(total)}`;
}

export function productSellableQty(product: Product, _branchId?: string) {
  // Sales can auto-pull stock from other branches (main first) when this branch runs short.
  return productTotalStock(product);
}
