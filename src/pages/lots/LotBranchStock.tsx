import { Store } from "lucide-react";
import { Badge } from "@/components/common";
import { DetailQtyDisplay } from "@/pages/products/DetailQtyDisplay";
import { formatStockQty } from "@/pages/products/productQty";
import { LOT_COPY } from "@/shared/constants/products";
import type { LotBranchAllocation } from "@/shared/domain/types";
import type { Product } from "@/shared/types";

export function LotBranchStockTable({
  rows,
  branchName,
  product,
  unitLabel,
  sessionBranchId,
}: {
  rows: LotBranchAllocation[];
  branchName: (id: string) => string;
  product?: Product;
  unitLabel: string;
  sessionBranchId?: string;
}) {
  const visible = rows.filter((row) => row.quantity > 0);
  if (!visible.length) {
    return <p className="product-detail-empty m-0">No branch stock for this lot.</p>;
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-line bg-[var(--bg)] text-left text-[10px] font-semibold uppercase tracking-wide text-sub">
            <th className="px-3 py-2 font-semibold">Branch</th>
            <th className="px-3 py-2 text-right font-semibold">Left</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.branchId} className="border-b border-line last:border-b-0">
              <td className="px-3 py-2">
                <span className="inline-flex min-w-0 items-center gap-2 font-medium text-ink">
                  <Store size={14} className="shrink-0 text-muted" aria-hidden />
                  <span className="truncate">{branchName(row.branchId)}</span>
                  {sessionBranchId && row.branchId === sessionBranchId ? (
                    <Badge tone="ok">Current</Badge>
                  ) : null}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                {product ? (
                  <DetailQtyDisplay product={product} qty={row.quantity} />
                ) : (
                  `${formatStockQty(row.quantity)} ${unitLabel}`
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LotBranchStockSection({
  rows,
  branchName,
  product,
  unitLabel,
  sessionBranchId,
}: {
  rows: LotBranchAllocation[];
  branchName: (id: string) => string;
  product?: Product;
  unitLabel: string;
  sessionBranchId?: string;
}) {
  return (
    <section className="product-detail-card">
      <header className="product-detail-card-head">
        <Store size={14} />
        <h4>{LOT_COPY.branchStockTitle}</h4>
        <span className="product-detail-card-hint">{LOT_COPY.branchStockHint}</span>
      </header>
      <LotBranchStockTable
        rows={rows}
        branchName={branchName}
        product={product}
        unitLabel={unitLabel}
        sessionBranchId={sessionBranchId}
      />
    </section>
  );
}
