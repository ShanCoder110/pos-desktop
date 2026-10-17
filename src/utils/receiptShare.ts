import type { Customer, InvoiceLine } from "@/shared/types";
import type { ShopSettings } from "@/shared/types";
import { money } from "@/utils/format";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/** On-screen slip width (wider than physical printable for readability). */
export function thermalWidthPx(paper: ShopSettings["paperWidth"] | undefined) {
  if (paper === "MM_58") return 280;
  if (paper === "A4") return 560;
  return 380;
}

export function thermalLabel(paper: ShopSettings["paperWidth"] | undefined) {
  if (paper === "MM_58") return "Thermal 58mm";
  if (paper === "A4") return "A4";
  return "Thermal 80mm";
}

export function buildReceiptText(opts: {
  settings: ShopSettings;
  customer: Customer;
  lines: InvoiceLine[];
  total: number;
  paid: number;
  balanceBefore?: number;
  balanceAfter?: number;
  invoiceNumber?: string;
}) {
  const { settings, customer, lines, total, paid, balanceBefore, balanceAfter, invoiceNumber } =
    opts;
  const shop = settings.receiptShopName || settings.shopName;
  const bits = [
    `*${shop}*`,
    invoiceNumber ? `Invoice: ${invoiceNumber}` : undefined,
    `Customer: ${customer.name}`,
    customer.phone ? `Phone: ${customer.phone}` : undefined,
    "",
    ...lines.map(
      (line) => `${line.qty} ${line.unit} ${line.name} — ${money(line.qty * line.price)}`,
    ),
    "",
    `Total: ${money(total)}`,
    `Paid: ${money(paid)}`,
  ];
  if (settings.showBalanceOnSlip && balanceBefore != null && balanceAfter != null) {
    bits.push(`Previous balance: ${money(balanceBefore)}`);
    bits.push(`Balance after: ${money(balanceAfter)}`);
  }
  if (settings.footer) bits.push("", settings.footer);
  return bits.filter((line) => line !== undefined).join("\n");
}

/** Converts common Pakistani local formats (03xx / 3xx) to WhatsApp's 92 country format. */
export function whatsAppPhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith("3")) digits = `92${digits}`;
  return digits;
}

export function whatsAppShareUrl(phone: string, text: string) {
  const digits = whatsAppPhone(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Opens WhatsApp/Web in desktop builds and a new browser tab during web development. */
export async function openWhatsAppReceipt(phone: string, text: string) {
  const url = whatsAppShareUrl(phone, text);
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function waitForPrintFonts(doc: Document): Promise<void> {
  const fonts = doc.fonts;
  if (!fonts?.ready) return Promise.resolve();
  return fonts
    .load("16px 'Jameel Noori Nastaleeq'")
    .catch(() => undefined)
    .then(() => fonts.ready)
    .then(() => undefined);
}

/** Print HTML after Jameel Noori (and other) fonts are ready so Urdu is not substituted. */
export function printReceiptHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  const doc = frame.contentDocument ?? frame.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(frame);
    window.print();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const win = frame.contentWindow;
  void waitForPrintFonts(doc).then(() => {
    win?.focus();
    win?.print();
    window.setTimeout(() => {
      if (frame.parentNode) document.body.removeChild(frame);
    }, 60_000);
  });
}
