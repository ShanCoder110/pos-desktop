import {
  formatMixedQty,
  formatStockQty,
  qtyInUnit,
  productSellUnits,
  unitLabel,
} from "@/pages/products/productQty";
import type { Product } from "@/shared/types";

export function DetailQtyDisplay({
  product,
  qty,
  extraUnitId,
  mode = "default",
}: {
  product?: Product;
  qty: number;
  /** When set, show stock unit + this unit only (keeps After column at 2 lines). */
  extraUnitId?: string;
  /** Branch panels: exact stock-unit total + split smaller units. */
  mode?: "default" | "branch";
}) {
  if (!product) {
    return <span className="tabular-nums">{formatStockQty(qty)}</span>;
  }

  const stockLine = `${formatStockQty(qty)} ${unitLabel(product.unit)}`;
  const mixed = formatMixedQty(product, qty);
  const units = productSellUnits(product);
  const extra = extraUnitId ? units.find((unit) => unit.id === extraUnitId) : undefined;
  const sub =
    extra && extra.symbol !== product.unit
      ? `${formatStockQty(qtyInUnit(units, product.unit, extra, qty))} ${extra.name || unitLabel(extra.symbol || product.unit)}`
      : mixed !== stockLine
        ? mixed
        : "";

  if (!sub) {
    return <span className="tabular-nums">{stockLine}</span>;
  }

  return (
    <span className="product-detail-qty-block">
      <span className={mode === "branch" ? "product-detail-qty-exact tabular-nums" : "tabular-nums"}>
        {stockLine}
      </span>
      <small className="product-detail-qty-sub tabular-nums">{sub}</small>
    </span>
  );
}
