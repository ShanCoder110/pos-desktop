import type { RepairResponse } from "@/services/repairs";
import type { InvoiceRow } from "@/shared/domain/types";
import type { ProductInsightMetric } from "@/shared/constants/products";
import { money } from "@/utils/format";
import { formatStockQty } from "@/pages/products/productQty";
import type { Product } from "@/shared/types";

export type ProductSalesStats = {
  quantity: number;
  sales: number;
  profit: number;
};

export function emptyProductSalesStats(): ProductSalesStats {
  return { quantity: 0, sales: 0, profit: 0 };
}

export function buildProductSalesStats(
  products: Pick<Product, "id" | "cost">[],
  invoices: InvoiceRow[],
  repairs: RepairResponse[] = [],
) {
  const map = new Map<string, ProductSalesStats>();
  const costById = new Map(products.map((product) => [product.id, product.cost]));

  function add(productId: string, sales: number, quantity: number) {
    const stats = map.get(productId) ?? emptyProductSalesStats();
    const cost = costById.get(productId) ?? 0;
    stats.sales += sales;
    stats.quantity += quantity;
    stats.profit += sales - quantity * cost;
    map.set(productId, stats);
  }

  for (const invoice of invoices) {
    if (invoice.status !== "COMPLETED") continue;
    for (const item of invoice.items) add(item.productId, item.total, item.baseQuantity);
  }

  for (const job of repairs) {
    for (const part of job.parts) add(part.productId, part.lineTotal, part.baseQuantity);
  }

  return map;
}

export function productSalesStats(productId: string, stats: Map<string, ProductSalesStats>) {
  return stats.get(productId) ?? emptyProductSalesStats();
}

export function insightMetricValue(
  product: Product,
  stats: ProductSalesStats,
  metric: ProductInsightMetric,
) {
  if (metric === "sales") return stats.sales;
  if (metric === "profit") return stats.profit;
  if (metric === "quantity") return stats.quantity;
  if (metric === "averagePrice") return stats.quantity > 0 ? stats.sales / stats.quantity : 0;
  if (metric === "cost") return stats.quantity * product.cost;
  return stats.sales > 0 ? (stats.profit / stats.sales) * 100 : 0;
}

export function insightMetricLabel(metric: ProductInsightMetric) {
  if (metric === "sales") return "Sales revenue by product";
  if (metric === "profit") return "Profit by product";
  if (metric === "quantity") return "Quantity sold";
  if (metric === "averagePrice") return "Average selling price";
  if (metric === "cost") return "Cost of goods sold";
  return "Profit margin";
}

export function formatInsightMetricValue(metric: ProductInsightMetric, value: number) {
  if (metric === "quantity") return formatStockQty(value);
  if (metric === "margin") return `${value.toFixed(1)}%`;
  return money(value);
}

export function insightMetricDetails(product: Product, stats: ProductSalesStats) {
  const averagePrice = stats.quantity > 0 ? stats.sales / stats.quantity : 0;
  const margin = stats.sales > 0 ? (stats.profit / stats.sales) * 100 : 0;
  return [
    { label: "Profit", value: money(stats.profit) },
    { label: "Total sales", value: money(stats.sales) },
    { label: "Quantity sold", value: formatStockQty(stats.quantity) },
    { label: "Average price", value: money(averagePrice) },
    { label: "Margin", value: `${margin.toFixed(1)}%` },
    { label: "Stock value", value: money(product.stock * product.cost) },
  ];
}
