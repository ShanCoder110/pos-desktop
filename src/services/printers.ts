import { invoke, isTauri } from "@tauri-apps/api/core";

export type SystemPrinter = {
  name: string;
  isDefault: boolean;
};

export type CutThermalResult =
  { ok: true } | { ok: false; reason: "not-desktop" | "no-printer" | "failed"; message?: string };

export type ThermalPrintResult = CutThermalResult;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function printError(error: unknown): ThermalPrintResult {
  return {
    ok: false,
    reason: "failed",
    message: error instanceof Error ? error.message : String(error),
  };
}

/** OS printers for Settings → Printer (empty in browser / when listing fails). */
export async function listSystemPrinters(): Promise<SystemPrinter[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<SystemPrinter[]>("list_system_printers");
  } catch {
    return [];
  }
}

/**
 * Feed + full cut (XP-Q200II) on the named thermal.
 * Only works inside the Tauri desktop app with an exact OS printer name.
 */
export async function cutThermalPaper(printerName: string | undefined): Promise<CutThermalResult> {
  const name = printerName?.trim();
  if (!isTauri()) {
    return { ok: false, reason: "not-desktop" };
  }
  if (!name) {
    return { ok: false, reason: "no-printer" };
  }
  try {
    await invoke("cut_thermal_paper", { printerName: name });
    return { ok: true };
  } catch (error) {
    return printError(error);
  }
}

/** One slip page (PNG) as a silent ESC/POS raster + cut. Desktop app only. */
export async function printThermalPng(
  printerName: string | undefined,
  png: Uint8Array,
  paperWidth: string,
): Promise<ThermalPrintResult> {
  const name = printerName?.trim();
  if (!isTauri()) return { ok: false, reason: "not-desktop" };
  if (!name) return { ok: false, reason: "no-printer" };
  try {
    await invoke("print_thermal_receipt", {
      printerName: name,
      pngBase64: bytesToBase64(png),
      paperWidth,
    });
    return { ok: true };
  } catch (error) {
    return printError(error);
  }
}

/** Capture each page once, then send all pages/copies as one ordered print job. */
export async function printThermalPngBatch(
  printerName: string | undefined,
  pngPages: Uint8Array[],
  paperWidth: string,
  copies: number,
): Promise<ThermalPrintResult> {
  const name = printerName?.trim();
  if (!isTauri()) return { ok: false, reason: "not-desktop" };
  if (!name) return { ok: false, reason: "no-printer" };
  if (!pngPages.length) return { ok: false, reason: "failed", message: "Receipt has no pages." };
  try {
    await invoke("print_thermal_receipt_batch", {
      printerName: name,
      pngBase64Pages: pngPages.map(bytesToBase64),
      paperWidth,
      copies,
    });
    return { ok: true };
  } catch (error) {
    // A frontend hot reload can temporarily run against an older desktop
    // backend that only knows the single-page command. Keep POS printing.
    const message = error instanceof Error ? error.message : String(error);
    const missingBatchCommand =
      /(?:command.*(?:not found|unknown)|unknown.*command|not found.*command)/i.test(message) &&
      message.includes("print_thermal_receipt_batch");
    if (missingBatchCommand) {
      for (let copy = 0; copy < copies; copy += 1) {
        for (const page of pngPages) {
          const result = await printThermalPng(name, page, paperWidth);
          if (!result.ok) return result;
        }
      }
      return { ok: true };
    }
    return printError(error);
  }
}

/** Short text slip to confirm the saved printer. Desktop app only. */
export async function printThermalTest(
  printerName: string | undefined,
  paperWidth: string,
  shopName: string,
): Promise<ThermalPrintResult> {
  const name = printerName?.trim();
  if (!isTauri()) return { ok: false, reason: "not-desktop" };
  if (!name) return { ok: false, reason: "no-printer" };
  try {
    await invoke("print_thermal_test", {
      printerName: name,
      paperWidth,
      shopName,
    });
    return { ok: true };
  } catch (error) {
    return printError(error);
  }
}
