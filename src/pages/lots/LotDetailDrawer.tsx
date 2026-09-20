import { useEffect, useState } from "react";
import { Clock, Layers, Package, Pencil, Receipt, ShoppingCart } from "lucide-react";
import { Button, DetailToolbar, DetailToolbarButton, Drawer } from "@/components/common";
import { LotBranchStockSection } from "@/pages/lots/LotBranchStock";
import { DetailQtyDisplay } from "@/pages/products/DetailQtyDisplay";
import { ensureSession } from "@/services/auth";
import { lotUnitPricing, ProductUnitPricingList } from "@/pages/products/ProductUnitPricingCard";
import {
  formatLinkedQty,
  formatStockQty,
  lotCostInStockUnit,
  productBasePricing,
  unitLabel,
} from "@/pages/products/productQty";
import { LOT_COPY, PRODUCT_COPY } from "@/shared/constants/products";
import { REORDER_COPY } from "@/shared/constants/reorders";
import type { ProductLotRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { listAllBranches, type BranchResponse } from "@/services/org";
import { cn, formatDetailDate, money } from "@/utils/format";

function shortDate(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function LotDetailDrawer({
  lot,
  product,
  supplierLabel,
  onClose,
  onEdit,
  onReorder,
  onUnlink,
}: {
  lot: ProductLotRow | null;
  product?: Product;
  supplierLabel?: string;
  onClose: () => void;
  onEdit: (row: ProductLotRow) => void;
  onReorder: (productId: string) => void;
  onUnlink?: (lot: ProductLotRow) => void;
}) {
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [sessionBranchId, setSessionBranchId] = useState("");

  useEffect(() => {
    if (!lot) return;
    const controller = new AbortController();
    void Promise.all([listAllBranches(controller.signal), ensureSession(controller.signal)])
      .then(([branchRows, session]) => {
        setBranches(branchRows);
        setSessionBranchId(session?.branchId ?? "");
      })
      .catch(() => {
        setBranches([]);
        setSessionBranchId("");
      });
    return () => controller.abort();
  }, [lot?.id]);

  if (!lot) return null;

  const stockUnit = product ? unitLabel(product.unit) : "unit";
  const branchName = (id: string) => branches.find((row) => row.id === id)?.name ?? id;
  const branchRows = lot.branchAllocations ?? [];
  const fifoCost = product ? lotCostInStockUnit(product, lot.purchasePrice) : lot.purchasePrice;
  const stockValue = lot.remainingQuantity * fifoCost;
  const empty = lot.remainingQuantity <= 0;
  const sold = Math.max(0, lot.originalQuantity - lot.remainingQuantity - lot.damagedQuantity);
  const { retail } = product ? productBasePricing(product) : { retail: 0 };

  return (
    <Drawer
      open
      size="lg"
      title={LOT_COPY.detailTitle}
      subtitle={<p className="ui-drawer-subtitle">{LOT_COPY.detailSubtitle}</p>}
      onClose={onClose}
    >
      <div className="product-detail">
        <DetailToolbar>
          <DetailToolbarButton
            variant="edit"
            icon={<Pencil size={15} />}
            onClick={() => {
              onClose();
              onEdit(lot);
            }}
          >
            {LOT_COPY.editAction}
          </DetailToolbarButton>
          <DetailToolbarButton
            variant="accent"
            icon={<ShoppingCart size={15} />}
            onClick={() => {
              onClose();
              onReorder(lot.productId);
            }}
          >
            {LOT_COPY.reorderAction}
          </DetailToolbarButton>
        </DetailToolbar>

        <header className="product-detail-hero entity-detail-hero">
          <div className="entity-detail-avatar is-teal">
            <Layers size={18} />
          </div>
          <div className="product-detail-hero-copy">
            <div className="product-detail-hero-top">
              <h3>{lot.lotNumber}</h3>
              <span className={cn("ui-chip is-soft", empty && "is-danger")}>
                {empty ? "Empty" : "Open"}
              </span>
            </div>
            <p className="product-detail-hero-meta">
              {product?.name ?? lot.productId}
              {supplierLabel ? ` · ${supplierLabel}` : ""}
            </p>
          </div>
        </header>
        {lot.purchaseOrderNumber ? (
          <div className="mb-3 flex items-center justify-between rounded-[10px] border border-line px-3 py-2 text-[12px]">
            <span>
              Linked to reorder {lot.purchaseOrderNumber}
              {lot.purchaseOrderStatus ? ` · ${lot.purchaseOrderStatus}` : ""}
            </span>
            {onUnlink ? (
              <Button size="sm" onClick={() => onUnlink(lot)}>
                {REORDER_COPY.unlinkAction}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="product-detail-stats is-quad">
          <article className={cn("product-detail-stat", empty ? "is-danger" : "is-ok")}>
            <span>Left</span>
            <strong>
              <DetailQtyDisplay product={product} qty={lot.remainingQuantity} />
            </strong>
            <small>
              {product
                ? `of ${formatLinkedQty(product, lot.originalQuantity)}`
                : `of ${formatStockQty(lot.originalQuantity)} ${stockUnit}`}
            </small>
          </article>
          <article className="product-detail-stat">
            <span>FIFO cost</span>
            <strong>{money(fifoCost)}</strong>
            <small>per {stockUnit}</small>
          </article>
          <article className="product-detail-stat">
            <span>Stock value</span>
            <strong>{money(stockValue)}</strong>
            <small>Left × cost</small>
          </article>
          <article className="product-detail-stat is-ok">
            <span>Sold</span>
            <strong>
              <DetailQtyDisplay product={product} qty={sold} />
            </strong>
            <small>
              {sold > 0 && product ? `Profit ${money(sold * (retail - fifoCost))}` : "No sales yet"}
            </small>
          </article>
        </div>

        <section className="product-detail-card">
          <header className="product-detail-card-head">
            <Package size={14} />
            <h4>Lot info</h4>
          </header>
          <dl className="product-detail-facts is-strong">
            <div>
              <dt>Received</dt>
              <dd>{shortDate(lot.receivedAt)}</dd>
            </div>
            <div>
              <dt>Expiry</dt>
              <dd>{lot.expiryDate ? shortDate(lot.expiryDate) : "—"}</dd>
            </div>
            <div>
              <dt>Original qty</dt>
              <dd>
                <DetailQtyDisplay product={product} qty={lot.originalQuantity} />
              </dd>
            </div>
            <div>
              <dt>Damaged</dt>
              <dd>
                <DetailQtyDisplay product={product} qty={lot.damagedQuantity} />
              </dd>
            </div>
          </dl>
        </section>

        <LotBranchStockSection
          rows={branchRows}
          branchName={branchName}
          product={product}
          unitLabel={stockUnit}
          sessionBranchId={sessionBranchId}
        />

        {product ? (
          <section className="product-detail-card">
            <header className="product-detail-card-head">
              <Receipt size={14} />
              <h4>{PRODUCT_COPY.detailUnitsTitle}</h4>
              <span className="product-detail-card-hint">{PRODUCT_COPY.detailVsCost}</span>
            </header>
            <ProductUnitPricingList units={lotUnitPricing(product, fifoCost)} />
          </section>
        ) : null}

        {lot.createdAt || lot.updatedAt ? (
          <p className="product-detail-stamp">
            <Clock size={13} aria-hidden />
            {[
              lot.createdAt ? `Created ${formatDetailDate(lot.createdAt)}` : null,
              lot.updatedAt ? `Updated ${formatDetailDate(lot.updatedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
