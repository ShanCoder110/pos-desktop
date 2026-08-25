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
      <div className="kpi-row">
        <article className="panel kpi-card">
          <p className="kpi-label">Today's sales</p>
          <p className="kpi-value">{money(salesToday.reduce((s, i) => s + i.total, 0))}</p>
        </article>
        <article className="panel kpi-card">
          <p className="kpi-label">Cash / bank in</p>
          <p className="kpi-value">{money(cashToday)}</p>
        </article>
        <article className="panel kpi-card">
          <p className="kpi-label">Customer owes</p>
          <p className="kpi-value">{money(creditOpen)}</p>
        </article>
        <article className="panel kpi-card">
          <p className="kpi-label">Low stock SKUs</p>
          <p className="kpi-value">{low}</p>
        </article>
      </div>

      <div className="dash-mid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Sales this week</h2>
          </div>
          <div className="panel-body">
            <div className="chart">
              {chart.map((point) => (
                <div key={point.label} className="chart-col">
                  <div className="chart-bar-wrap">
                    <div
                      className={point.label === "Today" ? "chart-bar is-today" : "chart-bar"}
                      style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }}
                      title={money(point.value)}
                    />
                  </div>
                  <span className="chart-label">{point.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Needs action</h2>
            <AlertTriangle size={14} color="var(--gold)" />
          </div>
          <div className="panel-body" style={{ paddingTop: 6, paddingBottom: 8 }}>
            {[
              { icon: PackageMinus, tone: "is-warn", title: `${low} products below minimum`, sub: "Open stock to reorder as a new lot", to: routes.stock },
              { icon: Wallet, tone: "is-rose", title: `${money(creditOpen)} customer udhaar`, sub: "Record a payment on Credit / Udhaar", to: routes.credit },
              { icon: RotateCcw, tone: "", title: `${pendingReturns} return to review`, sub: "Refund or replacement against an invoice", to: routes.returns },
              { icon: Factory, tone: "", title: `${pendingJobs} production jobs open`, sub: "Components come off lots via PRODUCTION_USE", to: routes.production },
              { icon: AlertTriangle, tone: "is-warn", title: `${pendingTransfers} branch transfer pending`, sub: "Complete to write TRANSFER_IN / OUT", to: routes.transfers },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <button key={row.title} type="button" className="attn-row" onClick={() => navigate(row.to)}>
                  <span className={row.tone ? `attn-ico ${row.tone}` : "attn-ico"}>
                    <Icon size={15} strokeWidth={1.8} />
                  </span>
                  <span className="attn-copy">
                    <span className="attn-title">{row.title}</span>
                    <span className="attn-sub">{row.sub}</span>
                  </span>
                  <ChevronRight size={14} color="var(--muted)" />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="dash-low">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Latest invoices</h2>
            <button type="button" className="auth-link" style={{ fontSize: 12 }} onClick={() => navigate(routes.invoices)}>
              All invoices
            </button>
          </div>
          <div className="panel-body" style={{ paddingTop: 8 }}>
            <table className="dash-table">
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

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">What happens next</h2>
          </div>
          <div className="panel-body">
            <p className="ui-note" style={{ marginBottom: 10 }}>
              A sale writes Invoice + InvoiceItem, consumes FIFO ProductLot, posts StockMovement SALE, and if unpaid posts CustomerLedger CREDIT_SALE.
            </p>
            <p className="ui-note">
              Receive stock on Lots. Move between shops on Transfers. Assemble fans on Production. Staff permissions live on Staff.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
