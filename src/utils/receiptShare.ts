import type { Customer, InvoiceLine } from "@/shared/types";
import type { ShopSettings } from "@/shared/types";
import { money } from "@/utils/format";

export function thermalWidthPx(paper: ShopSettings["paperWidth"] | undefined) {
  if (paper === "MM_58") return 220;
  if (paper === "A4") return 560;
  return 280;
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

export function whatsAppShareUrl(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function printReceiptHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
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
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  window.setTimeout(() => document.body.removeChild(frame), 1000);
}
