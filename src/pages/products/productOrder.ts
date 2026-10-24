import type { Product } from "@/shared/types";

type ProductOrderFields = Pick<Product, "productNo" | "createdAt">;

/** Prefer creation time; product numbers break ties for older imported rows. */
export function compareNewestProducts(a: ProductOrderFields, b: ProductOrderFields): number {
  const aDate = Date.parse(a.createdAt ?? "") || 0;
  const bDate = Date.parse(b.createdAt ?? "") || 0;
  if (aDate !== bDate) return bDate - aDate;
  return (b.productNo ?? 0) - (a.productNo ?? 0);
}
