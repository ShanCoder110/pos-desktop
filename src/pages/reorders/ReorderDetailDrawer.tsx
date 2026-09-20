import { Ban, Clock, Package, PackagePlus, ShoppingCart, Store } from "lucide-react";
import { Badge, DetailToolbar, DetailToolbarButton, Drawer } from "@/components/common";
import { DetailQtyDisplay } from "@/pages/products/DetailQtyDisplay";
import { CostBreakdownTooltip } from "@/pages/products/ProductPricingTooltip";
import { formatStockQty, priceBreakdown } from "@/pages/products/productQty";
import {
  REORDER_COPY,
  REORDER_STATUS_LABEL,
  type ReorderStatus,
} from "@/shared/constants/reorders";
import type { Product } from "@/shared/types";
import type { PurchaseOrder } from "@/services/purchasing";
import { cn, formatDetailDate, money } from "@/utils/format";

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "RECEIVED") return "ok";
  if (status === "PARTIALLY_RECEIVED") return "warn";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

function isOpen(row: PurchaseOrder) {
  return row.status === "PENDING" || row.status === "PARTIALLY_RECEIVED";
}

export function ReorderDetailDrawer({
  order,
  products,
  supplierName,
  branchName,
  onClose,
  onReceive,
  onCancel,
}: {
  order: PurchaseOrder | null;
  products: Product[];
  supplierName: string;
  branchName?: string;
  onClose: () => void;
  onReceive?: (row: PurchaseOrder) => void;
  onCancel?: (row: PurchaseOrder) => void;
}) {
  if (!order) return null;

  const item = order.items[0];
  const product = item ? products.find((row) => row.id === item.productId) : undefined;
  const open = isOpen(order);
  const canCancel = order.status === "PENDING" && (item?.receivedBaseQuantity ?? 0) === 0;
  const remaining = Math.max(
    0,
    (item?.orderedBaseQuantity ?? 0) - (item?.receivedBaseQuantity ?? 0),
  );

  return (
    <Drawer
      open
      size="lg"
      title={REORDER_COPY.detailTitle}
      subtitle={<p className="ui-drawer-subtitle">{REORDER_COPY.detailSubtitle}</p>}
      onClose={onClose}
    >
      <div className="product-detail transfer-detail">
        {(open && onReceive) || (canCancel && onCancel) ? (
          <DetailToolbar>
            {open && onReceive ? (
              <DetailToolbarButton
                variant="accent"
                icon={<PackagePlus size={15} />}
                onClick={() => {
                  onClose();
                  onReceive(order);
                }}
              >
                {REORDER_COPY.receiveAction}
              </DetailToolbarButton>
            ) : null}
            {canCancel && onCancel ? (
              <DetailToolbarButton
                variant="danger"
                icon={<Ban size={15} />}
                onClick={() => {
                  onClose();
                  onCancel(order);
                }}
              >
                {REORDER_COPY.cancelAction}
              </DetailToolbarButton>
            ) : null}
          </DetailToolbar>
        ) : null}

        <header className="product-detail-hero entity-detail-hero">
          <div className="entity-detail-avatar is-teal">
            <ShoppingCart size={18} />
          </div>
          <div className="product-detail-hero-copy">
            <div className="product-detail-hero-top">
              <h3>{order.orderNumber}</h3>
              <Badge tone={statusTone(order.status)}>
                {REORDER_STATUS_LABEL[order.status as ReorderStatus] ?? order.status}
              </Badge>
            </div>
            <p className="entity-detail-reference">
              <span>{REORDER_COPY.detailSupplier}</span>
              <strong>{supplierName}</strong>
            </p>
          </div>
        </header>

        <div className="transfer-detail-summary">
          <div className="transfer-detail-summary-card">
            <span>{REORDER_COPY.detailOrdered}</span>
            <strong>
              {product && item ? (
                <DetailQtyDisplay product={product} qty={item.orderedBaseQuantity} />
              ) : (
                formatStockQty(item?.orderedBaseQuantity ?? 0)
              )}
            </strong>
          </div>
          <div className="transfer-detail-summary-card">
            <span>{REORDER_COPY.detailReceived}</span>
            <strong>
              {product && item ? (
                <DetailQtyDisplay product={product} qty={item.receivedBaseQuantity} />
              ) : (
                formatStockQty(item?.receivedBaseQuantity ?? 0)
              )}
            </strong>
          </div>
          <div className="transfer-detail-summary-card">
            <span>{REORDER_COPY.detailCost}</span>
            <strong className="grid justify-items-end gap-0.5">
              {product && item ? (
                <CostBreakdownTooltip
                  product={product}
                  stockCost={item.expectedUnitCost}
                  lineTotal={order.total}
                />
              ) : (
                money(order.total)
              )}
            </strong>
          </div>
        </div>

        <section className="product-detail-card">
          <header className="product-detail-card-head">
            <Package size={14} />
            <h4>{REORDER_COPY.detailItems}</h4>
          </header>
          <div className="transfer-detail-items">
            {order.items.map((line) => {
              const lineProduct = products.find((row) => row.id === line.productId);
              const lineRemaining = Math.max(
                0,
                line.orderedBaseQuantity - line.receivedBaseQuantity,
              );
              return (
                <article key={line.id} className="transfer-detail-item">
                  <header className="transfer-detail-item-head">
                    <div className="transfer-detail-item-product">
                      <span className="transfer-detail-item-icon">
                        <Package size={16} aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <strong>{lineProduct?.name ?? line.productId}</strong>
                        <span>{line.unitName}</span>
                      </div>
                    </div>
                    <div className="transfer-detail-item-moved">
                      <span>{REORDER_COPY.detailOrdered}</span>
                      <b>
                        {lineProduct ? (
                          <DetailQtyDisplay product={lineProduct} qty={line.orderedBaseQuantity} />
                        ) : (
                          formatStockQty(line.orderedBaseQuantity)
                        )}
                      </b>
                    </div>
                  </header>
                  <div className="transfer-detail-item-meta">
                    <span>
                      {REORDER_COPY.detailReceived}{" "}
                      {lineProduct ? (
                        <DetailQtyDisplay product={lineProduct} qty={line.receivedBaseQuantity} />
                      ) : (
                        formatStockQty(line.receivedBaseQuantity)
                      )}
                    </span>
                    {open && lineRemaining > 0 ? (
                      <span>
                        Remaining{" "}
                        {lineProduct ? (
                          <DetailQtyDisplay product={lineProduct} qty={lineRemaining} />
                        ) : (
                          formatStockQty(lineRemaining)
                        )}
                      </span>
                    ) : null}
                    <span>
                      Unit cost{" "}
                      {lineProduct
                        ? priceBreakdown(lineProduct, line.expectedUnitCost)
                            .map((row) => `${money(row.value)} / ${row.name}`)
                            .join(" · ")
                        : money(line.expectedUnitCost)}
                    </span>
                    <span>Line total {money(line.lineTotal)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {order.notes?.trim() ? (
          <section className="product-detail-card is-plain">
            <header className="product-detail-card-head">
              <h4>Notes</h4>
            </header>
            <p className="m-0 text-[13px] leading-relaxed text-ink">{order.notes}</p>
          </section>
        ) : null}

        <footer className={cn("entity-detail-meta is-inline", "transfer-detail-meta")}>
          {branchName ? (
            <span>
              <Store size={13} aria-hidden />
              {branchName}
            </span>
          ) : null}
          <span>
            <Clock size={13} aria-hidden />
            {REORDER_COPY.detailOrderDate} {order.orderDate}
          </span>
          {order.expectedDate ? (
            <span>
              <Clock size={13} aria-hidden />
              {REORDER_COPY.detailExpectedDate} {order.expectedDate}
            </span>
          ) : null}
          {order.completedAt ? (
            <span>
              <Clock size={13} aria-hidden />
              Completed {formatDetailDate(order.completedAt)}
            </span>
          ) : null}
          {open && remaining > 0 && product && item ? (
            <span>
              <PackagePlus size={13} aria-hidden />
              {remaining > 0 ? (
                <>
                  Remaining <DetailQtyDisplay product={product} qty={remaining} />
                </>
              ) : null}
            </span>
          ) : null}
        </footer>
      </div>
    </Drawer>
  );
}
