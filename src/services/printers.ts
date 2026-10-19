import { invoke, isTauri } from "@tauri-apps/api/core";

export type SystemPrinter = {
  name: string;
  isDefault: boolean;
};

export type CutThermalResult =
  { ok: true } | { ok: false; reason: "not-desktop" | "no-printer" | "failed"; message?: string };

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
    return {
      ok: false,
      reason: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
