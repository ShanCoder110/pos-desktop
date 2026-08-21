import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DateFilter, PageHeader, StatCard } from "@/components/ui/Chrome";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { invoices, products, transactions, customers } from "@/shared/mock";
import { money } from "@/utils/format";

export function DashboardPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState({ from: "2026-08-01", to: "2026-08-13" });
  const sales = 5880;
  const owe = customers.filter((c) => c.balance < 0).reduce((s, c) => s + -c.balance, 0);
  const adv = customers.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0);
  const low = products.filter((p) => p.stock < 20);

  return (
    <div>
      <PageHeader
        title="Today at a glance"
        hint="Same date filter as invoices, money, and analytics."
        actions={<DateFilter from={range.from} to={range.to} onChange={setRange} />}
      />
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Sales" value={money(sales)} hint="13 Aug" />
        <StatCard label="They owe us" value={money(owe)} tone="rose" hint="Khata receivable" />
        <StatCard label="We hold as advance" value={money(adv)} tone="emerald" hint="Used on next bill" />
        <StatCard label="Low stock" value={String(low.length)} tone="amber" hint="Need reorder" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold">Recent bills</p>
            <button className="text-[12px] text-teal-700" onClick={() => navigate("/invoices")}>
              All invoices
            </button>
          </div>
          <Table>
            <THead>
              <tr>
                <Th>No</Th>
                <Th>Time</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <Td>{inv.no}</Td>
                  <Td>{inv.time}</Td>
                  <Td className="text-right tabular-nums">{money(inv.total)}</Td>
                  <Td className="capitalize">{inv.status}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="mb-2 text-[13px] font-semibold">Stock highlights</p>
          {low.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-t border-slate-100 py-1.5 first:border-0">
              <span>{p.name}</span>
              <span className="text-amber-700">{p.stock} {p.unit} left</span>
            </div>
          ))}
          <p className="mt-3 text-[13px] font-semibold">Product mix</p>
          {[
            { name: "Wire", pct: 48 },
            { name: "Switches", pct: 22 },
            { name: "Fans", pct: 18 },
            { name: "Lights", pct: 12 },
          ].map((row) => (
            <div key={row.name} className="mt-1.5">
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>{row.name}</span>
                <span>{row.pct}%</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded bg-slate-100">
                <div className="h-1.5 rounded bg-teal-700" style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[13px] font-semibold">Money today</p>
        <Table>
          <THead>
            <tr>
              <Th>Kind</Th>
              <Th>Party</Th>
              <Th>Note</Th>
              <Th className="text-right">In</Th>
              <Th className="text-right">Out</Th>
            </tr>
          </THead>
          <tbody>
            {transactions
              .filter((t) => t.date === "2026-08-13")
              .map((t) => (
                <tr key={t.id}>
                  <Td className="capitalize">{t.kind}</Td>
                  <Td>{t.party}</Td>
                  <Td className="text-slate-500">{t.note}</Td>
                  <Td className="text-right tabular-nums">{t.inflow ? money(t.inflow) : "—"}</Td>
                  <Td className="text-right tabular-nums">{t.outflow ? money(t.outflow) : "—"}</Td>
                </tr>
              ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
