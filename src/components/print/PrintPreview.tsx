import { useMemo, useRef } from "react";
import { MessageCircle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSettings } from "@/shared/settings";
import { money } from "@/utils/format";
import type { Customer, InvoiceLine } from "@/shared/types";
import {
  buildReceiptText,
  printReceiptHtml,
  thermalLabel,
  thermalWidthPx,
  whatsAppShareUrl,
} from "@/utils/receiptShare";

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
  invoiceNumber,
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
  invoiceNumber?: string;
}) {
  const { settings } = useSettings();
  const slipRef = useRef<HTMLDivElement>(null);
  const paper = settings.printerPaperWidth ?? settings.paperWidth;
  const thermal = settings.printSize === "thermal";
  const widthPx = thermal ? thermalWidthPx(paper) : 560;

  const receiptText = useMemo(
    () =>
      buildReceiptText({
        settings,
        customer,
        lines,
        total,
        paid,
        balanceBefore,
        balanceAfter,
        invoiceNumber,
      }),
    [settings, customer, lines, total, paid, balanceBefore, balanceAfter, invoiceNumber],
  );

  if (!open) return null;

  const hasPhone = Boolean(customer.phone);

  function handlePrint() {
    const node = slipRef.current;
    if (!node) {
      window.print();
      return;
    }
    const html = `<!DOCTYPE html><html><head><title>Receipt</title><style>
      @page { margin: 4mm; }
      body { font-family: ui-monospace, Menlo, monospace; font-size: ${thermal ? 11 : 13}px; width: ${widthPx}px; }
    </style></head><body>${node.innerHTML}</body></html>`;
    printReceiptHtml(html);
  }

  function handleWhatsApp() {
    if (!customer.phone) return;
    window.open(whatsAppShareUrl(customer.phone, receiptText), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-8 pt-10">
      <div className="flex gap-4">
        <div
          ref={slipRef}
          className="relative bg-white text-slate-900 shadow-2xl"
          style={{
            width: widthPx,
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
            <p className="text-center text-sm font-bold">
              {settings.receiptShopName || settings.shopName}
            </p>
            <p className="text-center text-[10px] text-slate-500">{settings.address}</p>
            {invoiceNumber ? (
              <p className="mt-1 text-center text-[10px] font-semibold">{invoiceNumber}</p>
            ) : null}
            <p className="mt-2 text-center text-[10px]">
              {duplicate ? "Duplicate" : "Original"} · {new Date().toLocaleString("en-GB")}
            </p>
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
                  <span>Previous balance</span>
                  <span>
                    {money(Math.abs(balanceBefore))}{" "}
                    {balanceBefore < 0 ? "owe" : balanceBefore > 0 ? "adv" : ""}
                  </span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Balance after</span>
                  <span>
                    {money(Math.abs(balanceAfter))}{" "}
                    {balanceAfter < 0 ? "owe" : balanceAfter > 0 ? "adv" : ""}
                  </span>
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
            {thermal ? thermalLabel(paper) : "A4"} · {duplicate ? "Duplicate" : "First print"}
          </p>
          <Button variant="primary" icon={<Printer size={14} />} onClick={handlePrint}>
            Print
          </Button>
          <Button disabled={!hasPhone} icon={<MessageCircle size={14} />} onClick={handleWhatsApp}>
            WhatsApp
          </Button>
          {!hasPhone ? (
            <p className="text-[11px] text-slate-500">
              No phone on this customer. WhatsApp stays off.
            </p>
          ) : null}
          <p className="text-[10px] text-slate-400">
            If the printer is offline, use Print to open the system dialog or save as PDF.
          </p>
        </div>
      </div>
    </div>
  );
}
