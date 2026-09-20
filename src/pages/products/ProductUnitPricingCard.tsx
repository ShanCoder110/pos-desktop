import {
  baseUnit,
  formatStockQty,
  priceFromStock,
  productSellUnits,
  qtyUnits,
  unitLabel,
} from "@/pages/products/productQty";
import { PRODUCT_COPY, PRODUCT_UNIT_PRICE_TIERS } from "@/shared/constants/products";
import type { Product, ProductSellUnit } from "@/shared/types";
import { cn } from "@/utils/format";

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

function signedRs(n: number) {
  if (n === 0) return `Rs ${compactAmount(0)}`;
  return `${n > 0 ? "+" : "−"}Rs ${compactAmount(n)}`;
}

function unitKindLabel(unit: ProductSellUnit, units: ProductSellUnit[]) {
  const base = baseUnit(units);
  if (!base || unit.id === base.id || unit.contains <= 1) return "Base unit";
  const parent = base.name || unitLabel(base.symbol ?? "");
  return `${formatStockQty(unit.contains)} per ${parent}`;
}

function unitMargin(cost: number, retail: number) {
  const profit = retail - cost;
  const pct = cost > 0 ? (profit / cost) * 100 : 0;
  return { profit, pct, healthy: profit >= 0 };
}

export function lotUnitPricing(product: Product, fifoCost: number): ProductSellUnit[] {
  const units = qtyUnits(productSellUnits(product));
  return units.map((unit) => ({
    ...unit,
    cost: priceFromStock(units, product.unit, fifoCost, unit),
  }));
}

export function ProductUnitPricingCard({
  unit,
  units,
}: {
  unit: ProductSellUnit;
  units: ProductSellUnit[];
}) {
  const name = unit.name || unitLabel(unit.symbol ?? "") || "Unit";
  const retail = unitMargin(unit.cost, unit.price);
  const wholesale = unitMargin(unit.cost, unit.wholesale);
  const tiers = [
    ["cost", PRODUCT_UNIT_PRICE_TIERS.cost],
    ["min", PRODUCT_UNIT_PRICE_TIERS.min],
    ["wholesale", PRODUCT_UNIT_PRICE_TIERS.wholesale],
    ["price", PRODUCT_UNIT_PRICE_TIERS.price],
  ] as const;

  return (
    <article className="product-detail-unit-card">
      <header className="product-detail-unit-head">
        <div className="product-detail-unit-title">
          <strong>{name}</strong>
          <span>{unitKindLabel(unit, units)}</span>
        </div>
        <div className="product-detail-profit-pair">
          <span
            className={cn("product-detail-profit-stack", wholesale.healthy ? "is-ok" : "is-bad")}
          >
            <em>{PRODUCT_COPY.detailWholesaleProfit}</em>
            <b>{signedRs(wholesale.profit)}</b>
            <small>
              {wholesale.healthy ? "+" : ""}
              {wholesale.pct.toFixed(0)}% {PRODUCT_COPY.detailMargin.toLowerCase()}
            </small>
          </span>
          <span className={cn("product-detail-profit-stack", retail.healthy ? "is-ok" : "is-bad")}>
            <em>{PRODUCT_COPY.detailRetailProfit}</em>
            <b>{signedRs(retail.profit)}</b>
            <small>
              {retail.healthy ? "+" : ""}
              {retail.pct.toFixed(0)}% {PRODUCT_COPY.detailMargin.toLowerCase()}
            </small>
          </span>
        </div>
      </header>
      <dl className="product-detail-unit-grid">
        {tiers.map(([key, label]) => (
          <div
            key={key}
            className={cn("product-detail-unit-tier", key === "price" ? "is-retail" : `is-${key}`)}
          >
            <dt>{label}</dt>
            <dd>{compactRs(unit[key])}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function ProductUnitPricingList({ units }: { units: ProductSellUnit[] }) {
  if (!units.length) return null;
  return (
    <div className="product-detail-unit-list">
      {units.map((unit) => (
        <ProductUnitPricingCard key={unit.id} unit={unit} units={units} />
      ))}
    </div>
  );
}
