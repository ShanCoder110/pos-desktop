import { useMemo, useRef } from "react";
import { MessageCircle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InvoiceThermalReceipt } from "@/components/print/InvoiceThermalReceipt";
import { useSettings } from "@/shared/settings";
import type { Customer, InvoiceLine } from "@/shared/types";
import {
  buildReceiptText,
  printReceiptHtml,
  thermalLabel,
  thermalWidthPx,
  openWhatsAppReceipt,
} from "@/utils/receiptShare";
import { jameelNooriFontFaceCss } from "@/utils/receiptPrintFonts";
import { RECEIPT_THERMAL_CSS } from "@/utils/receiptThermalStyles";
import { shouldSplitThermalBill, splitBillPages } from "@/utils/splitBillPages";

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
  splitOverride,
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
  /** POS F10 session toggle; falls back to settings.splitLongBill */
  splitOverride?: boolean;
}) {
  const { settings } = useSettings();
  const slipRef = useRef<HTMLDivElement>(null);
  const paper = settings.printerPaperWidth ?? settings.paperWidth;
  const thermal = settings.printSize === "thermal";
  const widthPx = thermal ? thermalWidthPx(paper) : 560;
  const splitOn = shouldSplitThermalBill(splitOverride ?? settings.splitLongBill, paper);
  const pages = useMemo(
    () =>
      splitOn
        ? splitBillPages(lines, {
            first: settings.splitFirstPageItems,
            middle: settings.splitMiddlePageItems,
            last: settings.splitLastPageItems,
          })
        : [
            {
              items: lines,
              kind: "single" as const,
              pageIndex: 1,
              pageCount: 1,
            },
          ],
    [
      lines,
      splitOn,
      settings.splitFirstPageItems,
      settings.splitMiddlePageItems,
      settings.splitLastPageItems,
    ],
  );

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
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Receipt</title><style>
      ${jameelNooriFontFaceCss()}
      @page { size: 72mm auto; margin: 0; }
      html, body { width: 72mm; max-width: 72mm; margin: 0; padding: 0; background: #fff; }
      .slip-page { break-after: page; width: 100%; }
      .slip-page:last-child { break-after: auto; }
      .thermal-receipt-preview { width: 100%; max-width: 100%; }
      .receipt-inner { width: 100%; max-width: 100%; box-sizing: border-box; }
      ${RECEIPT_THERMAL_CSS}
    </style></head><body>${node.innerHTML}</body></html>`;
    printReceiptHtml(html);
  }

  function handleWhatsApp() {
    if (!customer.phone) return;
    void openWhatsAppReceipt(customer.phone, receiptText);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/50 p-8 pt-10">
      <style>{`${jameelNooriFontFaceCss()}${RECEIPT_THERMAL_CSS}`}</style>
      <div className="flex gap-4">
        <div ref={slipRef} className="relative flex flex-col gap-4" style={{ width: widthPx }}>
          {pages.map((page) => (
            <div
              key={`${page.pageIndex}-${page.kind}`}
              className="slip-page relative bg-white shadow-2xl"
            >
              <InvoiceThermalReceipt
                settings={settings}
                customer={customer}
                lines={lines}
                total={total}
                paid={paid}
                balanceBefore={balanceBefore}
                balanceAfter={balanceAfter}
                duplicate={duplicate}
                invoiceNumber={invoiceNumber}
                page={page}
              />
            </div>
          ))}
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
            {splitOn && pages.length > 1 ? ` · ${pages.length} pages` : ""}
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
            Split cuts use Printer settings (products per page). F10 toggles for this sale.
          </p>
        </div>
      </div>
    </div>
  );
}
