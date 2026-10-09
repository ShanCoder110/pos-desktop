import {
  branchQtyBreakdown,
  displayQtyBreakdown,
  formatStockQty,
  qtyInUnit,
  productSellUnits,
  splitStockQty,
  unitLabel,
} from "@/pages/products/productQty";
import type { Product } from "@/shared/types";

function stockRow(product: Product, rows: { id: string; name: string; qty: number }[]) {
  const stockName = unitLabel(product.unit);
  return rows.find((row) => row.name === stockName) ?? rows[0];
}

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

  if (mode === "branch") {
    const { exact, whole, fractionText, parts } = branchQtyBreakdown(product, qty);
    const stockLine = (
      <span className="product-detail-qty-exact tabular-nums">
        {whole}
        {fractionText ? (
          <small className="product-detail-qty-frac">{fractionText}</small>
        ) : null}{" "}
        {exact.name}
      </span>
    );
    if (!parts.length) return stockLine;
    return (
      <span className="product-detail-qty-block">
        {stockLine}
        <small className="product-detail-qty-sub tabular-nums">
          {parts.map((row) => `${formatStockQty(row.qty)} ${row.name}`).join(" · ")}
        </small>
      </span>
    );
  }

  const units = productSellUnits(product);
  const stockUnitObj = units.find((unit) => unit.symbol === product.unit) ?? units[0];
  const parts = splitStockQty(units, product.unit, qty);
  const extra = extraUnitId ? units.find((unit) => unit.id === extraUnitId) : undefined;
  const rows = extra
    ? [
        {
          id: "stock",
          name: unitLabel(product.unit),
          qty: parts[stockUnitObj.id] ?? 0,
        },
        extra.symbol === product.unit
          ? null
          : {
              id: extra.id,
              name: extra.name || unitLabel(extra.symbol || product.unit),
              qty: (() => {
                const splitQty = parts[extra.id] ?? 0;
                return splitQty > 0 ? splitQty : qtyInUnit(units, product.unit, extra, qty);
              })(),
            },
      ].filter((row): row is { id: string; name: string; qty: number } => Boolean(row))
    : displayQtyBreakdown(product, qty).filter((row) => row.qty > 0);

  if (!rows.length) {
    return <span className="tabular-nums">0 {unitLabel(product.unit)}</span>;
  }

  const primary = extra ? rows[0] : stockRow(product, rows);
  const secondary = extra ? rows.slice(1) : rows.filter((row) => row.id !== primary.id);

  if (!secondary.length) {
    return (
      <span className="tabular-nums">
        {formatStockQty(primary.qty)} {primary.name}
      </span>
    );
  }

  return (
    <span className="product-detail-qty-block">
      <span className="tabular-nums">
        {formatStockQty(primary.qty)} {primary.name}
      </span>
      <small className="product-detail-qty-sub tabular-nums">
        {secondary.map((row) => `${formatStockQty(row.qty)} ${row.name}`).join(" · ")}
      </small>
    </span>
  );
}
