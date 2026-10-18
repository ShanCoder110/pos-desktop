import type { ReceiptLanguage } from "@/shared/types";

export function isReceiptUrdu(lang: string | null | undefined): boolean {
  return (
    String(lang ?? "")
      .trim()
      .toUpperCase() === "UR"
  );
}

export function resolveReceiptLanguage(
  override: ReceiptLanguage | undefined,
  settingsLanguage: ReceiptLanguage,
): ReceiptLanguage {
  return override ?? settingsLanguage;
}
