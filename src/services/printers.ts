import { invoke, isTauri } from "@tauri-apps/api/core";

export type SystemPrinter = {
  name: string;
  isDefault: boolean;
};

/** OS printers for Settings → Printer (empty in browser / when listing fails). */
export async function listSystemPrinters(): Promise<SystemPrinter[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<SystemPrinter[]>("list_system_printers");
  } catch {
    return [];
  }
}

/** Feed + partial cut on the named thermal (no-op outside Tauri / if name blank). */
export async function cutThermalPaper(printerName: string | undefined): Promise<void> {
  const name = printerName?.trim();
  if (!isTauri() || !name) return;
  try {
    await invoke("cut_thermal_paper", { printerName: name });
  } catch {
    // Driver may already cut after HTML print — ignore cut failures.
  }
}
