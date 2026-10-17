import type { InvoiceRow } from "@/shared/domain/types";
import {
  calculateInvoiceGrossProfit,
  calculateInvoiceProfitHold,
  calculateInvoiceRealizedProfit,
} from "@/pages/credit/creditProfitUtils";
import { money } from "@/utils/format";

/** Gross / realized / on-hold profit for an invoice detail drawer (not list columns). */
export function InvoiceProfitSummary({ invoice }: { invoice: InvoiceRow }) {
  const gross = calculateInvoiceGrossProfit(invoice);
  const realized = calculateInvoiceRealizedProfit(invoice);
  const hold = calculateInvoiceProfitHold(invoice);

  return (
    <section className="grid gap-2">
      <h3 className="text-[12px] font-extrabold text-ink">Profit</h3>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line bg-paper p-3">
          <span className="block text-[10px] font-semibold text-muted">Gross profit</span>
          <strong className="mt-1 block text-[14px] tabular-nums text-ink">{money(gross)}</strong>
        </div>
        <div className="rounded-lg border border-line bg-paper p-3">
          <span className="block text-[10px] font-semibold text-muted">Realized</span>
          <strong className="mt-1 block text-[14px] tabular-nums text-[var(--ok)]">
            {money(realized)}
          </strong>
        </div>
        <div className="rounded-lg border border-line bg-paper p-3">
          <span className="block text-[10px] font-semibold text-muted">Profit on hold</span>
          <strong
            className={`mt-1 block text-[14px] tabular-nums ${hold > 0.009 ? "text-[var(--warn-ink,#b45309)]" : "text-muted"}`}
          >
            {money(hold)}
          </strong>
        </div>
      </div>
    </section>
  );
}
