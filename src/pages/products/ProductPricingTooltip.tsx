import type { ReactNode } from "react";
import { Tooltip } from "@/components/common";
import { ProductCostDisplay } from "@/pages/products/ProductCostDisplay";
import { priceBreakdown, qtyUnits, unitLabel } from "@/pages/products/productQty";
import { PRODUCT_COPY } from "@/shared/constants/products";
import type { Product } from "@/shared/types";
import { cn, money } from "@/utils/format";

type PriceField = "min" | "wholesale" | "price";

function unitPriceRows(product: Product, field: PriceField) {
  if (product.sellUnits?.length) {
    return qtyUnits(product.sellUnits).map((unit) => ({
      id: unit.id,
      name: unit.name || unitLabel(unit.symbol || product.unit),
      value: field === "price" ? unit.price : unit[field],
    }));
  }
  const base = {
    id: `${product.id}-base`,
    name: unitLabel(product.unit),
    value: field === "price" ? product.retail : product[field],
  };
  if (!product.packQty || product.packQty <= 1) return [base];
  return [
    {
      id: `${product.id}-pack`,
      name: "Pack",
      value:
        field === "price" && product.packPrice > 0
          ? product.packPrice
          : base.value * product.packQty,
    },
    base,
  ];
}

export function ProductPricingTooltipContent({
  product,
  stockCost,
  lineTotal,
}: {
  product: Product;
  stockCost: number;
  lineTotal?: number;
}) {
  const tiers: { label: string; field?: PriceField; fifo?: boolean }[] = [
    { label: "Cost", fifo: true },
    { label: "Minimum", field: "min" },
    { label: "Wholesale", field: "wholesale" },
    { label: "Retail", field: "price" },
  ];

  return (
    <div className="grid min-w-[190px] gap-1.5 text-left">
      {tiers.map((tier) => (
        <div key={tier.label} className="flex items-start justify-between gap-4">
          <span className="font-medium opacity-85">{tier.label}</span>
          <span className="grid justify-items-end gap-0.5 font-semibold tabular-nums text-right">
            {(tier.fifo
              ? priceBreakdown(product, stockCost)
              : unitPriceRows(product, tier.field!)
            ).map((row) => (
              <span key={row.id} className="whitespace-nowrap">
                {money(row.value)} / {row.name}
              </span>
            ))}
          </span>
        </div>
      ))}
      {lineTotal != null ? (
        <div className="flex items-start justify-between gap-4 border-t border-line pt-1.5">
          <span className="font-medium opacity-85">Line total</span>
          <span className="font-semibold tabular-nums">{money(lineTotal)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function CostBreakdownTooltip({
  product,
  stockCost,
  lineTotal,
  className,
  children,
}: {
  product: Product;
  stockCost: number;
  lineTotal?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Tooltip
      content={
        <ProductPricingTooltipContent
          product={product}
          stockCost={stockCost}
          lineTotal={lineTotal}
        />
      }
    >
      <span
        className={cn(
          "inline-flex max-w-full min-w-0 cursor-help items-center justify-end gap-1",
          className,
        )}
        title={PRODUCT_COPY.pricingHint}
      >
        {children ?? <ProductCostDisplay product={product} stockCost={stockCost} />}
      </span>
    </Tooltip>
  );
}
