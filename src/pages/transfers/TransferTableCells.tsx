import { Tooltip, TruncatedTooltip } from "@/components/common";
import type { BranchStockSummary } from "@/pages/transfers/transferDetail";
import {
  transferMovedCompactLine,
  transferMovedSecondaryLine,
  transferMovedTooltipLines,
  transferStockBreakdownTooltipLines,
  transferStockCompactLine,
  transferStockHasMultiUnit,
  transferStockSecondaryLine,
} from "@/pages/transfers/transferDetail";
import type { Product } from "@/shared/types";

function TransferStockCompact({
  before,
  after,
  product,
}: {
  before: number;
  after: number;
  product?: Product;
}) {
  const primaryLine = transferStockCompactLine(before, after, product);
  const secondaryLine = product ? transferStockSecondaryLine(product, before, after) : null;
  const showTooltip = Boolean(product && transferStockHasMultiUnit(product));

  const content = product
    ? transferStockBreakdownTooltipLines(product, before, after).map((row, index) => (
        <span
          key={`${row}-${index}`}
          className={
            index % 2 === 0
              ? "block text-[10px] font-bold uppercase tracking-wide text-white/70"
              : "block"
          }
        >
          {row}
        </span>
      ))
    : null;

  const body = (
    <span className="product-detail-qty-block transfer-table-stock-compact">
      <span className="tabular-nums">{primaryLine}</span>
      {secondaryLine ? (
        <small className="product-detail-qty-sub tabular-nums">{secondaryLine}</small>
      ) : null}
    </span>
  );

  if (!showTooltip) return body;

  return (
    <Tooltip content={content}>
      <span className="cursor-help">{body}</span>
    </Tooltip>
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
  return (
    <TransferStockCompact before={summary.fromBefore} after={summary.fromAfter} product={product} />
  );
}

export function TransferToStockCell({
  summary,
  product,
}: {
  summary: BranchStockSummary | null;
  product?: Product;
}) {
  if (!summary) return <span className="text-muted">—</span>;
  return (
    <TransferStockCompact before={summary.toBefore} after={summary.toAfter} product={product} />
  );
}

export function TransferProductCell({ label }: { label: string }) {
  return (
    <TruncatedTooltip
      text={label}
      className="transfer-table-product-name text-[13px] font-semibold text-ink"
    />
  );
}

export function TransferMovedCell({ movedQty, product }: { movedQty: number; product?: Product }) {
  const primaryLine = transferMovedCompactLine(movedQty, product);
  const secondaryLine = product ? transferMovedSecondaryLine(product, movedQty) : null;
  const showTooltip = Boolean(product && transferStockHasMultiUnit(product));

  const content = product
    ? transferMovedTooltipLines(product, movedQty).map((row, index) => (
        <span
          key={`${row}-${index}`}
          className={
            index === 0
              ? "block text-[10px] font-bold uppercase tracking-wide text-white/70"
              : "block"
          }
        >
          {row}
        </span>
      ))
    : null;

  const body = (
    <span className="product-detail-qty-block transfer-table-stock-compact">
      <span className="tabular-nums font-semibold text-ink">{primaryLine}</span>
      {secondaryLine ? (
        <small className="product-detail-qty-sub tabular-nums">{secondaryLine}</small>
      ) : null}
    </span>
  );

  if (!showTooltip) return body;

  return (
    <Tooltip content={content}>
      <span className="cursor-help">{body}</span>
    </Tooltip>
  );
}
