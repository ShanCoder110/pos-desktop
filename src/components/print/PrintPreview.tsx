import { MessageCircle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSettings } from "@/shared/settings";
import { money } from "@/utils/format";
import type { Customer, InvoiceLine } from "@/shared/types";

export function PrintPreview({
  open,
  onClose,
  customer,
  lines,
  total,
  paid,
  balanceBefore,
  balanceAfter,
  duplicate,
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer;
  lines: InvoiceLine[];
  total: number;
  paid: number;
  balanceBefore: number;
  balanceAfter: number;
  duplicate?: boolean;
}) {
  const { settings } = useSettings();
  if (!open) return null;

  const hasPhone = Boolean(customer.phone);
  const thermal = settings.printSize === "thermal";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-8 pt-10">
      <div className="flex gap-4">
        <div
          className="relative bg-white text-slate-900 shadow-2xl"
          style={{
            width: thermal ? 280 : 560,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: thermal ? 11 : 13,
          }}
        >
          {duplicate ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-4xl font-bold tracking-widest text-rose-200/80">
              COPY
            </div>
          ) : null}
          <div className="p-4">
            <p className="text-center text-sm font-bold">{settings.shopName}</p>
            <p className="text-center text-[10px] text-slate-500">Main counter · Lahore</p>
            <p className="mt-2 text-center text-[10px]">{duplicate ? "Duplicate" : "Original"} · A-1043</p>
            <div className="my-2 border-t border-dashed border-slate-400" />
            <p>Cust: {customer.name}</p>
            {customer.phone ? <p>Ph: {customer.phone}</p> : null}
            <div className="my-2 border-t border-dashed border-slate-400" />
            {lines.map((line) => (
              <div key={line.id} className="flex justify-between gap-2">
                <span>
                  {line.qty} {line.unit} {line.name}
                </span>
                <span>{money(line.qty * line.price)}</span>
              </div>
            ))}
            <div className="my-2 border-t border-dashed border-slate-400" />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
            <div className="flex justify-between">
              <span>Paid</span>
              <span>{money(paid)}</span>
            </div>
            {settings.showBalanceOnSlip ? (
              <>
                <div className="flex justify-between">
                  <span>Old khata</span>
                  <span>{money(Math.abs(balanceBefore))} {balanceBefore < 0 ? "owe" : balanceBefore > 0 ? "adv" : ""}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>New khata</span>
                  <span>{money(Math.abs(balanceAfter))} {balanceAfter < 0 ? "owe" : balanceAfter > 0 ? "adv" : ""}</span>
                </div>
              </>
            ) : null}
            <div className="my-2 border-t border-dashed border-slate-400" />
            <p className="text-center text-[10px] text-slate-500">{settings.footer}</p>
          </div>
        </div>
        <div className="flex w-52 flex-col gap-2 rounded-lg bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">Print</p>
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
          <p className="text-[12px] text-slate-500">
            {thermal ? "Thermal 80mm" : "A4"} · {duplicate ? "Duplicate" : "First print"}
          </p>
          <Button variant="primary" icon={<Printer size={14} />}>
            Print
          </Button>
          <Button disabled={!hasPhone} icon={<MessageCircle size={14} />}>
            WhatsApp
          </Button>
          {!hasPhone ? (
            <p className="text-[11px] text-slate-500">No phone on this customer. WhatsApp stays off.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
