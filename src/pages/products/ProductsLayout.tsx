import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
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
import { PRODUCT_SECTION_TABS, type ProductHealth } from "@/shared/constants/products";
import type { ProductLotRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { money } from "@/utils/format";
import { ensureSession } from "@/services/auth";
import { listAllProducts } from "@/services/products";
import { listAllLots } from "@/services/lots";
import { listAllTransfers } from "@/services/transfers";
import { listMasterRecords } from "@/services/masters";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";

export type HubSection = "catalog" | "lots" | "units" | "categories" | "transfers" | "low";

export function matchesHealth(row: Product, kpi: ProductHealth) {
  if (kpi === "healthy") return row.stock >= (row.minimumStock ?? 20);
  if (kpi === "risk") return row.stock > 0 && row.stock < (row.minimumStock ?? 20);
  if (kpi === "dead") return row.stock <= 0;
  return row.isLinear;
}

export function hubSection(pathname: string): HubSection {
  if (pathname.endsWith("/lots")) return "lots";
  if (pathname.endsWith("/units")) return "units";
  if (pathname.endsWith("/categories")) return "categories";
  if (pathname.endsWith("/transfers")) return "transfers";
  if (pathname.endsWith("/low")) return "low";
  return "catalog";
}

type HubCtx = {
  setActions: (node: ReactNode) => void;
  health: ProductHealth | null;
  setHealth: (value: ProductHealth | null) => void;
  sectionKpi: string | null;
  setSectionKpi: (value: string | null) => void;
  lots: ProductLotRow[];
  setLots: Dispatch<SetStateAction<ProductLotRow[]>>;
  products: Product[];
  setProducts: Dispatch<SetStateAction<Product[]>>;
  categories: { id: string; name: string }[];
  units: { id: string; name: string; symbol: string }[];
  suppliers: { id: string; name: string; isActive: boolean }[];
  transfers: { id: string; status: string; items: unknown[] }[];
  refreshHub: () => Promise<void>;
  refreshLots: () => Promise<void>;
  refreshProducts: () => Promise<void>;
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
  categories: [],
  units: [],
  suppliers: [],
  transfers: [],
  refreshHub: async () => undefined,
  refreshLots: async () => undefined,
  refreshProducts: async () => undefined,
});

export function useProductsHub() {
  return useContext(ProductsHubContext);
}

function CatalogKpis() {
  const { health, setHealth, products } = useProductsHub();
  const productCost = products.reduce((total, product) => total + product.cost * product.stock, 0);
  const counts: Record<ProductHealth, number> = {
    healthy: products.filter((r) => matchesHealth(r, "healthy")).length,
    risk: products.filter((r) => matchesHealth(r, "risk")).length,
    dead: products.filter((r) => matchesHealth(r, "dead")).length,
    phantom: products.filter((r) => matchesHealth(r, "phantom")).length,
  };

  function toggle(id: ProductHealth) {
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
  const { sectionKpi, setSectionKpi, units, products } = useProductsHub();
  const packs = units.filter((u) => u.symbol === "pk" || u.symbol === "box").length;
  const sellUnits = products.reduce((n, p) => n + (p.sellUnits?.length ?? 0), 0);
  const defaults = products.filter((p) => p.sellUnits?.some((u) => u.kind === "base")).length;

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Base units" value={units.length} hint="Stock unit" tone="ok" icon={<Ruler size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="Sell units" value={sellUnits} hint="POS sell options" tone="phantom" icon={<Package size={16} />} />
      <KpiCard label="Packs" value={packs} hint="Conversion over 1" tone="warn" icon={<Box size={16} />} active={sectionKpi === "pack"} onClick={() => toggle("pack")} />
      <KpiCard label="Default" value={defaults} hint="Base sell unit" tone="ok" icon={<CheckCircle2 size={16} />} />
      <KpiCard label="Symbols" value={new Set(units.map((u) => u.symbol)).size} hint="Distinct" tone="stale" icon={<Ruler size={16} />} />
    </div>
  );
}

function TransfersKpis() {
  const { sectionKpi, setSectionKpi, transfers } = useProductsHub();
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
  const { sectionKpi, setSectionKpi, categories, products } = useProductsHub();
  const used = categories.filter((cat) => products.some((p) => p.category === cat.name)).length;
  const empty = categories.length - used;
  const biggest = categories.reduce((best, cat) => {
    const n = products.filter((p) => p.category === cat.name).length;
    return n > best.count ? { name: cat.name, count: n } : best;
  }, { name: "—", count: 0 });

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Categories" value={categories.length} hint="Catalog groups" tone="ok" icon={<Tags size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="In use" value={used} hint="Have products" tone="phantom" icon={<Package size={16} />} active={sectionKpi === "used"} onClick={() => toggle("used")} />
      <KpiCard label="Empty" value={empty} hint="No products yet" tone="stale" icon={<Box size={16} />} active={sectionKpi === "empty"} onClick={() => toggle("empty")} />
      <KpiCard label="Products" value={products.length} hint="Assigned SKUs" tone="ok" icon={<Package size={16} />} />
      <KpiCard label="Largest" value={biggest.count} hint={biggest.name} tone="warn" icon={<Layers size={16} />} />
    </div>
  );
}

function LowStockKpis() {
  const { sectionKpi, setSectionKpi, products } = useProductsHub();
  const below = products.filter((r) => r.stock > 0 && r.stock < (r.minimumStock ?? 20)).length;
  const out = products.filter((r) => r.stock <= 0).length;
  const ok = products.filter((r) => r.stock >= (r.minimumStock ?? 20)).length;
  const orderQty = products.reduce((sum, row) => {
    const minimum = row.minimumStock ?? 20;
    return sum + (row.stock < minimum ? Math.max(0, minimum * 2 - row.stock) : 0);
  }, 0);

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="To reorder" value={below + out} hint="Needs attention" tone="warn" icon={<AlertTriangle size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="Below min" value={below} hint="Still on shelf" tone="warn" icon={<AlertTriangle size={16} />} active={sectionKpi === "below"} onClick={() => toggle("below")} />
      <KpiCard label="Out" value={out} hint="Zero remaining" tone="danger" icon={<Trash2 size={16} />} active={sectionKpi === "out"} onClick={() => toggle("out")} />
      <KpiCard label="Healthy" value={ok} hint="At or above minimum" tone="ok" icon={<ShieldCheck size={16} />} />
      <KpiCard label="Suggested qty" value={orderQty} hint="Restore to 2× minimum" tone="phantom" icon={<Package size={16} />} />
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
  const [health, setHealth] = useState<ProductHealth | null>(null);
  const [sectionKpi, setSectionKpi] = useState<string | null>(null);
  const [lots, setLots] = useState<ProductLotRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string; symbol: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [transfers, setTransfers] = useState<{ id: string; status: string; items: unknown[] }[]>([]);

  const refreshProducts = useCallback(async (signal?: AbortSignal) => {
    const records = await listAllProducts(signal);
    setProducts(records);
  }, []);

  const refreshLots = useCallback(async (signal?: AbortSignal) => {
    const records = await listAllLots(signal);
    setLots(records);
  }, []);

  const refreshHub = useCallback(async (signal?: AbortSignal) => {
    await ensureSession(signal);
    const [productRows, lotRows, categoryRows, unitRows, supplierRows, transferRows] = await Promise.all([
      listAllProducts(signal).catch(() => [] as Product[]),
      listAllLots(signal).catch(() => [] as ProductLotRow[]),
      listMasterRecords("categories", { perPage: MAX_PAGE_SIZE, isActive: true }, signal)
        .then((r) => r.data.map(({ id, name }) => ({ id, name })))
        .catch(() => [] as { id: string; name: string }[]),
      listMasterRecords("units", { perPage: MAX_PAGE_SIZE, isActive: true }, signal)
        .then((r) => r.data.map(({ id, name, symbol }) => ({ id, name, symbol: symbol ?? "" })))
        .catch(() => [] as { id: string; name: string; symbol: string }[]),
      listMasterRecords("suppliers", { perPage: MAX_PAGE_SIZE }, signal)
        .then((r) => r.data.map(({ id, name, isActive }) => ({ id, name, isActive })))
        .catch(() => [] as { id: string; name: string; isActive: boolean }[]),
      listAllTransfers(signal).catch(() => []),
    ]);
    setProducts(productRows);
    setLots(lotRows);
    setCategories(categoryRows);
    setUnits(unitRows);
    setSuppliers(supplierRows);
    setTransfers(transferRows.map((t) => ({ id: t.id, status: t.status, items: t.items })));
  }, []);

  const ctx = useMemo(
    () => ({
      setActions,
      health,
      setHealth,
      sectionKpi,
      setSectionKpi,
      lots,
      setLots,
      products,
      setProducts,
      categories,
      units,
      suppliers,
      transfers,
      refreshHub: () => refreshHub(),
      refreshLots: () => refreshLots(),
      refreshProducts: () => refreshProducts(),
    }),
    [health, sectionKpi, lots, products, categories, units, suppliers, transfers, refreshHub, refreshLots, refreshProducts],
  );

  useEffect(() => {
    setSectionKpi(null);
    setHealth(null);
  }, [pathname]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshHub(controller.signal);
    return () => controller.abort();
  }, [refreshHub]);

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
