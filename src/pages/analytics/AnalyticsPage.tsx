import { useState } from "react";
import { DateFilter, PageHeader } from "@/components/ui/Chrome";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { movement, productName, products, topSelling } from "@/shared/mock";
import { money } from "@/utils/format";

export function AnalyticsPage() {
  const [range, setRange] = useState({ from: "2026-08-01", to: "2026-08-13" });
  const low = products.filter((p) => p.stock < 20);
  const maxMove = Math.max(...movement.map((m) => m.inQty + m.outQty), 1);

  return (
    <div>
      <PageHeader
        title="Analytics"
        hint="What sold, what is thin, and how qty moved through lots."
        actions={<DateFilter from={range.from} to={range.to} onChange={setRange} />}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="mb-2 text-[13px] font-semibold">Top selling</p>
          <Table>
            <THead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </THead>
            <tbody>
              {topSelling.map((row) => (
                <tr key={row.productId}>
                  <Td>{productName(row.productId)}</Td>
                  <Td className="text-right">{row.qty}</Td>
                  <Td className="text-right tabular-nums">{money(row.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="mb-2 text-[13px] font-semibold">Low stock</p>
          {low.map((p) => (
            <div key={p.id} className="flex justify-between border-t border-slate-100 py-1.5 first:border-0">
              <span>{p.name}</span>
              <span className="text-amber-700">
                {p.stock} {p.unit}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[13px] font-semibold">Product movement</p>
        <p className="mb-3 text-[12px] text-slate-500">In from lots · out from sales, credit, repair, and claims.</p>
        {movement.map((row) => (
          <div key={row.productId} className="mb-3">
            <div className="mb-1 flex justify-between text-[12px]">
              <span>{productName(row.productId)}</span>
              <span className="text-slate-500">
                in {row.inQty} · out {row.outQty} · left {row.left}
              </span>
            </div>
            <div className="flex h-2 overflow-hidden rounded bg-slate-100">
              <div className="bg-teal-700" style={{ width: `${(row.inQty / maxMove) * 100}%` }} />
              <div className="bg-rose-400" style={{ width: `${(row.outQty / maxMove) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
