import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Modal, SelectInput, TextInput } from "@/components/common";
import { InvoiceThermalReceipt } from "@/components/print/InvoiceThermalReceipt";
import { printSizeFromPaper, useSettings } from "@/shared/settings";
import type { Customer, InvoiceLine, PaperWidth, ReceiptLanguage } from "@/shared/types";
import {
  buildReceiptText,
  thermalLabel,
  thermalWidthPx,
  openWhatsAppReceipt,
} from "@/utils/receiptShare";
import { isReceiptUrdu, resolveReceiptLanguage } from "@/utils/receiptLanguage";
import { toaster } from "@/components/common/Toast";
import {
  listSystemPrinters,
  printThermalPng,
  type SystemPrinter,
  type ThermalPrintResult,
} from "@/services/printers";
import { jameelNooriFontFaceCss } from "@/utils/receiptPrintFonts";
import { RECEIPT_THERMAL_CSS } from "@/utils/receiptThermalStyles";
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
  onPrintingChange,
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
  const paper = settings.printerPaperWidth ?? settings.paperWidth;
  const thermal = settings.printSize === "thermal";
  const widthPx = thermal ? thermalWidthPx(paper) : 560;
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

  const runPrintJob = useCallback(async () => {
    const node = slipRef.current;
    if (!node) return false;
    if (!slipMatchesLanguage(node, isUrdu)) return false;

    try {
      const chosen = printerOverrideRef.current;
      const printerName = (chosen?.name ?? settings.printerName)?.trim() ?? "";
      const printPaper = chosen?.paper ?? paper;
      if (!isTauri()) {
        toaster.error("Silent print only works in the desktop app.");
        printerOverrideRef.current = null;
        if (directPrint) onCloseRef.current();
        return true;
      }
      if (!printerName) {
        toaster.error("Select a printer first.");
        printerOverrideRef.current = null;
        if (directPrint) onCloseRef.current();
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
            printerOverrideRef.current = null;
            if (directPrint) onCloseRef.current();
            return true;
          }
          const png = new Uint8Array(await blob.arrayBuffer());
          const result = await printThermalPng(printerName, png, printPaper);
          const fail = thermalFailure(result);
          if (fail) {
            toaster.error(fail);
            printerOverrideRef.current = null;
            if (directPrint) onCloseRef.current();
            return true;
          }
        }
      }
      printerOverrideRef.current = null;
      if (directPrint) onCloseRef.current();
      return true;
    } catch (error) {
      toaster.error(error instanceof Error ? error.message : "Print failed");
      printerOverrideRef.current = null;
      if (directPrint) onCloseRef.current();
      return true;
    }
  }, [directPrint, isUrdu, paper, settings.copies, settings.printerName]);

  const setBusy = useCallback(
    (busy: boolean) => {
      printingLockRef.current = busy;
      setPrinting(busy);
      if (!directPrint) onPrintingChangeRef.current?.(busy);
    },
    [directPrint],
  );

  const beginSend = useCallback(() => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    let attempts = 0;
    const tryPrint = () => {
      void runPrintJob().then((ok) => {
        if (ok) {
          sendingRef.current = false;
          if (!directPrint) setBusy(false);
          return;
        }
        attempts += 1;
        if (attempts < 24) {
          window.setTimeout(tryPrint, isUrdu ? 80 : 50);
          return;
        }
        sendingRef.current = false;
        if (!directPrint) setBusy(false);
        if (directPrint) onCloseRef.current();
      });
    };
    tryPrint();
  }, [directPrint, isUrdu, runPrintJob, setBusy]);

  const openPrinterSetup = useCallback(() => {
    const savedName = settings.printerName?.trim() ?? "";
    setSetupName(savedName === "XP-80C" ? "" : savedName);
    setSetupPaper(settings.printerPaperWidth ?? settings.paperWidth ?? "MM_80");
    setSetupOpen(true);
    void listSystemPrinters().then((rows) => {
      setSystemPrinters(rows);
      setSetupName((current) => {
        if (current.trim() && current.trim() !== "XP-80C") return current;
        return rows.find((row) => row.isDefault)?.name ?? rows[0]?.name ?? "";
      });
    });
  }, [settings.paperWidth, settings.printerName, settings.printerPaperWidth]);

  const handlePrint = useCallback(() => {
    if (printingLockRef.current || sendingRef.current) return true;
    if (!settings.printerSetupDone) {
      setBusy(true);
      openPrinterSetup();
      return true;
    }
    beginSend();
    return true;
  }, [beginSend, openPrinterSetup, setBusy, settings.printerSetupDone]);

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
      title="Select printer"
      subtitle="Choose the receipt printer. Save stores it for the next prints."
      onClose={cancelPrinterSetup}
      footer={
        <>
          <Button onClick={cancelPrinterSetup}>Cancel</Button>
          <Button variant="primary" disabled={sendingRef.current} onClick={confirmPrinterSetup}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Printer">
          <SelectInput
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
            <option value="">Select printer…</option>
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
        </Field>
        <Field label="Printer name" hint="Exact name from the computer if it is not in the list">
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

    if (!settings.printerSetupDone) {
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
  }, [beginSend, isUrdu, open, openPrinterSetup, printRequestId, settings.printerSetupDone]);

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
          <Button
            variant="primary"
            icon={<Printer size={14} />}
            disabled={printing}
            onClick={() => handlePrint()}
          >
            {printing ? (isUrdu ? "پرنٹ ہو رہا ہے" : "Printing…") : isUrdu ? "پرنٹ" : "Print"}
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
