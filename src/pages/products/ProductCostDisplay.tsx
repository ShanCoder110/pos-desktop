import { priceBreakdown } from "@/pages/products/productQty";
import type { Product } from "@/shared/types";
import { money } from "@/utils/format";

export function ProductCostDisplay({
  product,
  stockCost,
}: {
  product: Product;
  stockCost: number;
}) {
  return (
    <div className="product-unit-prices grid justify-items-end gap-1 [font-variant-numeric:tabular-nums]">
      {priceBreakdown(product, stockCost).map((row) => (
        <span key={row.id} className="whitespace-nowrap">
          {money(row.value)} <small className="font-medium text-muted">/ {row.name}</small>
        </span>
      ))}
    </div>
  );
}
