import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Printer, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Modal, SelectInput, TextInput } from "@/components/common";
import { InvoiceThermalReceipt } from "@/components/print/InvoiceThermalReceipt";
import { printSizeFromPaper, useSettings } from "@/shared/settings";
import type { Customer, InvoiceLine, PaperWidth, ReceiptLanguage } from "@/shared/types";
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
import {
  listSystemPrinters,
  printThermalPngBatch,
  type SystemPrinter,
  type ThermalPrintResult,
} from "@/services/printers";
import { jameelNooriFontFaceCss } from "@/utils/receiptPrintFonts";
import { buildReceiptPrintHtml, RECEIPT_THERMAL_CSS } from "@/utils/receiptThermalStyles";
import { shouldSplitThermalBill, splitBillPages } from "@/utils/splitBillPages";
import { isTauri } from "@tauri-apps/api/core";
import { captureReceiptPages } from "@/utils/receiptCapture";

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
  onPrintingChange,
  onPrintDraft,
  savingDraft = false,
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
  /** Increment to send a silent print as soon as this preview is ready. */
  printRequestId?: number;
  directPrint?: boolean;
  languageOverride?: ReceiptLanguage;
  /** True while a slip is being sent, so the cashier print controls stay disabled. */
  onPrintingChange?: (printing: boolean) => void;
  /** Save a POS draft before printing; a draft receipt is not an invoice. */
  onPrintDraft?: () => void;
  savingDraft?: boolean;
}) {
  const { settings: savedSettings, setSettings } = useSettings();
  const receiptLanguage = resolveReceiptLanguage(languageOverride, savedSettings.receiptLanguage);
  const settings = useMemo(
    () => ({ ...savedSettings, receiptLanguage }),
    [receiptLanguage, savedSettings],
  );
  const slipRef = useRef<HTMLDivElement>(null);
  const handledPrintRequestRef = useRef("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onPrintingChangeRef = useRef(onPrintingChange);
  onPrintingChangeRef.current = onPrintingChange;
  const [printing, setPrinting] = useState(false);
  const printingLockRef = useRef(false);
  const sendingRef = useRef(false);
  const printerOverrideRef = useRef<{ name: string; paper: PaperWidth } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupName, setSetupName] = useState("");
  const [setupPaper, setSetupPaper] = useState<PaperWidth>("MM_80");
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinter[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const desktop = isTauri();
  const paper = settings.printerPaperWidth ?? settings.paperWidth;
  const thermal = settings.printSize === "thermal";
  const widthPx = thermal ? thermalWidthPx(paper) : 560;
  const printWidth = thermal ? (paper === "MM_58" ? "54mm" : "72mm") : "210mm";
  const printPageSize = thermal ? `${printWidth} auto` : "A4";
  const isUrdu = isReceiptUrdu(receiptLanguage);
  const latinFontCss = receiptFontFamilyCss(settings.receiptFontFamily);
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

  const printDialog = useCallback(
    async (node: HTMLElement) => {
      const html = buildReceiptPrintHtml({
        bodyHtml: node.innerHTML,
        urdu: isUrdu,
        printWidth,
        printPageSize,
        latinFontCss,
      });
      await printReceiptHtml(html);
    },
    [isUrdu, latinFontCss, printPageSize, printWidth],
  );

  const runPrintJob = useCallback(async () => {
    const node = slipRef.current;
    if (!node) return false;
    if (!slipMatchesLanguage(node, isUrdu)) return false;

    try {
      // Browser / Vite: use the system print dialog. Desktop: silent ESC/POS.
      if (!isTauri()) {
        await printDialog(node);
        printerOverrideRef.current = null;
        if (directPrint) onCloseRef.current();
        return true;
      }

      const chosen = printerOverrideRef.current;
      const printerName = (chosen?.name ?? settings.printerName)?.trim() ?? "";
      const printPaper = chosen?.paper ?? paper;
      if (!printerName) {
        toaster.error("Select a printer first.");
        printerOverrideRef.current = null;
        if (directPrint) onCloseRef.current();
        return true;
      }

      const copies = Math.max(1, Math.min(9, Number(settings.copies) || 1));
      const pngPages = await captureReceiptPages(node, printPaper);
      const result = await printThermalPngBatch(printerName, pngPages, printPaper, copies);
      const fail = thermalFailure(result);
      if (fail) {
        toaster.error(fail);
        printerOverrideRef.current = null;
        if (directPrint) onCloseRef.current();
        return true;
      }
      toaster.success("Receipt sent to printer.");
      printerOverrideRef.current = null;
      if (directPrint) onCloseRef.current();
      return true;
    } catch (error) {
      toaster.error(error instanceof Error ? error.message : "Print failed");
      printerOverrideRef.current = null;
      if (directPrint) onCloseRef.current();
      return true;
    }
  }, [directPrint, isUrdu, paper, printDialog, settings.copies, settings.printerName]);

  const setBusy = useCallback((busy: boolean) => {
    printingLockRef.current = busy;
    setPrinting(busy);
    onPrintingChangeRef.current?.(busy);
  }, []);

  const beginSend = useCallback(() => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    let attempts = 0;
    const tryPrint = () => {
      void runPrintJob().then((ok) => {
        if (ok) {
          sendingRef.current = false;
          setBusy(false);
          return;
        }
        attempts += 1;
        if (attempts < 24) {
          window.setTimeout(tryPrint, isUrdu ? 80 : 50);
          return;
        }
        sendingRef.current = false;
        setBusy(false);
        toaster.error("Receipt was not ready to print. Please try Print again.");
        if (directPrint) onCloseRef.current();
      });
    };
    tryPrint();
  }, [directPrint, isUrdu, runPrintJob, setBusy]);

  const refreshSetupPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    try {
      const rows = await listSystemPrinters();
      setSystemPrinters(rows);
      setSetupName((current) => {
        if (current.trim() && current.trim() !== "XP-80C") return current;
        return rows.find((row) => row.isDefault)?.name ?? rows[0]?.name ?? "";
      });
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  const openPrinterSetup = useCallback(() => {
    const savedName = settings.printerName?.trim() ?? "";
    setSetupName(savedName === "XP-80C" ? "" : savedName);
    setSetupPaper(settings.printerPaperWidth ?? settings.paperWidth ?? "MM_80");
    setSetupOpen(true);
    void refreshSetupPrinters();
  }, [refreshSetupPrinters, settings.paperWidth, settings.printerName, settings.printerPaperWidth]);

  const handlePrint = useCallback(() => {
    if (printingLockRef.current || sendingRef.current) return true;
    // Web: no silent printer setup — open the browser print dialog.
    if (!desktop || settings.printerSetupDone) {
      beginSend();
      return true;
    }
    setBusy(true);
    openPrinterSetup();
    return true;
  }, [beginSend, desktop, openPrinterSetup, setBusy, settings.printerSetupDone]);

  function confirmPrinterSetup() {
    const name = setupName.trim();
    if (!name) {
      toaster.error("Select a printer first.");
      return;
    }
    if (sendingRef.current) return;
    setSettings({
      ...savedSettings,
      printerName: name,
      printerPaperWidth: setupPaper,
      printSize: printSizeFromPaper(setupPaper),
      printerSetupDone: true,
    });
    toaster.success("Printer saved.");
    printerOverrideRef.current = { name, paper: setupPaper };
    setSetupOpen(false);
    beginSend();
  }

  function cancelPrinterSetup() {
    setSetupOpen(false);
    if (!directPrint) setBusy(false);
    if (directPrint) onClose();
  }

  const printerSetup = (
    <Modal
      open={setupOpen}
      front
      compact
      title="Select printer"
      subtitle="Pick a connected receipt printer. This is saved for the next silent prints."
      onClose={cancelPrinterSetup}
      footer={
        <>
          <Button onClick={cancelPrinterSetup}>Cancel</Button>
          <Button
            variant="primary"
            disabled={sendingRef.current || !setupName.trim()}
            onClick={confirmPrinterSetup}
          >
            Save and print
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field
          label="Connected printers"
          hint={
            loadingPrinters
              ? "Loading printers from this computer…"
              : systemPrinters.length
                ? `${systemPrinters.length} printer${systemPrinters.length === 1 ? "" : "s"} found`
                : "No printers found — plug in the till printer, then Refresh"
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <SelectInput
              className="min-w-0 flex-1"
              disabled={loadingPrinters}
              value={
                systemPrinters.some((row) => row.name === setupName)
                  ? setupName
                  : setupName
                    ? "__custom__"
                    : ""
              }
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__custom__") return;
                setSetupName(value);
              }}
            >
              <option value="">{loadingPrinters ? "Loading…" : "Select printer…"}</option>
              {systemPrinters.map((row) => (
                <option key={row.name} value={row.name}>
                  {row.name}
                  {row.isDefault ? " (system default)" : ""}
                </option>
              ))}
              {setupName && !systemPrinters.some((row) => row.name === setupName) ? (
                <option value="__custom__">{setupName}</option>
              ) : null}
            </SelectInput>
            <Button
              type="button"
              variant="outline"
              disabled={loadingPrinters}
              icon={<RefreshCw size={14} />}
              onClick={() => void refreshSetupPrinters()}
            >
              {loadingPrinters ? "…" : "Refresh"}
            </Button>
          </div>
        </Field>
        <Field label="Printer name" hint="Exact OS name if it is missing from the list above">
          <TextInput
            value={setupName}
            onChange={(event) => setSetupName(event.target.value)}
            placeholder="e.g. XP-80C"
          />
        </Field>
        <Field label="Paper width">
          <SelectInput
            value={setupPaper}
            onChange={(event) => setSetupPaper(event.target.value as PaperWidth)}
          >
            <option value="MM_58">58 mm thermal</option>
            <option value="MM_80">80 mm thermal</option>
            <option value="A4">A4</option>
          </SelectInput>
        </Field>
      </div>
    </Modal>
  );

  useEffect(() => {
    if (!open || printRequestId <= 0) return;
    const jobKey = `${printRequestId}:${isUrdu ? "UR" : "EN"}`;
    if (handledPrintRequestRef.current === jobKey) return;

    if (desktop && !settings.printerSetupDone) {
      handledPrintRequestRef.current = jobKey;
      openPrinterSetup();
      return;
    }

    if (sendingRef.current) return;
    handledPrintRequestRef.current = jobKey;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (handledPrintRequestRef.current !== jobKey) return;
        beginSend();
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      // Strict Mode cleans up before the slip is painted. Allow the second run
      // to send, unless the send already started.
      if (!sendingRef.current) handledPrintRequestRef.current = "";
    };
  }, [
    beginSend,
    desktop,
    isUrdu,
    open,
    openPrinterSetup,
    printRequestId,
    settings.printerSetupDone,
  ]);

  if (!open) return null;

  const hasPhone = Boolean(customer.phone);
  const slip = (
    <div
      ref={slipRef}
      className="relative flex flex-col gap-4"
      style={{ width: widthPx, flexShrink: 0 }}
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
      <>
        <div className="pointer-events-none fixed -left-[10000px] top-0" aria-hidden>
          <style>{`${jameelNooriFontFaceCss()}${RECEIPT_THERMAL_CSS}`}</style>
          {slip}
        </div>
        {printerSetup}
      </>
    );
  }

  function handleWhatsApp() {
    if (!customer.phone) return;
    void openWhatsAppReceipt(customer.phone, receiptText);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-slate-900/50 p-4 sm:p-8">
      <style>{`${jameelNooriFontFaceCss()}${RECEIPT_THERMAL_CSS}`}</style>
      <div className="flex h-full min-h-0 max-w-full items-start gap-4">
        <div className="h-full min-w-0 overflow-auto" aria-label="Receipt preview">
          {slip}
        </div>
        <div className="flex w-52 shrink-0 flex-col gap-2 self-start rounded-lg bg-white p-3">
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
          <Button
            variant="primary"
            icon={<Printer size={14} />}
            disabled={printing || savingDraft}
            onClick={() => {
              if (!invoiceNumber && onPrintDraft) {
                onPrintDraft();
                return;
              }
              handlePrint();
            }}
          >
            {savingDraft
              ? isUrdu
                ? "محفوظ ہو رہا ہے…"
                : "Saving sale…"
              : printing
                ? isUrdu
                  ? "پرنٹ ہو رہا ہے"
                  : "Printing…"
                : isUrdu
                  ? "پرنٹ"
                  : "Print"}
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
      {printerSetup}
    </div>
  );
}
