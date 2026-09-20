import { useEffect, useState } from "react";
import { Clock, Factory, Layers, Package, Pencil, Receipt, Store, Tags } from "lucide-react";
import { DetailToolbar, DetailToolbarButton, Drawer } from "@/components/common";
import { DetailQtyDisplay } from "@/pages/products/DetailQtyDisplay";
import { ProductUnitPricingList } from "@/pages/products/ProductUnitPricingCard";
import {
  baseUnit,
  formatStockQty,
  lotCostInStockUnit,
  priceBreakdown,
  productBasePricing,
  qtyUnits,
  unitLabel,
} from "@/pages/products/productQty";
import { PRODUCT_COPY } from "@/shared/constants/products";
import type { ProductLotRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { ensureSession } from "@/services/auth";
import { cn, formatDetailDate, money } from "@/utils/format";
import { productBranchStockRows, productTotalStock } from "@/utils/productStock";

function compactAmount(n: number) {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return Math.abs(rounded).toLocaleString("en-PK");
  return Math.abs(rounded).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function compactRs(n: number) {
  return `${n < 0 ? "−" : ""}Rs ${compactAmount(n)}`;
}

function retailDisplay(product: Product) {
  const units = product.sellUnits?.length ? qtyUnits(product.sellUnits) : [];
  const stockUnitObj = units.find((u) => u.symbol === product.unit) ?? baseUnit(units);
  const mainRetail = stockUnitObj?.price ?? productBasePricing(product).retail;
  const otherUnits = units.filter((u) => u.id !== stockUnitObj?.id);
  const sub =
    otherUnits.length > 0
      ? otherUnits
          .map((u) => `${money(u.price)} / ${u.name || unitLabel(u.symbol ?? "")}`)
          .join(" · ")
      : null;
  return { mainRetail, sub };
}

function OpenLotCard({
  lot,
  product,
  supplierName,
  fifo,
}: {
  lot: ProductLotRow;
  product: Product;
  supplierName: (id: string) => string;
  fifo: boolean;
}) {
  const sold = lotSoldQuantity(lot);
  const fifoCost = lotCostInStockUnit(product, lot.purchasePrice);
  const lotProfit = lotRealizedProfit(lot, product, fifoCost);
  return (
    <article className={cn("product-detail-lot", fifo && "is-current")}>
      <div className="product-detail-lot-top">
        <strong>
          {lot.lotNumber}
          {fifo ? <em>{PRODUCT_COPY.detailFifoNow}</em> : null}
        </strong>
        <span>
          {shortDate(lot.receivedAt)}
          {lot.supplierId ? ` · ${supplierName(lot.supplierId)}` : ""}
        </span>
      </div>
      <div className="product-detail-lot-cols">
        <div>
          <span>{PRODUCT_COPY.detailLeftInLot}</span>
          <b>
            <DetailQtyDisplay product={product} qty={lot.remainingQuantity} />
          </b>
        </div>
        <div>
          <span>{PRODUCT_COPY.detailSoldFromLot}</span>
          <b>
            <DetailQtyDisplay product={product} qty={sold} />
          </b>
        </div>
        <div>
          <span>{PRODUCT_COPY.detailStockValue}</span>
          <b>{compactRs(lot.remainingQuantity * fifoCost)}</b>
        </div>
        <div>
          <span>{PRODUCT_COPY.detailFifoCost}</span>
          <b>
            {priceBreakdown(product, fifoCost)
              .slice(0, 1)
              .map((row) => `${compactRs(row.value)}/${row.name}`)}
          </b>
        </div>
      </div>
      <footer className="product-detail-lot-foot">
        <span>{PRODUCT_COPY.detailLotProfit}</span>
        <b>
          {lotProfit.hint ? `${compactRs(0)} · ${lotProfit.hint}` : compactRs(lotProfit.amount)}
        </b>
      </footer>
    </article>
  );
}

function lotSoldQuantity(lot: ProductLotRow) {
  return Math.max(0, lot.originalQuantity - lot.remainingQuantity - lot.damagedQuantity);
}

function lotRealizedProfit(lot: ProductLotRow, product: Product, fifoCost: number) {
  const sold = lotSoldQuantity(lot);
  if (sold <= 0) return { amount: 0, hint: PRODUCT_COPY.detailNoSales };
  const { retail } = productBasePricing(product);
  return { amount: sold * (retail - fifoCost), hint: null };
}

function shortDate(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ProductDetailDrawer({
  product,
  lots,
  salesProfit,
  salesTotal,
  salesQty,
  supplierLabel,
  supplierName,
  onClose,
  onEdit,
  onAddLot,
}: {
  product: Product | null;
  lots: ProductLotRow[];
  salesProfit: number;
  salesTotal: number;
  salesQty: number;
  supplierLabel?: string;
  supplierName: (id: string) => string;
  onClose: () => void;
  onEdit: (row: Product) => void;
  onAddLot: (productId: string) => void;
}) {
  const [hereBranchId, setHereBranchId] = useState("");

  useEffect(() => {
    if (!product) return;
    const controller = new AbortController();
    void ensureSession(controller.signal)
      .then((session) => {
        if (!controller.signal.aborted) setHereBranchId(session?.branchId ?? "");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [product?.id]);

  if (!product) return null;

  const units = product.sellUnits?.length ? qtyUnits(product.sellUnits) : [];
  const stock = productTotalStock(product);
  const stockUnit = unitLabel(product.unit);
  const branchRows = [...productBranchStockRows(product)].sort((a, b) => {
    if (a.branchId === hereBranchId) return -1;
    if (b.branchId === hereBranchId) return 1;
    return a.branchName.localeCompare(b.branchName);
  });
  const openLots = lots
    .filter((lot) => lot.productId === product.id && lot.remainingQuantity > 0)
    .sort(
      (a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.lotNumber.localeCompare(b.lotNumber),
    );
  const retail = retailDisplay(product);
  const stockTone =
    stock <= 0 ? "is-danger" : stock < (product.minimumStock ?? 20) ? "is-warn" : "is-ok";
  const heroMeta = [product.sku, product.category, product.barcode?.trim()]
    .filter(Boolean)
    .join(" · ");

  return (
    <Drawer
      open
      size="lg"
      title={PRODUCT_COPY.detailTitle}
      subtitle={<p className="ui-drawer-subtitle">{PRODUCT_COPY.detailSubtitle}</p>}
      onClose={onClose}
    >
      <div className="product-detail">
        <DetailToolbar>
          <DetailToolbarButton
            variant="edit"
            icon={<Pencil size={15} />}
            onClick={() => {
              onClose();
              onEdit(product);
            }}
          >
            Edit product
          </DetailToolbarButton>
          <DetailToolbarButton
            variant="accent"
            icon={<Layers size={15} />}
            onClick={() => {
              onClose();
              onAddLot(product.id);
            }}
          >
            Add lot
          </DetailToolbarButton>
        </DetailToolbar>

        <header className="product-detail-hero entity-detail-hero">
          <div
            className={cn("entity-detail-avatar", product.isManufactured ? "is-violet" : "is-teal")}
          >
            {product.isManufactured ? <Factory size={18} /> : <Package size={18} />}
          </div>
          <div className="product-detail-hero-copy">
            <div className="product-detail-hero-top">
              <h3>{product.name}</h3>
              <span className="product-detail-kind">
                {product.isManufactured ? "Manufactured" : "Standard"}
              </span>
            </div>
            {heroMeta ? <p className="product-detail-hero-meta">{heroMeta}</p> : null}
          </div>
        </header>

        <div className="product-detail-stats is-pair">
          <article className={cn("product-detail-stat", stockTone)}>
            <span>{PRODUCT_COPY.detailCurrentStock}</span>
            <strong>
              <DetailQtyDisplay product={product} qty={stock} />
            </strong>
          </article>
          <article className="product-detail-stat">
            <span>{PRODUCT_COPY.detailRetailPrice}</span>
            <strong>{compactRs(retail.mainRetail)}</strong>
            {retail.sub ? <small>{retail.sub}</small> : null}
          </article>
        </div>

        {units.length ? (
          <section className="product-detail-card">
            <header className="product-detail-card-head">
              <Receipt size={14} />
              <h4>{PRODUCT_COPY.detailUnitsTitle}</h4>
              <span className="product-detail-card-hint">{PRODUCT_COPY.detailVsCost}</span>
            </header>
            <ProductUnitPricingList units={units} />
          </section>
        ) : null}

        <section className="product-detail-card">
          <header className="product-detail-card-head">
            <Layers size={14} />
            <h4>{PRODUCT_COPY.detailOpenLots}</h4>
            <span>{openLots.length}</span>
          </header>
          {openLots.length === 0 ? (
            <p className="product-detail-empty">{PRODUCT_COPY.detailNoOpenLots}</p>
          ) : (
            <div className="product-detail-lots">
              {openLots.map((lot, index) => (
                <OpenLotCard
                  key={lot.id}
                  lot={lot}
                  product={product}
                  supplierName={supplierName}
                  fifo={index === 0}
                />
              ))}
            </div>
          )}
        </section>

        <section className="product-detail-card">
          <header className="product-detail-card-head">
            <Store size={14} />
            <h4>{PRODUCT_COPY.detailBranchStock}</h4>
            {branchRows.length ? (
              <span>{PRODUCT_COPY.detailBranches(branchRows.length)}</span>
            ) : null}
          </header>
          {branchRows.length ? (
            <ul className="product-detail-branch-panel">
              {branchRows.map((row) => {
                const here = row.branchId === hereBranchId;
                const zero = row.quantity <= 0;
                return (
                  <li
                    key={row.branchId}
                    className={cn("product-detail-branch", here && "is-here", zero && "is-zero")}
                  >
                    <span>
                      {row.branchName}
                      {here ? <em>{PRODUCT_COPY.detailThisBranch}</em> : null}
                    </span>
                    <strong>
                      {formatStockQty(row.quantity)} {stockUnit}
                    </strong>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="product-detail-empty">{PRODUCT_COPY.detailSingleBranch}</p>
          )}
        </section>

        <section className="product-detail-card">
          <header className="product-detail-card-head">
            <Tags size={14} />
            <h4>{PRODUCT_COPY.detailInfoTitle}</h4>
          </header>
          <dl className="product-detail-facts">
            <div>
              <dt>{PRODUCT_COPY.detailSku}</dt>
              <dd>{product.sku || "—"}</dd>
            </div>
            <div>
              <dt>{PRODUCT_COPY.detailType}</dt>
              <dd>{product.isManufactured ? "Manufactured" : "Standard"}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{product.category}</dd>
            </div>
            <div>
              <dt>Stock unit</dt>
              <dd>{stockUnit}</dd>
            </div>
            <div>
              <dt>Barcode</dt>
              <dd>{product.barcode?.trim() || "—"}</dd>
            </div>
            <div>
              <dt>{PRODUCT_COPY.lowStockAlert}</dt>
              <dd>
                {formatStockQty(product.minimumStock ?? 0)} {stockUnit}
              </dd>
            </div>
            <div>
              <dt>Damaged</dt>
              <dd>
                {formatStockQty(product.damaged)} {stockUnit}
              </dd>
            </div>
            <div>
              <dt>Last supplier</dt>
              <dd>{supplierLabel || "—"}</dd>
            </div>
            <div>
              <dt>{PRODUCT_COPY.detailQtySold}</dt>
              <dd>
                {formatStockQty(salesQty)} {stockUnit}
              </dd>
            </div>
            <div>
              <dt>{PRODUCT_COPY.salesProfit}</dt>
              <dd>
                {compactRs(salesProfit)}
                {salesTotal > 0 ? <small>{compactRs(salesTotal)} sales</small> : null}
              </dd>
            </div>
            <div>
              <dt>Warranty</dt>
              <dd>
                {product.warrantyEnabled && product.warrantyQty > 0
                  ? `${product.warrantyQty} ${product.warrantyUnit}`
                  : "—"}
              </dd>
            </div>
          </dl>
          {product.createdAt || product.updatedAt ? (
            <p className="product-detail-stamp">
              <Clock size={13} aria-hidden />
              {[
                product.createdAt ? `Created ${formatDetailDate(product.createdAt)}` : null,
                product.updatedAt ? `Updated ${formatDetailDate(product.updatedAt)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </section>
      </div>
    </Drawer>
  );
}
