import type { CSSProperties } from "react";
import { RECEIPT_BRANDING, receiptFontFamilyCss } from "@/shared/constants/receiptBranding";
import type { Customer, InvoiceLine, ShopSettings } from "@/shared/types";
import { receiptMoneyNum } from "@/utils/format";
import { JAMEEL_NOORI_FONT_FAMILY } from "@/utils/receiptPrintFonts";
import type { SplitBillPageKind } from "@/utils/splitBillPages";

const URDU_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function textContainsUrdu(value: string | null | undefined) {
  return URDU_SCRIPT.test(String(value ?? ""));
}

function receiptUrduClass(value: string | null | undefined) {
  return textContainsUrdu(value) ? "receipt-text-urdu" : "";
}

function formatRs(n: number) {
  return receiptMoneyNum(n);
}

function formatUnit(unit: string, urdu: boolean) {
  const normalized = unit.trim().toLowerCase();
  if (urdu) {
    return (
      {
        piece: "عدد",
        pieces: "عدد",
        pc: "عدد",
        pcs: "عدد",
        pack: "پیک",
        box: "ڈبہ",
        roll: "رول",
        gaz: "گز",
        meter: "میٹر",
        metre: "میٹر",
        foot: "فٹ",
        feet: "فٹ",
      }[normalized] ?? unit
    );
  }
  if (["piece", "pieces", "pc", "pcs"].includes(normalized)) return "pcs";
  return (
    {
      pack: "Pack",
      box: "Box",
      roll: "Roll",
      gaz: "Gaz",
      meter: "Meter",
      metre: "Meter",
      foot: "Foot",
      feet: "Foot",
    }[normalized] ?? unit
  );
}

function formatQty(qty: number, unit: string, urdu = false) {
  const q = Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/\.?0+$/, "");
  return unit ? `${q} ${formatUnit(unit, urdu)}` : q;
}

const RECEIPT_LABELS = {
  EN: {
    invoice: "Invoice #:",
    date: "Date:",
    items: "Total items:",
    customer: "Customer:",
    item: "Item",
    qty: "Qty",
    price: "Price",
    lineTotal: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    total: "Total Bill",
    previous: "Sabka Balance",
    paid: "Amount paid",
    balance: "New Balance",
    paidStatus: "Paid",
    partialStatus: "Partially paid",
    unpaidStatus: "Unpaid",
    owes: "Owes",
    advance: "Advance",
    page: "Page",
    continued: "Continued",
  },
  UR: {
    invoice: "انوائس نمبر:",
    date: "تاریخ:",
    items: "کل اشیاء:",
    customer: "گاہک:",
    item: "آئٹم",
    qty: "مقدار",
    price: "قیمت",
    lineTotal: "کل",
    subtotal: "ذیلی کل",
    discount: "رعایت",
    total: "کل بل",
    previous: "سابقہ بیلنس",
    paid: "ادا شدہ رقم",
    balance: "نیا بیلنس",
    paidStatus: "ادا شدہ",
    partialStatus: "جزوی ادا شدہ",
    unpaidStatus: "غیر ادا شدہ",
    owes: "واجب الادا",
    advance: "ایڈوانس",
    page: "صفحہ",
    continued: "جاری ہے",
  },
} as const;

export type ThermalReceiptPage = {
  items: InvoiceLine[];
  kind: SplitBillPageKind;
  pageIndex: number;
  pageCount: number;
};

export function InvoiceThermalReceipt({
  settings,
  customer,
  lines,
  total,
  discount = 0,
  paid,
  balanceBefore,
  balanceAfter,
  duplicate,
  invoiceNumber,
  page,
  className,
}: {
  settings: ShopSettings;
  customer: Customer;
  lines: InvoiceLine[];
  total: number;
  discount?: number;
  paid: number;
  balanceBefore: number;
  balanceAfter: number;
  duplicate?: boolean;
  invoiceNumber?: string;
  page?: ThermalReceiptPage;
  className?: string;
}) {
  const shop = settings.receiptShopName || settings.shopName;
  const tagline = settings.tagline.trim() || RECEIPT_BRANDING.tagline;
  const contact = settings.contactLine.trim() || settings.phone || RECEIPT_BRANDING.contactLine;
  const promo = settings.promoUrdu.trim() || RECEIPT_BRANDING.promoUrdu;
  const footer = settings.footer.trim() || RECEIPT_BRANDING.notValidForCourt;
  const bordered = settings.itemsTableBordered;
  const isUrdu = settings.receiptLanguage === "UR";
  const labels = RECEIPT_LABELS[isUrdu ? "UR" : "EN"];
  const hasLogo = settings.showLogo && Boolean(settings.receiptLogoDataUrl);
  const showHeaderLogo = hasLogo && settings.receiptHeaderLayout !== "text";
  const showHeaderShopName = settings.receiptHeaderLayout !== "logo" || !hasLogo;

  const pageKind = page?.kind ?? "single";
  const isSplit = Boolean(page && page.pageCount > 1);
  const showBrandHeader = pageKind === "single" || pageKind === "first";
  const showTotalsFooter = pageKind === "single" || pageKind === "last";
  const pageLines = page?.items ?? lines;
  const pageItemCount = pageLines.length;
  const pageItemsTotal = pageLines.reduce((sum, line) => sum + line.qty * line.price, 0);
  const totalItems = lines.length;
  const showPreviousBalance =
    settings.showBalanceOnSlip && !customer.isWalking && Math.abs(balanceBefore) > 0.009;
  const due = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  const newBalance = customer.isWalking ? due : balanceAfter;
  const now = new Date();
  const dateLabel = isUrdu
    ? `${now.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })} · ${now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}`
    : now.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

  const itemFrom = page && isSplit ? lines.findIndex((l) => l.id === page.items[0]?.id) + 1 : 1;
  const itemTo = page && isSplit ? itemFrom + page.items.length - 1 : totalItems;
  const paymentStatus =
    paid <= 0.009
      ? labels.unpaidStatus
      : paid + 0.009 < total
        ? labels.partialStatus
        : labels.paidStatus;
  const subtotal = total + Math.max(0, discount);

  return (
    <div className={className ?? "thermal-receipt-preview"}>
      <div
        className={`receipt-inner receipt-size--${settings.receiptTextSize} ${isUrdu ? "receipt-inner--urdu-rtl" : ""}`}
        dir={isUrdu ? "rtl" : "ltr"}
        style={
          {
            fontFamily: isUrdu
              ? JAMEEL_NOORI_FONT_FAMILY
              : receiptFontFamilyCss(settings.receiptFontFamily),
            "--receipt-logo-scale": settings.receiptLogoScale / 100,
          } as CSSProperties
        }
      >
        <div className="receipt-header">
          {showBrandHeader ? (
            <>
              {showHeaderLogo ? (
                <img className="receipt-logo" src={settings.receiptLogoDataUrl} alt="" />
              ) : null}
              {showHeaderShopName ? (
                <h1
                  className={[
                    "receipt-shop-name",
                    `receipt-shop-name--${settings.receiptShopNameSize}`,
                    settings.receiptShopNameBold
                      ? "receipt-shop-name--bold"
                      : "receipt-shop-name--normal",
                    receiptUrduClass(shop),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {shop}
                </h1>
              ) : null}
              {tagline ? (
                <div className={`receipt-tagline-block--${settings.receiptTaglineAlign}`}>
                  <p
                    className={["receipt-tagline", receiptUrduClass(tagline)]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {tagline}
                  </p>
                </div>
              ) : null}
              {contact ? (
                <div className={`receipt-contact-block--${settings.receiptContactAlign}`}>
                  <p
                    className={["receipt-contact-line", receiptUrduClass(contact)]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {contact}
                  </p>
                </div>
              ) : null}
              {settings.address ? (
                <p
                  className={["receipt-shop-info", receiptUrduClass(settings.address)]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {settings.address}
                </p>
              ) : null}
            </>
          ) : page ? (
            <p className="receipt-tagline">
              {labels.continued} · {labels.page} {page.pageIndex} / {page.pageCount}
            </p>
          ) : null}
          <div className="receipt-divider-thick" />
        </div>

        {showBrandHeader && duplicate ? (
          <div className="receipt-duplicate-bill" role="note">
            {isUrdu ? "نقل شدہ بل" : RECEIPT_BRANDING.duplicateBillLabel}
          </div>
        ) : null}

        {showBrandHeader ? (
          <div
            className={`receipt-payment-banner receipt-payment-banner--${settings.receiptPaymentStatusSize} ${
              paid <= 0.009 ? "is-unpaid" : paid + 0.009 < total ? "is-partial" : "is-paid"
            }`}
            role="status"
          >
            {paymentStatus}
          </div>
        ) : null}

        <div className="receipt-meta">
          <div className="receipt-meta-row">
            <span>{labels.invoice}</span>
            <span className="receipt-bold receipt-meta-value" dir="ltr">
              {invoiceNumber ?? `${settings.invoicePrefix || "INV"}-0001`}
            </span>
          </div>
          <div className="receipt-meta-row">
            <span>{labels.date}</span>
            <span className="receipt-meta-value" dir="ltr">
              {dateLabel}
            </span>
          </div>
          <div className="receipt-meta-row">
            <span>{labels.items}</span>
            <span className="receipt-bold receipt-meta-value" dir="ltr">
              {isSplit
                ? `${itemFrom}–${itemTo} of ${totalItems}`
                : isUrdu
                  ? `${totalItems}`
                  : `${totalItems} item${totalItems === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="receipt-meta-row">
            <span>{labels.customer}</span>
            <span
              className={["receipt-bold", receiptUrduClass(customer.name)]
                .filter(Boolean)
                .join(" ")}
              dir={textContainsUrdu(customer.name) ? "rtl" : "ltr"}
            >
              {customer.name}
              {customer.phone ? ` · ${customer.phone}` : ""}
            </span>
          </div>
        </div>

        <div className="receipt-divider" />

        <table
          className={[
            "receipt-items-table",
            bordered ? "receipt-items-table--bordered" : "receipt-items-table--plain",
            isUrdu ? "receipt-items-table--urdu-rtl" : "",
          ].join(" ")}
        >
          <thead>
            <tr>
              <th className="receipt-col-item">{labels.item}</th>
              <th className="receipt-col-qty">{labels.qty}</th>
              <th className="receipt-col-price">{labels.price}</th>
              <th className="receipt-col-total">{labels.lineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {pageLines.map((line) => {
              const displayName = isUrdu ? line.urduName?.trim() || line.name : line.name;
              const nameUrdu = textContainsUrdu(displayName);
              return (
                <tr key={line.id}>
                  <td className="receipt-col-item receipt-item-name">
                    <div className={nameUrdu ? "receipt-item-name-urdu" : undefined}>
                      {displayName}
                    </div>
                  </td>
                  <td className="receipt-col-qty">{formatQty(line.qty, line.unit, isUrdu)}</td>
                  <td className="receipt-col-price">{formatRs(line.price)}</td>
                  <td className="receipt-col-total receipt-bold">
                    {formatRs(line.qty * line.price)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="receipt-divider" />

        {isSplit ? (
          <div className="receipt-grand-total-row">
            <span>
              {isUrdu
                ? `${labels.page} کی کل رقم (${pageItemCount} اشیاء)`
                : `Page total (${pageItemCount} item${pageItemCount === 1 ? "" : "s"})`}
            </span>
            <span>Rs. {formatRs(pageItemsTotal)}</span>
          </div>
        ) : null}

        {showTotalsFooter ? (
          <>
            <div className="receipt-totals">
              <div className="receipt-total-row">
                <span>{labels.subtotal}</span>
                <span>Rs. {formatRs(subtotal)}</span>
              </div>
              {settings.showItemDiscount ? (
                <div className="receipt-total-row">
                  <span>{labels.discount}</span>
                  <span>
                    {discount > 0.009 ? "- " : ""}Rs. {formatRs(discount)}
                  </span>
                </div>
              ) : null}
              {showPreviousBalance ? (
                <div className="receipt-total-row receipt-bold">
                  <span>{labels.previous}</span>
                  <span>
                    Rs. {formatRs(Math.abs(balanceBefore))}{" "}
                    {balanceBefore > 0 ? labels.owes : labels.advance}
                  </span>
                </div>
              ) : null}
              <div className="receipt-grand-total-row">
                <span>
                  {labels.total} ({totalItems}{" "}
                  {isUrdu ? "اشیاء" : `item${totalItems === 1 ? "" : "s"}`})
                </span>
                <span>Rs. {formatRs(total)}</span>
              </div>
              <div className="receipt-total-row receipt-bold">
                <span>{labels.paid}</span>
                <span>Rs. {formatRs(paid)}</span>
              </div>
              <div className="receipt-grand-total-row">
                <span>{labels.balance}</span>
                <span>
                  Rs. {formatRs(Math.abs(newBalance))}{" "}
                  {!customer.isWalking && newBalance > 0
                    ? labels.owes
                    : !customer.isWalking && newBalance < 0
                      ? labels.advance
                      : ""}
                </span>
              </div>
              {customer.isWalking && change > 0.009 ? (
                <div className="receipt-total-row receipt-bold">
                  <span>{isUrdu ? "واپسی" : "Change"}</span>
                  <span>Rs. {formatRs(change)}</span>
                </div>
              ) : null}
            </div>

            <div className="receipt-divider-thick" />

            <div className="receipt-footer">
              {promo ? (
                <div className={`receipt-promo-block--${settings.receiptPromoAlign}`}>
                  <p
                    className={`receipt-footer-urdu receipt-footer-urdu--${settings.receiptPromoSize} ${
                      settings.receiptPromoBold
                        ? "receipt-footer-urdu--bold"
                        : "receipt-footer-urdu--normal"
                    }`}
                  >
                    {promo}
                  </p>
                </div>
              ) : null}
              {footer ? (
                <p
                  className={`receipt-footer-note receipt-footer-note--${settings.receiptFooterSize} ${
                    settings.receiptFooterBold
                      ? "receipt-footer-note--bold"
                      : "receipt-footer-note--normal"
                  }`}
                >
                  {isUrdu && footer === RECEIPT_BRANDING.notValidForCourt
                    ? "عدالتی استعمال کے لیے قابل قبول نہیں"
                    : footer}
                </p>
              ) : null}
            </div>
            <div className="receipt-cut-gap" aria-hidden="true" />
            <p className="receipt-footer-credit">
              {isUrdu ? "سافٹ ویئر: شان عباس · 0300-1753807" : RECEIPT_BRANDING.softwareCredit}
            </p>
          </>
        ) : isSplit ? (
          <div className="receipt-totals">
            <div className="receipt-total-row">
              <span>{labels.continued}…</span>
              <span>
                {isUrdu
                  ? `${labels.page} ${page?.pageIndex} از ${page?.pageCount}`
                  : `Page ${page?.pageIndex} of ${page?.pageCount}`}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
