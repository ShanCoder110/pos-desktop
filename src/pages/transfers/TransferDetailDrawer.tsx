import { ArrowLeftRight, Clock, Layers, Package, Store } from "lucide-react";
import { Badge, Drawer } from "@/components/common";
import { DetailQtyDisplay } from "@/pages/products/DetailQtyDisplay";
import { formatStockQty, unitLabel } from "@/pages/products/productQty";
import { branchLotSnapshots, transferTotalMoved } from "@/pages/transfers/transferDetail";
import type { ProductLotRow, StockTransferRow, TransferStatus } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import type { BranchResponse } from "@/services/org";
import { movedTransferQty } from "@/services/transfers";
import { TRANSFER_COPY } from "@/shared/constants/products";
import { cn, formatDetailDate } from "@/utils/format";

function statusTone(status: TransferStatus) {
  if (status === "COMPLETED") return "ok" as const;
  if (status === "PENDING") return "warn" as const;
  return "danger" as const;
}

function statusLabel(status: TransferStatus) {
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  return "Pending";
}

function BranchSnapshotRow({
  branchName,
  snapshot,
  product,
  unitLabelText,
  moved,
}: {
  branchName: string;
  snapshot: { before: number; after: number };
  product?: Product;
  unitLabelText: string;
  moved: boolean;
}) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="px-3 py-2.5">
        <span className="inline-flex min-w-0 items-center gap-2 font-medium text-ink">
          <Store size={14} className="shrink-0 text-muted" aria-hidden />
          <span className="truncate">{branchName}</span>
          {moved ? <Badge tone="ok">Moved</Badge> : null}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
        {product ? (
          <DetailQtyDisplay product={product} qty={snapshot.before} />
        ) : (
          `${formatStockQty(snapshot.before)} ${unitLabelText}`
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-ink">
        {product ? (
          <DetailQtyDisplay product={product} qty={snapshot.after} />
        ) : (
          `${formatStockQty(snapshot.after)} ${unitLabelText}`
        )}
      </td>
    </tr>
  );
}

function TransferItemCard({
  transfer,
  product,
  lot,
  fromName,
  toName,
}: {
  transfer: StockTransferRow;
  product?: Product;
  lot?: ProductLotRow;
  fromName: string;
  toName: string;
}) {
  const item = transfer.items[0];
  if (!item) return null;

  const movedQty = movedTransferQty(item, transfer.status);
  const snapshots = branchLotSnapshots(transfer, lot, movedQty);
  const stockUnit = product ? unitLabel(product.unit) : "unit";

  return (
    <article className="transfer-detail-item">
      <header className="transfer-detail-item-head">
        <div className="transfer-detail-item-product">
          <span className="transfer-detail-item-icon">
            <Package size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <strong>{product?.name ?? item.productId}</strong>
            <span>{product?.sku ?? ""}</span>
          </div>
        </div>
        <div className="transfer-detail-item-moved">
          <span>{TRANSFER_COPY.detailMovedQty}</span>
          <b>
            {product ? (
              <DetailQtyDisplay product={product} qty={movedQty} />
            ) : (
              `${formatStockQty(movedQty)} ${stockUnit}`
            )}
          </b>
        </div>
      </header>

      <div className="transfer-detail-item-meta">
        <span>
          <Layers size={13} aria-hidden />
          Lot {lot?.lotNumber ?? item.productLotId}
        </span>
        <span>
          <ArrowLeftRight size={13} aria-hidden />
          {fromName} → {toName}
        </span>
      </div>

      {snapshots ? (
        <div className="transfer-detail-snapshot">
          <p className="transfer-detail-snapshot-title">{TRANSFER_COPY.detailBranchChange}</p>
          <div className="overflow-hidden rounded-[10px] border border-line">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-line bg-[var(--bg)] text-left text-[10px] font-semibold uppercase tracking-wide text-sub">
                  <th className="px-3 py-2 font-semibold">Branch</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {TRANSFER_COPY.detailBefore}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {TRANSFER_COPY.detailAfter}
                  </th>
                </tr>
              </thead>
              <tbody>
                <BranchSnapshotRow
                  branchName={fromName}
                  snapshot={snapshots.from}
                  product={product}
                  unitLabelText={stockUnit}
                  moved
                />
                <BranchSnapshotRow
                  branchName={toName}
                  snapshot={snapshots.to}
                  product={product}
                  unitLabelText={stockUnit}
                  moved
                />
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function TransferDetailDrawer({
  transfer,
  products,
  lots,
  branches,
  onClose,
}: {
  transfer: StockTransferRow | null;
  products: Product[];
  lots: ProductLotRow[];
  branches: BranchResponse[];
  onClose: () => void;
}) {
  if (!transfer) return null;

  const fromName =
    branches.find((row) => row.id === transfer.fromBranchId)?.name ?? transfer.fromBranchId;
  const toName =
    branches.find((row) => row.id === transfer.toBranchId)?.name ?? transfer.toBranchId;
  const totalMoved = transferTotalMoved(transfer);
  const singleProductId =
    transfer.items.length > 0 &&
    transfer.items.every((row) => row.productId === transfer.items[0]?.productId)
      ? transfer.items[0]?.productId
      : null;
  const primaryProduct = singleProductId
    ? products.find((row) => row.id === singleProductId)
    : undefined;
  return (
    <Drawer
      open
      size="lg"
      title={TRANSFER_COPY.viewTitle}
      subtitle={<p className="ui-drawer-subtitle">{TRANSFER_COPY.detailSubtitle}</p>}
      onClose={onClose}
    >
      <div className="product-detail transfer-detail">
        <header className="product-detail-hero entity-detail-hero">
          <div className="entity-detail-avatar is-teal">
            <ArrowLeftRight size={18} />
          </div>
          <div className="product-detail-hero-copy">
            <div className="product-detail-hero-top">
              <h3>{transfer.transferNumber || "Transfer"}</h3>
              <Badge tone={statusTone(transfer.status)}>{statusLabel(transfer.status)}</Badge>
            </div>
            <p className="entity-detail-reference">
              <span>{TRANSFER_COPY.detailRoute}</span>
              <strong>{fromName}</strong>
              <ArrowLeftRight size={13} aria-hidden />
              <strong>{toName}</strong>
            </p>
          </div>
        </header>

        <div className="transfer-detail-summary">
          <div className="transfer-detail-summary-card">
            <span>{TRANSFER_COPY.detailTotalMoved}</span>
            <strong>
              {primaryProduct ? (
                <DetailQtyDisplay product={primaryProduct} qty={totalMoved} />
              ) : (
                `${formatStockQty(totalMoved)} base units`
              )}
            </strong>
          </div>
          <div className="transfer-detail-summary-card">
            <span>{TRANSFER_COPY.detailItems}</span>
            <strong>{transfer.items.length}</strong>
          </div>
        </div>

        <section className="product-detail-card">
          <header className="product-detail-card-head">
            <Package size={14} />
            <h4>{TRANSFER_COPY.detailItems}</h4>
          </header>
          <div className="transfer-detail-items">
            {transfer.items.map((item) => {
              const product = products.find((row) => row.id === item.productId);
              const lot = lots.find((row) => row.id === item.productLotId);
              return (
                <TransferItemCard
                  key={`${item.productLotId}-${item.productId}`}
                  transfer={{ ...transfer, items: [item] }}
                  product={product}
                  lot={lot}
                  fromName={fromName}
                  toName={toName}
                />
              );
            })}
          </div>
        </section>

        {transfer.notes.trim() ? (
          <section className="product-detail-card is-plain">
            <header className="product-detail-card-head">
              <h4>{TRANSFER_COPY.notesLabel}</h4>
            </header>
            <p className="m-0 text-[13px] leading-relaxed text-ink">{transfer.notes}</p>
          </section>
        ) : null}

        <footer className={cn("entity-detail-meta is-inline", "transfer-detail-meta")}>
          <span>
            <Clock size={13} aria-hidden />
            Created {formatDetailDate(transfer.createdAt)}
          </span>
          {transfer.completedAt ? (
            <span>
              <Clock size={13} aria-hidden />
              Completed {formatDetailDate(transfer.completedAt)}
            </span>
          ) : null}
        </footer>
      </div>
    </Drawer>
  );
}
