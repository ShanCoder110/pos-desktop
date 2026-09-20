import { DetailQtyDisplay } from "@/pages/products/DetailQtyDisplay";
import { formatStockQty, unitLabel } from "@/pages/products/productQty";
import type { BranchStockSummary } from "@/pages/transfers/transferDetail";
import type { Product } from "@/shared/types";
import { TRANSFER_COPY } from "@/shared/constants/products";

function QtyPair({ before, after, product }: { before: number; after: number; product?: Product }) {
  const unit = product ? unitLabel(product.unit) : "unit";
  return (
    <div className="transfer-table-qty">
      <span className="transfer-table-qty-line">
        <em>{TRANSFER_COPY.detailBefore}</em>
        {product ? (
          <DetailQtyDisplay product={product} qty={before} />
        ) : (
          <b>
            {formatStockQty(before)} {unit}
          </b>
        )}
      </span>
      <span className="transfer-table-qty-line is-after">
        <em>{TRANSFER_COPY.detailAfter}</em>
        {product ? (
          <DetailQtyDisplay product={product} qty={after} />
        ) : (
          <b>
            {formatStockQty(after)} {unit}
          </b>
        )}
      </span>
    </div>
  );
}

export function TransferFromStockCell({
  summary,
  product,
}: {
  summary: BranchStockSummary | null;
  product?: Product;
}) {
  if (!summary) return <span className="text-muted">—</span>;
  return <QtyPair before={summary.fromBefore} after={summary.fromAfter} product={product} />;
}

export function TransferToStockCell({
  summary,
  product,
}: {
  summary: BranchStockSummary | null;
  product?: Product;
}) {
  if (!summary) return <span className="text-muted">—</span>;
  return <QtyPair before={summary.toBefore} after={summary.toAfter} product={product} />;
}

export function TransferProductCell({
  label,
  movedQty,
  product,
}: {
  label: string;
  movedQty: number;
  product?: Product;
}) {
  return (
    <div className="transfer-table-product">
      <strong className="transfer-table-product-name">{label}</strong>
      <span className="transfer-table-product-moved">
        {TRANSFER_COPY.detailMovedQty}{" "}
        {product ? (
          <DetailQtyDisplay product={product} qty={movedQty} />
        ) : (
          <b>{formatStockQty(movedQty)}</b>
        )}
      </span>
    </div>
  );
}
