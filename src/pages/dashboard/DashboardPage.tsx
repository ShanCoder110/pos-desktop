import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight, Factory, PackageMinus, RotateCcw, Wallet } from "lucide-react";
import { Badge } from "@/components/common";
import { routes } from "@/shared/constants/routes";
import { catalog, invoices, productions, transfers, domainCustomers } from "@/shared/domain/mock";
import { money } from "@/utils/format";

const salesToday = invoices.filter((i) => i.createdAt.startsWith("2026-08-13") && i.status === "COMPLETED");
const cashToday = salesToday.reduce((s, i) => s + i.paidAmount, 0);
const creditOpen = domainCustomers.filter((c) => c.currentBalance > 0).reduce((s, c) => s + c.currentBalance, 0);
const low = catalog.filter((p) => p.onHand > 0 && p.onHand < p.minimumStock).length;

const chart = [
  { label: "Mon", value: 62000 },
  { label: "Tue", value: 71000 },
  { label: "Wed", value: 54000 },
  { label: "Thu", value: 88000 },
  { label: "Fri", value: 96000 },
  { label: "Sat", value: 102000 },
  { label: "Today", value: cashToday + 18500 },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const max = Math.max(...chart.map((p) => p.value), 1);
  const pendingJobs = productions.filter((p) => p.status !== "COMPLETED" && p.status !== "CANCELLED").length;
  const pendingTransfers = transfers.filter((t) => t.status === "PENDING").length;
  const pendingReturns = 1;

  return (
    <div>
      <div className="kpi-row [display:grid] [grid-template-columns:repeat(4,_minmax(0,_1fr))] [gap:12px] [flex-shrink:0]">
        <article className="panel [min-height:0] [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)] kpi-card [padding:12px_14px]">
          <p className="kpi-label [font-size:11px] [font-weight:650] [color:var(--muted)]">Today's sales</p>
          <p className="kpi-value [margin-top:6px] [font-size:22px] [font-weight:750] [letter-spacing:-0.03em] [font-variant-numeric:tabular-nums] [color:var(--ink)] [line-height:1.1]">{money(salesToday.reduce((s, i) => s + i.total, 0))}</p>
        </article>
        <article className="panel [min-height:0] [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)] kpi-card [padding:12px_14px]">
          <p className="kpi-label [font-size:11px] [font-weight:650] [color:var(--muted)]">Cash / bank in</p>
          <p className="kpi-value [margin-top:6px] [font-size:22px] [font-weight:750] [letter-spacing:-0.03em] [font-variant-numeric:tabular-nums] [color:var(--ink)] [line-height:1.1]">{money(cashToday)}</p>
        </article>
        <article className="panel [min-height:0] [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)] kpi-card [padding:12px_14px]">
          <p className="kpi-label [font-size:11px] [font-weight:650] [color:var(--muted)]">Customer owes</p>
          <p className="kpi-value [margin-top:6px] [font-size:22px] [font-weight:750] [letter-spacing:-0.03em] [font-variant-numeric:tabular-nums] [color:var(--ink)] [line-height:1.1]">{money(creditOpen)}</p>
        </article>
        <article className="panel [min-height:0] [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)] kpi-card [padding:12px_14px]">
          <p className="kpi-label [font-size:11px] [font-weight:650] [color:var(--muted)]">Low stock SKUs</p>
          <p className="kpi-value [margin-top:6px] [font-size:22px] [font-weight:750] [letter-spacing:-0.03em] [font-variant-numeric:tabular-nums] [color:var(--ink)] [line-height:1.1]">{low}</p>
        </article>
      </div>

      <div className="dash-mid [display:grid] [grid-template-columns:minmax(0,_1.65fr)_minmax(280px,_0.9fr)] [gap:12px] [flex:1] [min-height:0]">
        <section className="panel [min-height:0] [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)]">
          <div className="panel-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [padding:12px_14px_0] [flex-shrink:0]">
            <h2 className="panel-title [font-size:13px] [font-weight:700] [color:var(--ink)]">Sales this week</h2>
          </div>
          <div className="panel-body [flex:1] [min-height:0] [overflow:hidden] [padding:12px_14px_14px]">
            <div className="chart [height:100%] [min-height:0] [display:flex] [align-items:stretch] [gap:10px]">
              {chart.map((point) => (
                <div key={point.label} className="chart-col [flex:1] [min-width:0] [min-height:0] [display:flex] [flex-direction:column] [justify-content:flex-end] [align-items:center] [gap:8px]">
                  <div className="chart-bar-wrap [width:100%] [flex:1] [min-height:0] [display:flex] [align-items:flex-end] [justify-content:center]">
                    <div
                      className={point.label === "Today" ? "chart-bar [width:46%] [max-width:28px] [border-radius:6px_6px_3px_3px] [background:color-mix(in_srgb,_var(--accent)_78%,_#99f6e4)] is-today" : "chart-bar [width:46%] [max-width:28px] [border-radius:6px_6px_3px_3px] [background:color-mix(in_srgb,_var(--accent)_78%,_#99f6e4)]"}
                      style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }}
                      title={money(point.value)}
                    />
                  </div>
                  <span className="chart-label [font-size:11px] [font-weight:650] [color:var(--muted)]">{point.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel [min-height:0] [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)]">
          <div className="panel-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [padding:12px_14px_0] [flex-shrink:0]">
            <h2 className="panel-title [font-size:13px] [font-weight:700] [color:var(--ink)]">Needs action</h2>
            <AlertTriangle size={14} color="var(--gold)" />
          </div>
          <div className="panel-body [flex:1] [min-height:0] [overflow:hidden] [padding:12px_14px_14px]" style={{ paddingTop: 6, paddingBottom: 8 }}>
            {[
              { icon: PackageMinus, tone: "is-warn", title: `${low} products below minimum`, sub: "Open products to check qty and reorder as a new lot", to: routes.productsLow },
              { icon: Wallet, tone: "is-rose", title: `${money(creditOpen)} customer udhaar`, sub: "Record a payment on Credit / Udhaar", to: routes.credit },
              { icon: RotateCcw, tone: "", title: `${pendingReturns} return to review`, sub: "Refund or replacement against an invoice", to: routes.salesReturns },
              { icon: Factory, tone: "", title: `${pendingJobs} production jobs open`, sub: "Components come off lots via PRODUCTION_USE", to: routes.production },
              { icon: AlertTriangle, tone: "is-warn", title: `${pendingTransfers} branch transfer pending`, sub: "Complete to write TRANSFER_IN / OUT", to: routes.transfers },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <button key={row.title} type="button" className="attn-row [display:flex] [align-items:center] [gap:10px] [width:100%] [padding:10px_8px] [border:0] [border-radius:8px] [background:transparent] [color:var(--ink)] [text-align:left] [cursor:pointer]" onClick={() => navigate(row.to)}>
                  <span className={row.tone ? `attn-ico [width:30px] [height:30px] [border-radius:8px] [display:grid] [place-items:center] [flex-shrink:0] [background:var(--accent-bg)] [color:var(--accent-deep)] ${row.tone}` : "attn-ico [width:30px] [height:30px] [border-radius:8px] [display:grid] [place-items:center] [flex-shrink:0] [background:var(--accent-bg)] [color:var(--accent-deep)]"}>
                    <Icon size={15} strokeWidth={1.8} />
                  </span>
                  <span className="attn-copy [flex:1] [min-width:0]">
                    <span className="attn-title [font-size:13px] [font-weight:650]">{row.title}</span>
                    <span className="attn-sub [margin-top:1px] [font-size:11px] [color:var(--muted)]">{row.sub}</span>
                  </span>
                  <ChevronRight size={14} color="var(--muted)" />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="dash-low [display:grid] [grid-template-columns:minmax(0,_1.65fr)_minmax(280px,_0.9fr)] [gap:12px] [flex:1] [min-height:0]">
        <section className="panel [min-height:0] [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)]">
          <div className="panel-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [padding:12px_14px_0] [flex-shrink:0]">
            <h2 className="panel-title [font-size:13px] [font-weight:700] [color:var(--ink)]">Latest invoices</h2>
            <button type="button" className="auth-link [font-weight:600] [color:var(--accent)] [text-decoration:none]" style={{ fontSize: 12 }} onClick={() => navigate(routes.sales)}>
              All invoices
            </button>
          </div>
          <div className="panel-body [flex:1] [min-height:0] [overflow:hidden] [padding:12px_14px_14px]" style={{ paddingTop: 8 }}>
            <table className="dash-table [width:100%] [border-collapse:collapse]">
              <thead>
                <tr>
                  <th>No</th>
                  <th>When</th>
                  <th>Pay</th>
                  <th className="num">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 5).map((row) => (
                  <tr key={row.id}>
                    <td className="num" style={{ textAlign: "left", fontFamily: "var(--mono)", fontSize: 12 }}>
                      {row.invoiceNumber}
                    </td>
                    <td>{row.createdAt}</td>
                    <td>{row.paymentStatus}</td>
                    <td className="num">{money(row.total)}</td>
                    <td>
                      <Badge tone={row.status === "COMPLETED" ? "ok" : "danger"}>{row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel [min-height:0] [display:flex] [flex-direction:column] [overflow:hidden] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)]">
          <div className="panel-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [padding:12px_14px_0] [flex-shrink:0]">
            <h2 className="panel-title [font-size:13px] [font-weight:700] [color:var(--ink)]">What happens next</h2>
          </div>
          <div className="panel-body [flex:1] [min-height:0] [overflow:hidden] [padding:12px_14px_14px]">
            <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]" style={{ marginBottom: 10 }}>
              A sale writes Invoice + InvoiceItem, consumes FIFO ProductLot, posts StockMovement SALE, and if unpaid posts CustomerLedger CREDIT_SALE.
            </p>
            <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
              Receive stock on Lots. Move between shops on Transfers. Assemble fans on Production. Staff permissions live on Staff.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
