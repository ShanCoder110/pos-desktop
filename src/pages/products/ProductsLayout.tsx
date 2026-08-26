import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeftRight,
  Box,
  CheckCircle2,
  Clock,
  Gift,
  Layers,
  Package,
  Ruler,
  ShieldCheck,
  Tags,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { KpiCard, TabSheet, Tabs } from "@/components/common";
import { routes } from "@/shared/constants/routes";
import { productLots as seedLots, productUnits, transfers, units } from "@/shared/domain/mock";
import type { ProductLotRow } from "@/shared/domain/types";
import { productCategories, products as catalog } from "@/shared/mock";
import type { Product } from "@/shared/types";
import { money } from "@/utils/format";

export const PRODUCT_SECTION_TABS = [
  { id: "all", to: routes.products, label: "All products", end: true },
  { id: "lots", to: routes.lots, label: "Lots" },
  { id: "units", to: routes.units, label: "Units" },
  { id: "categories", to: routes.productsCategories, label: "Categories" },
  { id: "transfers", to: routes.transfers, label: "Transfers" },
  { id: "low", to: routes.productsLow, label: "Low stock" },
  { id: "sold", to: routes.productsSold, label: "Most sold" },
] as const;

export type HealthKpi = "healthy" | "risk" | "dead" | "phantom";
export type HubSection = "catalog" | "lots" | "units" | "categories" | "transfers" | "low" | "sold";

export const HEALTH_LABEL: Record<HealthKpi, string> = {
  healthy: "Healthy",
  risk: "At risk",
  dead: "Dead",
  phantom: "Phantom",
};

export const HEALTH_FROM_LABEL: Record<string, HealthKpi> = {
  Healthy: "healthy",
  "At risk": "risk",
  Dead: "dead",
  Phantom: "phantom",
};

export function matchesHealth(row: Product, kpi: HealthKpi) {
  if (kpi === "healthy") return row.stock >= 20;
  if (kpi === "risk") return row.stock > 0 && row.stock < 20;
  if (kpi === "dead") return row.stock <= 0;
  return row.isLinear;
}

export function hubSection(pathname: string): HubSection {
  if (pathname.endsWith("/lots")) return "lots";
  if (pathname.endsWith("/units")) return "units";
  if (pathname.endsWith("/categories")) return "categories";
  if (pathname.endsWith("/transfers")) return "transfers";
  if (pathname.endsWith("/low")) return "low";
  if (pathname.endsWith("/sold")) return "sold";
  return "catalog";
}

type HubCtx = {
  setActions: (node: ReactNode) => void;
  health: HealthKpi | null;
  setHealth: (value: HealthKpi | null) => void;
  sectionKpi: string | null;
  setSectionKpi: (value: string | null) => void;
  lots: ProductLotRow[];
  setLots: Dispatch<SetStateAction<ProductLotRow[]>>;
  products: Product[];
  setProducts: Dispatch<SetStateAction<Product[]>>;
};

const ProductsHubContext = createContext<HubCtx>({
  setActions: () => undefined,
  health: null,
  setHealth: () => undefined,
  sectionKpi: null,
  setSectionKpi: () => undefined,
  lots: [],
  setLots: () => undefined,
  products: [],
  setProducts: () => undefined,
});

export function useProductsHub() {
  return useContext(ProductsHubContext);
}

function CatalogKpis() {
  const { health, setHealth, products } = useProductsHub();
  const productCost = products.reduce((total, product) => total + product.cost * product.stock, 0);
  const counts: Record<HealthKpi, number> = {
    healthy: products.filter((r) => matchesHealth(r, "healthy")).length,
    risk: products.filter((r) => matchesHealth(r, "risk")).length,
    dead: products.filter((r) => matchesHealth(r, "dead")).length,
    phantom: products.filter((r) => matchesHealth(r, "phantom")).length,
  };

  function toggle(id: HealthKpi) {
    setHealth(health === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Product cost" value={money(productCost)} tone="phantom" icon={<Wallet size={16} />} />
      <KpiCard label="Healthy" value={counts.healthy} hint="In stock" tone="ok" icon={<ShieldCheck size={16} />} active={health === "healthy"} onClick={() => toggle("healthy")} />
      <KpiCard label="At risk" value={counts.risk} hint="Low stock" tone="warn" icon={<AlertTriangle size={16} />} active={health === "risk"} onClick={() => toggle("risk")} />
      <KpiCard label="Dead" value={counts.dead} hint="Out of stock" tone="danger" icon={<Trash2 size={16} />} active={health === "dead"} onClick={() => toggle("dead")} />
      <KpiCard label="Phantom" value={counts.phantom} hint="Sold by length" tone="phantom" icon={<Gift size={16} />} active={health === "phantom"} onClick={() => toggle("phantom")} />
    </div>
  );
}

function LotsKpis() {
  const { sectionKpi, setSectionKpi, lots } = useProductsHub();
  const open = lots.filter((r) => r.remainingQuantity > 0).length;
  const empty = lots.filter((r) => r.remainingQuantity <= 0).length;
  const qtyLeft = lots.reduce((s, r) => s + r.remainingQuantity, 0);
  const valueLeft = lots.reduce((s, r) => s + r.remainingQuantity * r.purchasePrice, 0);

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Open lots" value={open} hint="Still on shelf" tone="ok" icon={<Layers size={16} />} active={sectionKpi === "open"} onClick={() => toggle("open")} />
      <KpiCard label="Empty" value={empty} hint="Fully sold" tone="stale" icon={<Box size={16} />} active={sectionKpi === "empty"} onClick={() => toggle("empty")} />
      <KpiCard label="Value left" value={money(valueLeft)} hint="At purchase price" tone="ok" icon={<Wallet size={16} />} />
      <KpiCard label="Lots" value={lots.length} hint="All receipts" tone="phantom" icon={<Package size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="Qty left" value={qtyLeft} hint="Base units" tone="warn" icon={<Layers size={16} />} />
    </div>
  );
}

function UnitsKpis() {
  const { sectionKpi, setSectionKpi } = useProductsHub();
  const packs = units.filter((u) => u.symbol === "pk" || u.symbol === "box").length;
  const defaults = productUnits.filter((u) => u.isDefault).length;

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Base units" value={units.length} hint="Stock unit" tone="ok" icon={<Ruler size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="Sell units" value={productUnits.length} hint="POS sell options" tone="phantom" icon={<Package size={16} />} />
      <KpiCard label="Packs" value={packs} hint="Conversion over 1" tone="warn" icon={<Box size={16} />} active={sectionKpi === "pack"} onClick={() => toggle("pack")} />
      <KpiCard label="Default" value={defaults} hint="Base sell unit" tone="ok" icon={<CheckCircle2 size={16} />} />
      <KpiCard label="Symbols" value={new Set(units.map((u) => u.symbol)).size} hint="Distinct" tone="stale" icon={<Ruler size={16} />} />
    </div>
  );
}

function TransfersKpis() {
  const { sectionKpi, setSectionKpi } = useProductsHub();
  const pending = transfers.filter((t) => t.status === "PENDING").length;
  const done = transfers.filter((t) => t.status === "COMPLETED").length;
  const cancelled = transfers.filter((t) => t.status === "CANCELLED").length;
  const items = transfers.reduce((s, t) => s + t.items.length, 0);

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Pending" value={pending} hint="Waiting receive" tone="warn" icon={<Clock size={16} />} active={sectionKpi === "PENDING"} onClick={() => toggle("PENDING")} />
      <KpiCard label="Completed" value={done} hint="Stock moved" tone="ok" icon={<CheckCircle2 size={16} />} active={sectionKpi === "COMPLETED"} onClick={() => toggle("COMPLETED")} />
      <KpiCard label="Cancelled" value={cancelled} hint="No movement" tone="danger" icon={<XCircle size={16} />} active={sectionKpi === "CANCELLED"} onClick={() => toggle("CANCELLED")} />
      <KpiCard label="Transfers" value={transfers.length} hint="All records" tone="phantom" icon={<ArrowLeftRight size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="Lines" value={items} hint="Transfer items" tone="stale" icon={<Package size={16} />} />
    </div>
  );
}

function CategoriesKpis() {
  const { sectionKpi, setSectionKpi } = useProductsHub();
  const used = productCategories.filter((name) => catalog.some((p) => p.category === name)).length;
  const empty = productCategories.length - used;
  const biggest = productCategories.reduce((best, name) => {
    const n = catalog.filter((p) => p.category === name).length;
    return n > best.count ? { name, count: n } : best;
  }, { name: "—", count: 0 });

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Categories" value={productCategories.length} hint="Catalog groups" tone="ok" icon={<Tags size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="In use" value={used} hint="Have products" tone="phantom" icon={<Package size={16} />} active={sectionKpi === "used"} onClick={() => toggle("used")} />
      <KpiCard label="Empty" value={empty} hint="No products yet" tone="stale" icon={<Box size={16} />} active={sectionKpi === "empty"} onClick={() => toggle("empty")} />
      <KpiCard label="Products" value={catalog.length} hint="Assigned SKUs" tone="ok" icon={<Package size={16} />} />
      <KpiCard label="Largest" value={biggest.count} hint={biggest.name} tone="warn" icon={<Layers size={16} />} />
    </div>
  );
}

function LowStockKpis() {
  const { sectionKpi, setSectionKpi, products } = useProductsHub();
  const below = products.filter((r) => r.stock > 0 && r.stock < 20).length;
  const out = products.filter((r) => r.stock <= 0).length;
  const ok = products.filter((r) => r.stock >= 20).length;

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Low stock" value={below + out} hint="Needs attention" tone="warn" icon={<AlertTriangle size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="Below min" value={below} hint="Still on shelf" tone="warn" icon={<AlertTriangle size={16} />} active={sectionKpi === "below"} onClick={() => toggle("below")} />
      <KpiCard label="Out" value={out} hint="Zero remaining" tone="danger" icon={<Trash2 size={16} />} active={sectionKpi === "out"} onClick={() => toggle("out")} />
      <KpiCard label="Healthy" value={ok} hint="At or above 20" tone="ok" icon={<ShieldCheck size={16} />} />
      <KpiCard label="SKUs" value={products.length} hint="Catalog" tone="phantom" icon={<Package size={16} />} />
    </div>
  );
}

function ProductHubKpis() {
  const { pathname } = useLocation();
  const section = hubSection(pathname);
  if (section === "lots") return <LotsKpis />;
  if (section === "units") return <UnitsKpis />;
  if (section === "categories") return <CategoriesKpis />;
  if (section === "transfers") return <TransfersKpis />;
  if (section === "low") return <LowStockKpis />;
  return <CatalogKpis />;
}

export function ProductsLayout() {
  const { pathname } = useLocation();
  const [actions, setActions] = useState<ReactNode>(null);
  const [health, setHealth] = useState<HealthKpi | null>(null);
  const [sectionKpi, setSectionKpi] = useState<string | null>(null);
  const [lots, setLots] = useState(seedLots);
  const [products, setProducts] = useState(catalog);
  const ctx = useMemo(
    () => ({ setActions, health, setHealth, sectionKpi, setSectionKpi, lots, setLots, products, setProducts }),
    [health, sectionKpi, lots, products],
  );

  useEffect(() => {
    setSectionKpi(null);
    setHealth(null);
  }, [pathname]);

  return (
    <ProductsHubContext.Provider value={ctx}>
      <div className="products-hub [min-height:0]">
        <div className="ui-page-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [width:100%] [flex-shrink:0]">
          <h1 className="ui-page-title [font-size:22px] [font-weight:800] [letter-spacing:-0.03em] [color:var(--ink)] [min-width:0]">Products</h1>
          <div className="ui-actions [display:flex] [align-items:center] [gap:8px]">{actions}</div>
        </div>
        <ProductHubKpis />
        <TabSheet tabs={<Tabs items={[...PRODUCT_SECTION_TABS]} ariaLabel="Products sections" />}>
          <Outlet />
        </TabSheet>
      </div>
    </ProductsHubContext.Provider>
  );
}
