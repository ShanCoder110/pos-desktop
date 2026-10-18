import type { Customer, InvoiceLine } from "@/shared/types";
import type { ShopSettings } from "@/shared/types";
import { receiptMoney } from "@/utils/format";
import { isReceiptUrdu } from "@/utils/receiptLanguage";
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

function receiptTextUnit(unit: string, urdu: boolean) {
  const normalized = unit.trim().toLowerCase();
  if (["piece", "pieces", "pc", "pcs"].includes(normalized)) return urdu ? "عدد" : "pcs";
  if (["foot", "feet", "ft"].includes(normalized)) return urdu ? "فٹ" : "Foot";
  return unit;
}

export function buildReceiptText(opts: {
  settings: ShopSettings;
  customer: Customer;
  lines: InvoiceLine[];
  total: number;
  discount?: number;
  paid: number;
  balanceBefore?: number;
  balanceAfter?: number;
  invoiceNumber?: string;
}) {
  const {
    settings,
    customer,
    lines,
    total,
    discount = 0,
    paid,
    balanceBefore,
    balanceAfter,
    invoiceNumber,
  } = opts;
  const shop = settings.receiptShopName || settings.shopName;
  const urdu = isReceiptUrdu(settings.receiptLanguage);
  const status =
    paid <= 0.009
      ? urdu
        ? "غیر ادا شدہ"
        : "Unpaid"
      : paid + 0.009 < total
        ? urdu
          ? "جزوی ادا شدہ"
          : "Partially paid"
        : urdu
          ? "ادا شدہ"
          : "Paid";
  const subtotal = total + Math.max(0, discount);
  const due = Math.max(0, total - paid);
  const newBalance = customer.isWalking ? due : (balanceAfter ?? 0);
  const sideMark = (amount: number) => {
    if (amount > 0.009) return " N";
    if (amount < -0.009) return " P";
    return "";
  };
  const bits = [
    `*${shop}*`,
    paid + 0.009 < total ? `*${status.toUpperCase()}*` : undefined,
    invoiceNumber ? `${urdu ? "انوائس" : "Invoice"}: ${invoiceNumber}` : undefined,
    `${urdu ? "گاہک" : "Customer"}: ${customer.name}`,
    customer.phone ? `${urdu ? "فون" : "Phone"}: ${customer.phone}` : undefined,
    customer.address?.trim()
      ? `${urdu ? "پتہ" : "Address"}: ${customer.address.trim()}`
      : undefined,
    "",
    ...lines.map(
      (line) =>
        `${line.qty} ${receiptTextUnit(line.unit, urdu)} ${urdu ? line.urduName?.trim() || line.name : line.name} — ${receiptMoney(line.qty * line.price)}`,
    ),
    "",
    `${urdu ? "کل رقم" : "Subtotal"}: ${receiptMoney(subtotal)}`,
    `${urdu ? "رعایت" : "Discount"}: ${discount > 0 ? "-" : ""}${receiptMoney(discount)}`,
  ];
  if (
    settings.showBalanceOnSlip &&
    !customer.isWalking &&
    balanceBefore != null &&
    Math.abs(balanceBefore) > 0.009
  ) {
    bits.push(
      `${urdu ? "سابقہ بیلنس" : "Previous Balance"}${sideMark(balanceBefore)}: ${receiptMoney(Math.abs(balanceBefore))}`,
    );
  }
  bits.push(
    `*${urdu ? "موجودہ بل" : "Current Bill"} (${lines.length} ${urdu ? "اشیاء" : `item${lines.length === 1 ? "" : "s"}`}): ${receiptMoney(total)}*`,
    `*${urdu ? "نقد وصول" : "Cash Received"}: ${receiptMoney(paid)}*`,
    `*${urdu ? "باقی رقم" : "Remaining Amount"}${customer.isWalking ? "" : sideMark(newBalance)}: ${receiptMoney(Math.abs(newBalance))}*`,
  );
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
    .then(() => fonts.load("700 16px 'Jameel Noori Nastaleeq'").catch(() => undefined))
    .then(() => fonts.ready)
    .then(
      () =>
        new Promise<void>((resolve) => {
          // Extra paint so Urdu metrics match on-screen preview before snapshot/print.
          window.setTimeout(resolve, 120);
        }),
    );
}

/** Print HTML after Jameel Noori (and other) fonts are ready so Urdu is not substituted. */
export function printReceiptHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
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
      resolve();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const win = frame.contentWindow;
    void waitForPrintFonts(doc).then(() => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.setTimeout(() => {
          if (frame.parentNode) document.body.removeChild(frame);
        }, 60_000);
        resolve();
      };
      win?.addEventListener("afterprint", done, { once: true });
      win?.focus();
      win?.print();
      // Fallback if afterprint never fires (some WebViews).
      window.setTimeout(done, 1500);
    });
  });
}
