import type { Product } from "@/shared/types";

/** Search adds missing hits; saved hub records remain authoritative. */
export function mergeProductSearchRows(rows: Product[], searchRows: Product[]) {
  const merged = new Map(searchRows.map((product) => [product.id, product]));
  rows.forEach((product) => merged.set(product.id, product));
  return [...merged.values()];
}
