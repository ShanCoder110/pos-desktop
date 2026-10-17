/** Thermal / invoice receipt header & footer copy (matches dukan-app). */
export const RECEIPT_BRANDING = {
  tagline: "Solar • LED • LCD • Electronics Wholesale",
  contactLine: "WhatsApp / Call: 0332-0626085",
  promoUrdu:
    "ہمارے ہاں سولر پینل، ایل ای ڈیز، ایل سی ڈیز، ڈش انٹینا، موبائل ایکسیسریز، اسپیکرز، سولر انورٹرز اور دیگر الیکٹرانک سامان ہول سیل ریٹ پر دستیاب ہے۔",
  notValidForCourt: "Not Valid For Court",
  softwareCredit: "Software made by Shan Abbas : 0300-1753807",
  duplicateBillLabel: "DUPLICATE BILL",
} as const;

export type ReceiptFontFamily = "thermal" | "courier" | "arial" | "times" | "consolas";

export const RECEIPT_FONT_OPTIONS: Array<{
  value: ReceiptFontFamily;
  label: string;
  css: string;
}> = [
  {
    value: "thermal",
    label: "Thermal slip (POS printer)",
    css: "'Courier New', Courier, 'Lucida Console', monospace",
  },
  {
    value: "courier",
    label: "Courier (classic receipt)",
    css: "'Courier New', Courier, monospace",
  },
  {
    value: "arial",
    label: "Arial (clean)",
    css: "Arial, Helvetica, sans-serif",
  },
  {
    value: "times",
    label: "Times (formal)",
    css: "'Times New Roman', Times, serif",
  },
  {
    value: "consolas",
    label: "Consolas (sharp mono)",
    css: "Consolas, 'Courier New', monospace",
  },
];

export const DEFAULT_RECEIPT_FONT_FAMILY: ReceiptFontFamily = "thermal";

export const RECEIPT_FONT_CSS =
  RECEIPT_FONT_OPTIONS.find((o) => o.value === DEFAULT_RECEIPT_FONT_FAMILY)?.css ??
  RECEIPT_FONT_OPTIONS[0].css;

export function receiptFontFamilyCss(value: ReceiptFontFamily | string | undefined): string {
  const hit = RECEIPT_FONT_OPTIONS.find((o) => o.value === value);
  return hit?.css ?? RECEIPT_FONT_CSS;
}