import { useCallback, useEffect, useMemo, useRef } from "react";
import { MessageCircle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InvoiceThermalReceipt } from "@/components/print/InvoiceThermalReceipt";
import { useSettings } from "@/shared/settings";
import type { Customer, InvoiceLine, ReceiptLanguage } from "@/shared/types";
import {
  buildReceiptText,
  printReceiptHtml,
  thermalLabel,
  thermalWidthPx,
  openWhatsAppReceipt,
} from "@/utils/receiptShare";
import { isReceiptUrdu, resolveReceiptLanguage } from "@/utils/receiptLanguage";
import { receiptFontFamilyCss } from "@/shared/constants/receiptBranding";
import { toaster } from "@/components/common/Toast";
import { printThermalPng, type ThermalPrintResult } from "@/services/printers";
import { jameelNooriFontFaceCss } from "@/utils/receiptPrintFonts";
import { buildReceiptPrintHtml, RECEIPT_THERMAL_CSS } from "@/utils/receiptThermalStyles";
import { shouldSplitThermalBill, splitBillPages } from "@/utils/splitBillPages";
import { isTauri } from "@tauri-apps/api/core";
import { toBlob } from "html-to-image";

function thermalFailure(result: ThermalPrintResult) {
  if (result.ok) return null;
  if (result.reason === "not-desktop") {
    return "Silent print only works in the desktop app, not the browser.";
  }
  if (result.reason === "no-printer") {
    return "Set Settings → Printer → Thermal printer (exact OS name), then try again.";
  }
  return result.message?.trim() || "Print failed — check the printer name and connection.";
}

function slipMatchesLanguage(node: HTMLElement, urdu: boolean) {
  const marker = node.querySelector("[data-receipt-lang]")?.getAttribute("data-receipt-lang");
  if (urdu) {
    return marker === "UR" && (node.textContent?.includes("انوائس") ?? false);
  }
  return marker === "EN";
}

export function PrintPreview({
  open,
  onClose,
  customer,
  lines,
  total,
  discount = 0,
  paid,
  balanceBefore,
  balanceAfter,
  duplicate,
  invoiceNumber,
  splitOverride,
  printRequestId = 0,
  /** Skip the preview overlay — render off-screen and send straight to the system printer. */
  directPrint = false,
  /** POS Urdu/EN print button — overrides Settings → receipt language for this slip only. */
  languageOverride,
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer;
  lines: InvoiceLine[];
  total: number;
  discount?: number;
  paid: number;
  balanceBefore: number;
  balanceAfter: number;
  duplicate?: boolean;
  invoiceNumber?: string;
  /** POS F10 session toggle; falls back to settings.splitLongBill */
  splitOverride?: boolean;
  /** Increment to open the native print dialog as soon as this preview is ready. */
  printRequestId?: number;
  directPrint?: boolean;
  languageOverride?: ReceiptLanguage;
}) {
  const { settings: savedSettings } = useSettings();
  const receiptLanguage = resolveReceiptLanguage(languageOverride, savedSettings.receiptLanguage);
  const settings = useMemo(
    () => ({ ...savedSettings, receiptLanguage }),
    [receiptLanguage, savedSettings],
  );
  const slipRef = useRef<HTMLDivElement>(null);
  const handledPrintRequestRef = useRef("");
  const paper = settings.printerPaperWidth ?? settings.paperWidth;
  const thermal = settings.printSize === "thermal";
  const widthPx = thermal ? thermalWidthPx(paper) : 560;
  const printWidth = thermal ? (paper === "MM_58" ? "54mm" : "72mm") : "210mm";
  const printPageSize = thermal ? `${printWidth} auto` : "A4";
  const isUrdu = isReceiptUrdu(receiptLanguage);
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
        discount,
        paid,
        balanceBefore,
        balanceAfter,
        invoiceNumber,
      }),
    [settings, customer, lines, total, discount, paid, balanceBefore, balanceAfter, invoiceNumber],
  );

  const latinFontCss = receiptFontFamilyCss(settings.receiptFontFamily);

  const runPrintJob = useCallback(async () => {
    const node = slipRef.current;
    if (!node) return false;
    if (!slipMatchesLanguage(node, isUrdu)) return false;

    if (thermal) {
      if (!isTauri()) {
        toaster.error(thermalFailure({ ok: false, reason: "not-desktop" }) ?? "Print failed");
        if (directPrint) onClose();
        return true;
      }
      const pageNodes = [...node.querySelectorAll<HTMLElement>(".slip-page")];
      if (!pageNodes.length) return false;
      const copies = Math.max(1, Math.min(9, Number(settings.copies) || 1));
      for (let copy = 0; copy < copies; copy += 1) {
        for (const page of pageNodes) {
          const blob = await toBlob(page, {
            pixelRatio: 2,
            backgroundColor: "#ffffff",
            cacheBust: true,
          });
          if (!blob) {
            toaster.error("Could not capture the receipt.");
            if (directPrint) onClose();
            return true;
          }
          const png = new Uint8Array(await blob.arrayBuffer());
          const result = await printThermalPng(settings.printerName, png, paper);
          const fail = thermalFailure(result);
          if (fail) {
            toaster.error(fail);
            if (directPrint) onClose();
            return true;
          }
        }
      }
      if (directPrint) onClose();
      return true;
    }

    const html = buildReceiptPrintHtml({
      bodyHtml: node.innerHTML,
      urdu: isUrdu,
      printWidth,
      printPageSize,
      latinFontCss,
    });
    await printReceiptHtml(html);
    if (directPrint) onClose();
    return true;
  }, [
    directPrint,
    isUrdu,
    latinFontCss,
    onClose,
    paper,
    printPageSize,
    printWidth,
    settings.copies,
    settings.printerName,
    thermal,
  ]);

  const handlePrint = useCallback(() => {
    void runPrintJob();
    return true;
  }, [runPrintJob]);

  useEffect(() => {
    if (!open || printRequestId <= 0) return;
    const jobKey = `${printRequestId}:${isUrdu ? "UR" : "EN"}`;
    if (handledPrintRequestRef.current === jobKey) return;
    handledPrintRequestRef.current = jobKey;

    let cancelled = false;
    let attempts = 0;
    let timeoutId = 0;

    const tryPrint = () => {
      if (cancelled) return;
      attempts += 1;
      void runPrintJob().then((ok) => {
        if (cancelled || ok) return;
        if (attempts < 24) {
          timeoutId = window.setTimeout(tryPrint, isUrdu ? 80 : 50);
        }
      });
    };

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(tryPrint);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [isUrdu, open, printRequestId, runPrintJob]);

  if (!open) return null;

  const hasPhone = Boolean(customer.phone);
  const slip = (
    <div
      ref={slipRef}
      className="relative flex flex-col gap-4"
      style={{ width: widthPx }}
      data-print-lang={isUrdu ? "UR" : "EN"}
    >
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
            discount={discount}
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
  );

  // Direct print (EN + UR): render off-screen, then system print + paper cut.
  if (directPrint) {
    return (
      <div className="pointer-events-none fixed -left-[10000px] top-0" aria-hidden>
        <style>{`${jameelNooriFontFaceCss()}${RECEIPT_THERMAL_CSS}`}</style>
        {slip}
      </div>
    );
  }

  function handleWhatsApp() {
    if (!customer.phone) return;
    void openWhatsAppReceipt(customer.phone, receiptText);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/50 p-8 pt-10">
      <style>{`${jameelNooriFontFaceCss()}${RECEIPT_THERMAL_CSS}`}</style>
      <div className="flex gap-4">
        {slip}
        <div className="flex w-52 flex-col gap-2 rounded-lg bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">{isUrdu ? "پرنٹ" : "Print"}</p>
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
          <p className="text-[12px] text-slate-500">
            {thermal ? thermalLabel(paper) : "A4"} · {isUrdu ? "اردو" : "English"} ·{" "}
            {duplicate ? "Duplicate" : "First print"}
            {splitOn && pages.length > 1 ? ` · ${pages.length} pages` : ""}
            {settings.printerName ? ` · ${settings.printerName}` : ""}
          </p>
          <Button variant="primary" icon={<Printer size={14} />} onClick={() => handlePrint()}>
            {isUrdu ? "پرنٹ" : "Print"}
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
            Thermal prints go straight to Settings → Printer. Each split page is its own cut. F10
            toggles split cuts.
          </p>
        </div>
      </div>
    </div>
  );
}
