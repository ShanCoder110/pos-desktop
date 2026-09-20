import { PRODUCT_COPY } from "@/shared/constants/products";
import { cn, money } from "@/utils/format";

export function ProductUnitMargin({ cost, retail }: { cost: number; retail: number }) {
  const profit = retail - cost;
  const pct = cost > 0 ? (profit / cost) * 100 : 0;
  const healthy = profit >= 0;

  return (
    <p
      className={cn(
        "product-unit-margin m-0 text-[11px] font-semibold tabular-nums",
        healthy ? "text-[var(--sale)]" : "text-[var(--danger)]",
      )}
    >
      {PRODUCT_COPY.unitProfit}: {money(profit)}
      <span className="font-medium text-muted"> · </span>
      {healthy ? "+" : ""}
      {pct.toFixed(1)}%
    </p>
  );
}
