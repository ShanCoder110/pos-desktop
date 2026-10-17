import type { CSSProperties } from "react";
import { RECEIPT_BRANDING, receiptFontFamilyCss } from "@/shared/constants/receiptBranding";
import type { Customer, InvoiceLine, ShopSettings } from "@/shared/types";
import { moneyNum } from "@/utils/format";
import type { SplitBillPageKind } from "@/utils/splitBillPages";

const URDU_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function textContainsUrdu(value: string | null | undefined) {
  return URDU_SCRIPT.test(String(value ?? ""));
}

function receiptUrduClass(value: string | null | undefined) {
  return textContainsUrdu(value) ? "receipt-text-urdu" : "";
}

function formatRs(n: number) {
  return moneyNum(n);
}

function formatQty(qty: number, unit: string) {
  const q = Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/\.?0+$/, "");
  return unit ? `${q} ${unit}` : q;
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

  const pageKind = page?.kind ?? "single";
  const isSplit = Boolean(page && page.pageCount > 1);
  const showBrandHeader = pageKind === "single" || pageKind === "first";
  const showTotalsFooter = pageKind === "single" || pageKind === "last";
  const pageLines = page?.items ?? lines;
  const pageItemCount = pageLines.length;
  const pageItemsTotal = pageLines.reduce((sum, line) => sum + line.qty * line.price, 0);
  const totalItems = lines.length;
  const showBalances =
    settings.showBalanceOnSlip &&
    !customer.isWalking &&
    (balanceBefore !== 0 || balanceAfter !== 0);
  const due = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  const now = new Date();
  const dateLabel = now.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const itemFrom = page && isSplit ? lines.findIndex((l) => l.id === page.items[0]?.id) + 1 : 1;
  const itemTo = page && isSplit ? itemFrom + page.items.length - 1 : totalItems;

  return (
    <div className={className ?? "thermal-receipt-preview"}>
      <div
        className="receipt-inner receipt-size--medium"
        style={{ fontFamily: receiptFontFamilyCss(settings.receiptFontFamily) } as CSSProperties}
      >
        <div className="receipt-header">
          {showBrandHeader ? (
            <>
              <h1
                className={["receipt-shop-name", receiptUrduClass(shop)].filter(Boolean).join(" ")}
              >
                {shop}
              </h1>
              {tagline ? (
                <p
                  className={["receipt-tagline", receiptUrduClass(tagline)]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {tagline}
                </p>
              ) : null}
              {contact ? (
                <p
                  className={["receipt-contact-line", receiptUrduClass(contact)]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {contact}
                </p>
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
              Continued · Page {page.pageIndex} of {page.pageCount}
            </p>
          ) : null}
          <div className="receipt-divider-thick" />
        </div>

        {showBrandHeader && duplicate ? (
          <div className="receipt-duplicate-bill" role="note">
            {RECEIPT_BRANDING.duplicateBillLabel}
          </div>
        ) : null}

        <div className="receipt-meta">
          <div className="receipt-meta-row">
            <span>Invoice #:</span>
            <span className="receipt-bold">
              {invoiceNumber ?? `${settings.invoicePrefix || "INV"}-0001`}
            </span>
          </div>
          <div className="receipt-meta-row">
            <span>Date:</span>
            <span>{dateLabel}</span>
          </div>
          <div className="receipt-meta-row">
            <span>Total items:</span>
            <span className="receipt-bold">
              {isSplit
                ? `${itemFrom}–${itemTo} of ${totalItems}`
                : `${totalItems} item${totalItems === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="receipt-meta-row">
            <span>Customer:</span>
            <span
              className={["receipt-bold", receiptUrduClass(customer.name)]
                .filter(Boolean)
                .join(" ")}
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
          ].join(" ")}
        >
          <thead>
            <tr>
              <th className="receipt-col-item">Item</th>
              <th className="receipt-col-qty">Qty</th>
              <th className="receipt-col-price">Price</th>
              <th className="receipt-col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {pageLines.map((line) => {
              const nameUrdu = textContainsUrdu(line.name);
              return (
                <tr key={line.id}>
                  <td className="receipt-col-item receipt-item-name">
                    <div className={nameUrdu ? "receipt-item-name-urdu" : undefined}>
                      {line.name}
                    </div>
                    {settings.showItemDiscount ? (
                      <div className="receipt-item-detail">Disc 0</div>
                    ) : null}
                  </td>
                  <td className="receipt-col-qty">{formatQty(line.qty, line.unit)}</td>
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
              Page total ({pageItemCount} item{pageItemCount === 1 ? "" : "s"})
            </span>
            <span>Rs. {formatRs(pageItemsTotal)}</span>
          </div>
        ) : null}

        {showTotalsFooter ? (
          <>
            {showBalances ? (
              <div className="receipt-totals">
                <div className="receipt-grand-total-row">
                  <span>
                    {isSplit ? `TOTAL (all ${totalItems} items)` : `TOTAL (${totalItems} items)`}
                  </span>
                  <span>Rs. {formatRs(total)}</span>
                </div>
                {Math.abs(balanceBefore) > 0.009 ? (
                  <div className="receipt-total-row receipt-bold">
                    <span>Previous balance</span>
                    <span>
                      Rs. {formatRs(Math.abs(balanceBefore))}{" "}
                      {balanceBefore > 0 ? "Owes" : balanceBefore < 0 ? "Advance" : ""}
                    </span>
                  </div>
                ) : null}
                <div className="receipt-total-row">
                  <span>Amount paid</span>
                  <span>Rs. {formatRs(paid)}</span>
                </div>
                <div className="receipt-grand-total-row">
                  <span>Balance after</span>
                  <span>
                    Rs. {formatRs(Math.abs(balanceAfter))}{" "}
                    {balanceAfter > 0 ? "Owes" : balanceAfter < 0 ? "Advance" : ""}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="receipt-grand-total-row">
                  <span>
                    {isSplit ? `TOTAL (all ${totalItems} items)` : `TOTAL (${totalItems} items)`}
                  </span>
                  <span>Rs. {formatRs(total)}</span>
                </div>
                <div className="receipt-grand-total-row">
                  <span>NET TOTAL</span>
                  <span>Rs. {formatRs(total)}</span>
                </div>
              </>
            )}

            <div className="receipt-divider" />

            <div className="receipt-totals">
              <div className="receipt-total-row">
                <span>Amount paid</span>
                <span>Rs. {formatRs(paid)}</span>
              </div>
              {due > 0.009 ? (
                <div className="receipt-total-row receipt-bold">
                  <span>Due</span>
                  <span>Rs. {formatRs(due)}</span>
                </div>
              ) : null}
              {customer.isWalking && change > 0.009 ? (
                <div className="receipt-total-row receipt-bold">
                  <span>Change</span>
                  <span>Rs. {formatRs(change)}</span>
                </div>
              ) : null}
            </div>

            <div className="receipt-divider-thick" />

            <div className="receipt-footer">
              {promo ? <p className="receipt-footer-urdu">{promo}</p> : null}
              {footer ? <p className="receipt-footer-note">{footer}</p> : null}
            </div>
            <div className="receipt-cut-gap" aria-hidden="true" />
            <p className="receipt-footer-credit">{RECEIPT_BRANDING.softwareCredit}</p>
          </>
        ) : isSplit ? (
          <div className="receipt-totals">
            <div className="receipt-total-row">
              <span>Continued…</span>
              <span>
                Page {page?.pageIndex} of {page?.pageCount}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
