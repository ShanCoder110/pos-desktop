import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Ban, CheckCircle2, Clock, Gift, Package, Receipt, RotateCcw, Wallet } from "lucide-react";
import { KpiCard, TabSheet, Tabs } from "@/components/common";
import { SALES_SECTION_TABS } from "@/shared/constants/sales";
import type { InvoiceRow, ReturnRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { money } from "@/utils/format";
import { ensureSession } from "@/services/auth";
import { listAllInvoices } from "@/services/sales";
import { listAllReturns } from "@/services/credit";
import { listAllProducts } from "@/services/products";

type HubCtx = {
  sectionKpi: string | null;
  setSectionKpi: (value: string | null) => void;
  invoices: InvoiceRow[];
  returns: ReturnRow[];
  products: Product[];
};

const SalesHubContext = createContext<HubCtx>({
  sectionKpi: null,
  setSectionKpi: () => undefined,
  invoices: [],
  returns: [],
  products: [],
});

export function useSalesHub() {
  return useContext(SalesHubContext);
}

function InvoiceKpis() {
  const { sectionKpi, setSectionKpi, invoices } = useSalesHub();
  const completed = invoices.filter((r) => r.status === "COMPLETED");
  const paid = invoices.filter((r) => r.paymentStatus === "PAID" && r.status === "COMPLETED");
  const partial = invoices.filter((r) => r.paymentStatus === "PARTIAL");
  const credit = invoices.filter((r) => r.paymentStatus === "CREDIT");
  const cancelled = invoices.filter((r) => r.status === "CANCELLED");

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Bills" value={completed.length} hint="Completed" tone="ok" icon={<Receipt size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="Paid" value={paid.length} hint={money(paid.reduce((s, r) => s + r.paidAmount, 0))} tone="ok" icon={<CheckCircle2 size={16} />} active={sectionKpi === "paid"} onClick={() => toggle("paid")} />
      <KpiCard label="Partial" value={partial.length} hint="Still collecting" tone="warn" icon={<Clock size={16} />} active={sectionKpi === "partial"} onClick={() => toggle("partial")} />
      <KpiCard label="On khata" value={credit.length} hint={money(completed.reduce((s, r) => s + r.creditAmount, 0))} tone="warn" icon={<Wallet size={16} />} active={sectionKpi === "credit"} onClick={() => toggle("credit")} />
      <KpiCard label="Cancelled" value={cancelled.length} hint="No stock change" tone="danger" icon={<Ban size={16} />} active={sectionKpi === "cancelled"} onClick={() => toggle("cancelled")} />
    </div>
  );
}

function ReturnKpis() {
  const { sectionKpi, setSectionKpi, returns } = useSalesHub();
  const refunds = returns.filter((r) => r.type === "REFUND");
  const replacements = returns.filter((r) => r.type === "REPLACEMENT");
  const items = returns.reduce((s, r) => s + r.returnItems.length, 0);
  const refunded = returns.reduce((s, r) => s + r.refundAmount, 0);

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Tickets" value={returns.length} hint="All types" tone="ok" icon={<RotateCcw size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="Refunds" value={refunds.length} hint="Cash out" tone="warn" icon={<Wallet size={16} />} active={sectionKpi === "refund"} onClick={() => toggle("refund")} />
      <KpiCard label="Replacements" value={replacements.length} hint="New stock out" tone="phantom" icon={<Receipt size={16} />} active={sectionKpi === "replace"} onClick={() => toggle("replace")} />
      <KpiCard label="Refunded" value={money(refunded)} hint="Money OUT" tone="danger" icon={<Wallet size={16} />} />
      <KpiCard label="Lines" value={items} hint="Returned items" tone="stale" icon={<Receipt size={16} />} />
    </div>
  );
}

function ClaimKpis() {
  const { sectionKpi, setSectionKpi, products } = useSalesHub();
  const claimed = products.filter((p) => (p.claims ?? 0) > 0);
  const damaged = products.filter((p) => (p.damaged ?? 0) > 0);
  const claimCount = claimed.reduce((s, p) => s + (p.claims ?? 0), 0);
  const damageCount = damaged.reduce((s, p) => s + (p.damaged ?? 0), 0);

  function toggle(id: string) {
    setSectionKpi(sectionKpi === id ? null : id);
  }

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Claimed" value={claimed.length} hint="SKUs with claims" tone="warn" icon={<Gift size={16} />} active={sectionKpi === null} onClick={() => setSectionKpi(null)} />
      <KpiCard label="Claims" value={claimCount} hint="Open tickets" tone="stale" icon={<Package size={16} />} />
      <KpiCard label="Damaged" value={damaged.length} hint="SKUs with damage" tone="danger" icon={<Ban size={16} />} active={sectionKpi === "damaged"} onClick={() => toggle("damaged")} />
      <KpiCard label="Damage qty" value={damageCount} hint="Units written off" tone="danger" icon={<Ban size={16} />} />
      <KpiCard label="Catalog" value={products.length} hint="All products" tone="phantom" icon={<Package size={16} />} />
    </div>
  );
}

function ProductSalesKpis() {
  const { invoices, products } = useSalesHub();
  const completed = invoices.filter((invoice) => invoice.status === "COMPLETED");
  const totals = completed.reduce((summary, invoice) => {
    invoice.items.forEach((item) => {
      const product = products.find((row) => row.id === item.productId);
      summary.sales += item.total;
      summary.quantity += item.baseQuantity;
      summary.profit += item.total - item.baseQuantity * (product?.cost ?? 0);
      summary.products.add(item.productId);
    });
    return summary;
  }, { sales: 0, profit: 0, quantity: 0, products: new Set<string>() });
  const margin = totals.sales > 0 ? (totals.profit / totals.sales) * 100 : 0;

  return (
    <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
      <KpiCard label="Sales" value={money(totals.sales)} hint="Invoices" tone="ok" icon={<Wallet size={16} />} />
      <KpiCard label="Profit" value={money(totals.profit)} hint="Sales minus cost" tone="ok" icon={<Wallet size={16} />} />
      <KpiCard label="Margin" value={`${margin.toFixed(1)}%`} hint="Gross margin" tone="phantom" icon={<Receipt size={16} />} />
      <KpiCard label="Qty sold" value={totals.quantity} hint="Base units" tone="warn" icon={<Package size={16} />} />
      <KpiCard label="Products sold" value={totals.products.size} hint="Distinct products" tone="stale" icon={<Package size={16} />} />
    </div>
  );
}

function SalesHubKpis() {
  const { pathname } = useLocation();
  if (pathname.endsWith("/returns")) return <ReturnKpis />;
  if (pathname.endsWith("/claims")) return <ClaimKpis />;
  if (pathname.endsWith("/products")) return <ProductSalesKpis />;
  return <InvoiceKpis />;
}

export function SalesLayout() {
  const { pathname } = useLocation();
  const [sectionKpi, setSectionKpi] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const ctx = useMemo(
    () => ({ sectionKpi, setSectionKpi, invoices, returns, products }),
    [sectionKpi, invoices, returns, products],
  );

  useEffect(() => {
    setSectionKpi(null);
  }, [pathname]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const [invoiceRows, returnRows, productRows] = await Promise.all([
        listAllInvoices(controller.signal).catch(() => [] as InvoiceRow[]),
        listAllReturns(controller.signal).catch(() => [] as ReturnRow[]),
        listAllProducts(controller.signal).catch(() => [] as Product[]),
      ]);
      setInvoices(invoiceRows);
      setReturns(returnRows);
      setProducts(productRows);
    })();
    return () => controller.abort();
  }, []);

  return (
    <SalesHubContext.Provider value={ctx}>
      <div className="products-hub [min-height:0]">
        <div className="ui-page-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [width:100%] [flex-shrink:0]">
          <h1 className="ui-page-title [font-size:22px] [font-weight:800] [letter-spacing:-0.03em] [color:var(--ink)] [min-width:0]">Sales</h1>
        </div>
        <SalesHubKpis />
        <TabSheet tabs={<Tabs items={[...SALES_SECTION_TABS]} ariaLabel="Sales sections" />}>
          <Outlet />
        </TabSheet>
      </div>
    </SalesHubContext.Provider>
  );
}
