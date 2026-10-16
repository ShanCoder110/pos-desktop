import {
  baseUnit,
  canonicalUnit,
  formatStockQty,
  priceFromStock,
  productSellUnits,
  qtyUnits,
  resolvedFactorDirection,
  unitLabel,
} from "@/pages/products/productQty";
import { PRODUCT_COPY, PRODUCT_UNIT_PRICE_TIERS } from "@/shared/constants/products";
import type { Product, ProductSellUnit } from "@/shared/types";
import { cn } from "@/utils/format";
import { profitAmount, profitMarginPercent } from "@/utils/margin";

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
  const stock =
    units.find(
      (row) => resolvedFactorDirection(row) !== "divide" && Math.abs(row.contains - 1) < 1e-6,
    ) ??
    canonicalUnit(units) ??
    baseUnit(units);
  if (!stock || unit.id === stock.id) return "Stock unit";
  const stockName = stock.name || unitLabel(stock.symbol ?? "");
  const name = unit.name || unitLabel(unit.symbol ?? "");
  const n = formatStockQty(unit.contains);
  if (resolvedFactorDirection(unit) === "divide") return `1 ${stockName} = ${n} ${name}`;
  return `1 ${name} = ${n} ${stockName}`;
}

function unitMargin(cost: number, retail: number) {
  const profit = profitAmount(retail, cost);
  const pct = profitMarginPercent(retail, cost);
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
