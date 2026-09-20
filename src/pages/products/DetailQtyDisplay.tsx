import {
  formatStockQty,
  qtyBreakdown,
  qtyInUnit,
  productSellUnits,
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
}: {
  product?: Product;
  qty: number;
  /** When set, show stock unit + this unit only (keeps After column at 2 lines). */
  extraUnitId?: string;
}) {
  if (!product) {
    return <span className="tabular-nums">{formatStockQty(qty)}</span>;
  }

  const units = productSellUnits(product);
  const extra = extraUnitId ? units.find((unit) => unit.id === extraUnitId) : undefined;
  const rows = extra
    ? [
        {
          id: "stock",
          name: unitLabel(product.unit),
          qty: qtyInUnit(
            units,
            product.unit,
            units.find((unit) => unit.symbol === product.unit) ?? units[0],
            qty,
          ),
        },
        extra.symbol === product.unit
          ? null
          : {
              id: extra.id,
              name: extra.name || unitLabel(extra.symbol || product.unit),
              qty: qtyInUnit(units, product.unit, extra, qty),
            },
      ].filter((row): row is { id: string; name: string; qty: number } => Boolean(row))
    : qtyBreakdown(product, qty).filter((row) => row.qty > 0);

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
