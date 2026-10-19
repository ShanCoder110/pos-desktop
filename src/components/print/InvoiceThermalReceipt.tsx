import type { CSSProperties } from "react";
import { RECEIPT_BRANDING, receiptFontFamilyCss } from "@/shared/constants/receiptBranding";
import type { Customer, InvoiceLine, ShopSettings } from "@/shared/types";
import { receiptMoneyNum } from "@/utils/format";
import { isReceiptUrdu } from "@/utils/receiptLanguage";
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
    address: "Address:",
    item: "Item",
    qty: "Qty",
    price: "Price",
    lineTotal: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    grandTotal: "Grand Total",
    previous: "Previous Balance",
    totalBill: "Total Bill",
    cashReceived: "Cash Received",
    remaining: "Remaining",
    change: "Change",
    page: "Page",
    continued: "Continued",
    itemsWord: "items",
    itemWord: "item",
    of: "of",
    pageTotal: "Page total",
  },
  UR: {
    invoice: "انوائس نمبر:",
    date: "تاریخ:",
    items: "کل اشیاء:",
    customer: "گاہک:",
    address: "پتہ:",
    item: "مال",
    qty: "تعداد",
    price: "قیمت",
    lineTotal: "رقم",
    subtotal: "کل رقم",
    discount: "رعایت",
    grandTotal: "کل بل",
    previous: "سابقہ بیلنس",
    totalBill: "کل بل بشمول بیلنس",
    cashReceived: "نقد وصول",
    remaining: "باقی رقم",
    change: "واپسی",
    page: "صفحہ",
    continued: "جاری ہے",
    itemsWord: "اشیاء",
    itemWord: "شے",
    of: "از",
    pageTotal: "صفحہ کی کل رقم",
  },
} as const;

/** Prefer Urdu product name on Urdu bills; fall back to English name. */
function lineDisplayName(line: InvoiceLine, urdu: boolean) {
  if (!urdu) return line.name;
  return line.urduName?.trim() || line.name;
}

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
  balanceAfter: _balanceAfter,
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
  const isUrdu = isReceiptUrdu(settings.receiptLanguage);
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
  // Ledger: + owes (add), − advance (subtract). totalBill = grand + previous.
  const totalBill = showPreviousBalance ? total + balanceBefore : total;
  const due = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  const remainingAmount = customer.isWalking ? due : totalBill - paid;
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
  const subtotal = total + Math.max(0, discount);
  const itemsWord = (n: number) => (n === 1 && !isUrdu ? labels.itemWord : labels.itemsWord);

  return (
    <div className={className ?? "thermal-receipt-preview"}>
      <div
        className={`receipt-inner receipt-size--${settings.receiptTextSize} ${isUrdu ? "receipt-inner--urdu-rtl" : ""}`}
        data-receipt-lang={isUrdu ? "UR" : "EN"}
        dir={isUrdu ? "rtl" : "ltr"}
        style={
          {
            fontFamily: isUrdu
              ? JAMEEL_NOORI_FONT_FAMILY
              : receiptFontFamilyCss(settings.receiptFontFamily),
            "--receipt-logo-scale": settings.receiptLogoScale / 100,
            "--receipt-latin-font": receiptFontFamilyCss(settings.receiptFontFamily),
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
                ? `${itemFrom}–${itemTo} ${labels.of} ${totalItems}`
                : `${totalItems} ${itemsWord(totalItems)}`}
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
          {customer.address?.trim() ? (
            <div className="receipt-meta-row">
              <span>{labels.address}</span>
              <span
                className={["receipt-meta-value", receiptUrduClass(customer.address)]
                  .filter(Boolean)
                  .join(" ")}
                dir={textContainsUrdu(customer.address) ? "rtl" : "ltr"}
              >
                {customer.address.trim()}
              </span>
            </div>
          ) : null}
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
              const displayName = lineDisplayName(line, isUrdu);
              const nameUrdu = textContainsUrdu(displayName);
              return (
                <tr key={line.id}>
                  <td className="receipt-col-item receipt-item-name">
                    <div
                      className={nameUrdu ? "receipt-item-name-urdu" : undefined}
                      dir={nameUrdu ? "rtl" : "ltr"}
                      lang={nameUrdu ? "ur" : undefined}
                    >
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

        {showTotalsFooter ? (
          <div className="receipt-totals">
            <div className="receipt-total-row">
              <span>{labels.subtotal}</span>
              <span>Rs. {formatRs(subtotal)}</span>
            </div>
            <div className="receipt-total-row">
              <span>{labels.discount}</span>
              <span>
                {discount > 0.009 ? "- " : ""}Rs. {formatRs(discount)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="receipt-divider-solid" />

        {isSplit ? (
          <div className="receipt-grand-total-row">
            <span>
              {labels.pageTotal} ({pageItemCount} {itemsWord(pageItemCount)})
            </span>
            <span>Rs. {formatRs(pageItemsTotal)}</span>
          </div>
        ) : null}

        {showTotalsFooter ? (
          <>
            <div className="receipt-totals">
              <div className="receipt-grand-total-row">
                <span>
                  {labels.grandTotal} ({totalItems} {itemsWord(totalItems)})
                </span>
                <span>Rs. {formatRs(total)}</span>
              </div>
              {showPreviousBalance ? (
                <div className="receipt-total-row receipt-bold">
                  <span>{labels.previous}</span>
                  <span>Rs. {formatRs(Math.abs(balanceBefore))}</span>
                </div>
              ) : null}
              {showPreviousBalance ? (
                <div className="receipt-total-row receipt-bold">
                  <span>{labels.totalBill}</span>
                  <span>Rs. {formatRs(Math.abs(totalBill))}</span>
                </div>
              ) : null}
              <div className="receipt-total-row receipt-bold">
                <span>{labels.cashReceived}</span>
                <span>Rs. {formatRs(paid)}</span>
              </div>
            </div>

            <div className="receipt-divider" />

            <div className="receipt-totals">
              <div className="receipt-grand-total-row">
                <span>{labels.remaining}</span>
                <span>Rs. {formatRs(Math.abs(remainingAmount))}</span>
              </div>
              {customer.isWalking && change > 0.009 ? (
                <div className="receipt-total-row receipt-bold">
                  <span>{labels.change}</span>
                  <span>Rs. {formatRs(change)}</span>
                </div>
              ) : null}
            </div>

            <div className="receipt-divider" />

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
              {isUrdu ? (
                <>
                  سافٹ ویئر: شان عباس ·{" "}
                  <span className="receipt-ltr-num" dir="ltr">
                    0300-1753807
                  </span>
                </>
              ) : (
                RECEIPT_BRANDING.softwareCredit
              )}
            </p>
          </>
        ) : isSplit ? (
          <div className="receipt-totals">
            <div className="receipt-total-row">
              <span>{labels.continued}…</span>
              <span>
                {labels.page} {page?.pageIndex} {labels.of} {page?.pageCount}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
