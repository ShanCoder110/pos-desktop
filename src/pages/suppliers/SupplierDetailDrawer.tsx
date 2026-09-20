import { BookOpen, Building2, Clock, Pencil, Phone, Scale, Wallet } from "lucide-react";
import { Badge, DetailToolbar, DetailToolbarButton, Drawer } from "@/components/common";
import {
  SUPPLIER_BALANCE_ADVANCE,
  SUPPLIER_BALANCE_PAYABLE,
  SUPPLIER_BALANCE_SETTLED,
  SUPPLIER_COPY,
  SUPPLIER_STATUS_ACTIVE,
  SUPPLIER_STATUS_INACTIVE,
} from "@/shared/constants/suppliers";
import type { SupplierRow } from "@/shared/domain/types";
import { cn, formatDetailDate, formatEntityRef, money } from "@/utils/format";
import { formatPkMobile } from "@/utils/phone";

function supplierBalance(n: number) {
  if (n > 0) {
    return { amount: money(n), label: SUPPLIER_BALANCE_PAYABLE, tone: "is-warn" as const };
  }
  if (n < 0) {
    return { amount: money(-n), label: SUPPLIER_BALANCE_ADVANCE, tone: "is-ok" as const };
  }
  return { amount: money(0), label: SUPPLIER_BALANCE_SETTLED, tone: "is-ok" as const };
}

export function SupplierDetailDrawer({
  supplier,
  canAdjust,
  onClose,
  onEdit,
  onPay,
  onAdjust,
  onLedger,
}: {
  supplier: SupplierRow | null;
  canAdjust: boolean;
  onClose: () => void;
  onEdit: (row: SupplierRow) => void;
  onPay: (row: SupplierRow) => void;
  onAdjust: (row: SupplierRow) => void;
  onLedger: (row: SupplierRow) => void;
}) {
  if (!supplier) return null;

  const balance = supplierBalance(supplier.currentBalance);
  const payLabel =
    supplier.currentBalance < 0 ? SUPPLIER_COPY.receiveFromSupplier : SUPPLIER_COPY.paySupplier;

  return (
    <Drawer
      open
      size="lg"
      title={SUPPLIER_COPY.detailTitle}
      subtitle={<p className="ui-drawer-subtitle">{SUPPLIER_COPY.detailSubtitle}</p>}
      onClose={onClose}
    >
      <div className="product-detail">
        <DetailToolbar>
          <DetailToolbarButton
            variant="edit"
            icon={<Pencil size={15} />}
            onClick={() => {
              onClose();
              onEdit(supplier);
            }}
          >
            Edit supplier
          </DetailToolbarButton>
          <DetailToolbarButton
            variant="accent"
            icon={<Wallet size={15} />}
            onClick={() => {
              onClose();
              onPay(supplier);
            }}
          >
            {payLabel}
          </DetailToolbarButton>
          {canAdjust ? (
            <DetailToolbarButton
              variant="warn"
              icon={<Scale size={15} />}
              onClick={() => {
                onClose();
                onAdjust(supplier);
              }}
            >
              {SUPPLIER_COPY.adjustTitle}
            </DetailToolbarButton>
          ) : null}
          <DetailToolbarButton
            variant="info"
            icon={<BookOpen size={15} />}
            className={!canAdjust ? "is-wide" : undefined}
            onClick={() => {
              onClose();
              onLedger(supplier);
            }}
          >
            {SUPPLIER_COPY.viewLedger}
          </DetailToolbarButton>
        </DetailToolbar>

        <header className="product-detail-hero entity-detail-hero">
          <div className="entity-detail-avatar is-teal">
            <Building2 size={18} />
          </div>
          <div className="product-detail-hero-copy">
            <div className="product-detail-hero-top">
              <h3>{supplier.name}</h3>
              <Badge tone={supplier.isActive ? "ok" : "danger"}>
                {supplier.isActive ? SUPPLIER_STATUS_ACTIVE : SUPPLIER_STATUS_INACTIVE}
              </Badge>
            </div>
            <p className="product-detail-hero-meta">
              <code>{formatEntityRef("SUP", supplier.id)}</code>
              {supplier.cityName ? <span>{supplier.cityName}</span> : null}
            </p>
          </div>
        </header>

        <div className="product-detail-stats is-pair">
          <article className={cn("product-detail-stat", balance.tone)}>
            <span>Balance</span>
            <strong>{balance.amount}</strong>
            <small>{balance.label}</small>
          </article>
          <article className={cn("product-detail-stat", supplier.isActive ? "is-ok" : "is-danger")}>
            <span>Status</span>
            <strong>{supplier.isActive ? SUPPLIER_STATUS_ACTIVE : SUPPLIER_STATUS_INACTIVE}</strong>
            <small>
              {supplier.isActive
                ? SUPPLIER_COPY.statusActiveHint
                : SUPPLIER_COPY.statusInactiveHint}
            </small>
          </article>
        </div>

        <section className="product-detail-card">
          <header className="product-detail-card-head">
            <Phone size={14} />
            <h4>{SUPPLIER_COPY.contactSection}</h4>
          </header>
          <dl className="product-detail-facts">
            <div>
              <dt>Phone</dt>
              <dd>{supplier.phone ? formatPkMobile(supplier.phone) : "—"}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{supplier.address?.trim() || "—"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{supplier.email?.trim() || "—"}</dd>
            </div>
            <div>
              <dt>City</dt>
              <dd>{supplier.cityName?.trim() || "—"}</dd>
            </div>
            {supplier.notes?.trim() ? (
              <div className="product-detail-fact-wide">
                <dt>Notes</dt>
                <dd>{supplier.notes}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {supplier.createdAt || supplier.updatedAt ? (
          <p className="product-detail-stamp">
            <Clock size={13} aria-hidden />
            {[
              supplier.createdAt ? `Created ${formatDetailDate(supplier.createdAt)}` : null,
              supplier.updatedAt ? `Updated ${formatDetailDate(supplier.updatedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
