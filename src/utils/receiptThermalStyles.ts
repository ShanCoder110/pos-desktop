import { jameelNooriFontFaceCss } from "@/utils/receiptPrintFonts";

/** Shared thermal receipt CSS for in-app preview, invoice print dialog, and browser print windows. */
export const RECEIPT_THERMAL_CSS = `
.receipt-inner {
  width: 100%;
  max-width: 100%;
  margin: 0;
  /* Side inset stays — the printable width is narrower than the roll.
     Top and bottom stay within 2 mm; the cutter feed is added after the image. */
  padding: 1mm 14px 1mm 8px;
  font-size: 12px;
  font-weight: 400;
  box-sizing: border-box;
  color: #000;
  background: #fff;
  -webkit-font-smoothing: auto;
  -moz-osx-font-smoothing: auto;
  overflow-x: hidden;
  overflow-y: visible;
}

.receipt-inner.receipt-size--small { font-size: 11px; }
.receipt-inner.receipt-size--medium { font-size: 12px; }
.receipt-inner.receipt-size--large { font-size: 15px; }

.receipt-inner :not(.receipt-footer-urdu) {
  color: #000;
}

.receipt-header {
  text-align: center;
  margin-bottom: 6px;
}

.receipt-logo {
  display: block;
  margin: 0 auto 6px;
  max-height: calc(16mm * var(--receipt-logo-scale, 1));
  max-width: 90%;
  object-fit: contain;
}

.receipt-shop-name {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 3px;
  line-height: 1.2;
  color: #000;
}

.receipt-shop-name--small { font-size: 1.25em; }
.receipt-shop-name--medium { font-size: 1.5em; }
.receipt-shop-name--large { font-size: 1.85em; }
.receipt-shop-name--bold { font-weight: 700; }
.receipt-shop-name--normal { font-weight: 400; }

.receipt-tagline {
  font-size: 1em;
  font-weight: 400;
  letter-spacing: 0.04em;
  color: #000;
  margin: 0;
  line-height: 1.35;
}

.receipt-tagline-block--left,
.receipt-tagline-block--center,
.receipt-tagline-block--right {
  width: 100%;
  margin: 2px 0 6px;
}

.receipt-tagline-block--left,
.receipt-tagline-block--left .receipt-tagline {
  text-align: left !important;
}

.receipt-tagline-block--center,
.receipt-tagline-block--center .receipt-tagline {
  text-align: center !important;
}

.receipt-tagline-block--right,
.receipt-tagline-block--right .receipt-tagline {
  text-align: right !important;
}

.receipt-contact-block--left,
.receipt-contact-block--center,
.receipt-contact-block--right {
  width: 100%;
  margin: 2px 0 4px;
}

.receipt-contact-block--left,
.receipt-contact-block--left .receipt-contact-line {
  text-align: left !important;
}

.receipt-contact-block--center,
.receipt-contact-block--center .receipt-contact-line {
  text-align: center !important;
}

.receipt-contact-block--right,
.receipt-contact-block--right .receipt-contact-line {
  text-align: right !important;
}

.receipt-contact-line {
  font-size: 1em;
  font-weight: 700;
  margin: 1px 0;
  color: #000;
  line-height: 1.35;
}

.receipt-shop-info {
  font-size: 1em;
  font-weight: 400;
  color: #000;
  margin: 1px 0;
}

.receipt-divider {
  border: none;
  border-top: 1px dotted #000;
  margin: 4px 0;
}

.receipt-divider-solid {
  border: none;
  border-top: 1px solid #000;
  margin: 4px 0;
}

.receipt-divider-thick {
  border: none;
  border-top: 2px solid #000;
  margin: 5px 0;
}

.receipt-duplicate-bill {
  margin: 3px 0 5px;
  padding: 2px 4px;
  border: 1px solid #000;
  text-align: center;
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #000;
}

.receipt-payment-banner {
  margin: 2px 0 6px;
  padding: 2px 8px;
  border: 1px solid #000;
  text-align: center;
  font-weight: 800;
  line-height: 1.25;
}

.receipt-payment-banner--small { font-size: 0.9em; }
.receipt-payment-banner--medium { font-size: 1.15em; padding-block: 3px; }
.receipt-payment-banner--large { font-size: 1.45em; padding-block: 4px; border-width: 2px; }

.receipt-payment-banner.is-partial {
  border-style: dashed;
}

.receipt-payment-banner.is-paid {
  font-weight: 700;
}

.receipt-meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 1em;
  font-weight: 400;
  color: #000;
  margin: 1px 0;
}

.receipt-items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 1em;
  color: #000;
}

.receipt-items-table th,
.receipt-items-table td {
  padding: 1px 2px;
  vertical-align: top;
  font-weight: 700;
  color: #000;
}

.receipt-items-table th {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.receipt-items-table .receipt-col-item {
  width: 44%;
  text-align: left;
  word-break: break-word;
}

.receipt-items-table .receipt-col-qty {
  width: 14%;
  text-align: right;
}

.receipt-items-table .receipt-col-price {
  width: 20%;
  text-align: right;
}

.receipt-items-table .receipt-col-total {
  width: 22%;
  text-align: right;
}

.receipt-items-table--urdu-rtl .receipt-col-item {
  text-align: right;
  direction: rtl;
  unicode-bidi: plaintext;
}

.receipt-items-table--urdu-rtl .receipt-col-qty,
.receipt-items-table--urdu-rtl .receipt-col-price,
.receipt-items-table--urdu-rtl .receipt-col-total {
  text-align: left;
}

.receipt-item-name-urdu,
.receipt-text-urdu {
  font-family: 'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', serif;
  direction: rtl;
  unicode-bidi: plaintext;
  letter-spacing: 0;
  text-transform: none;
}

.receipt-item-name-urdu {
  font-size: 1.12em;
  font-weight: 700;
  line-height: 1.55;
  text-align: right;
}

.receipt-text-urdu {
  font-size: 1.1em;
  line-height: 1.55;
}

.receipt-ltr-num {
  unicode-bidi: isolate;
  direction: ltr;
  display: inline-block;
}

.receipt-inner--urdu-rtl {
  direction: rtl;
  line-height: 1.6;
  font-size: 15px;
  font-family: 'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', serif;
  letter-spacing: 0;
  text-transform: none;
}
.receipt-inner--urdu-rtl.receipt-size--small { font-size: 14px; }
.receipt-inner--urdu-rtl.receipt-size--medium { font-size: 14px; }
.receipt-inner--urdu-rtl.receipt-size--large { font-size: 18px; }

.receipt-inner--urdu-rtl .receipt-meta,
.receipt-inner--urdu-rtl .receipt-items-table th,
.receipt-inner--urdu-rtl .receipt-items-table td,
.receipt-inner--urdu-rtl .receipt-item-name,
.receipt-inner--urdu-rtl .receipt-item-name-urdu,
.receipt-inner--urdu-rtl .receipt-text-urdu,
.receipt-inner--urdu-rtl .receipt-footer-note,
.receipt-inner--urdu-rtl .receipt-footer-credit {
  font-family: 'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', serif;
  letter-spacing: 0;
  text-transform: none;
}

/* Labels bold / bigger like English slip */
.receipt-inner--urdu-rtl .receipt-meta-row > span:first-child {
  font-weight: 700;
  font-size: 1.1em;
}

.receipt-inner--urdu-rtl .receipt-items-table th {
  font-weight: 700;
  font-size: 1.1em;
}

.receipt-inner--urdu-rtl .receipt-total-row {
  font-size: 1.1em;
  font-weight: 700;
}

.receipt-inner--urdu-rtl .receipt-grand-total-row {
  font-weight: 800;
  font-size: 1.28em;
}

.receipt-inner--urdu-rtl .receipt-payment-banner {
  font-weight: 800;
  font-size: 1.25em;
}

.receipt-inner--urdu-rtl .receipt-col-qty {
  font-size: 1.1em;
  font-weight: 600;
  line-height: 1.5;
}

.receipt-inner--urdu-rtl .receipt-item-name:not(.receipt-item-name-urdu),
.receipt-inner--urdu-rtl .receipt-col-item {
  font-size: 1.08em;
}

/* Numbers / English: Settings receipt font (same as English invoice) */
.receipt-inner--urdu-rtl .receipt-meta-value,
.receipt-inner--urdu-rtl .receipt-col-price,
.receipt-inner--urdu-rtl .receipt-col-total,
.receipt-inner--urdu-rtl .receipt-total-row > span:last-child,
.receipt-inner--urdu-rtl .receipt-grand-total-row > span:last-child,
.receipt-inner--urdu-rtl .receipt-ltr-num,
.receipt-inner--urdu-rtl [dir="ltr"] {
  font-family: var(--receipt-latin-font, 'Courier New', Courier, monospace) !important;
  font-size: 1em !important;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: 0;
}

.receipt-inner--urdu-rtl .receipt-shop-name:not(.receipt-text-urdu),
.receipt-inner--urdu-rtl .receipt-tagline:not(.receipt-text-urdu),
.receipt-inner--urdu-rtl .receipt-contact-line:not(.receipt-text-urdu),
.receipt-inner--urdu-rtl .receipt-shop-info:not(.receipt-text-urdu) {
  font-family: var(--receipt-latin-font, 'Courier New', Courier, monospace) !important;
}

.receipt-meta-value {
  unicode-bidi: plaintext;
  text-align: left;
}

.receipt-items-table .receipt-item-detail {
  font-size: 0.9em;
  font-weight: 600;
  color: #000;
  margin-top: 1px;
  line-height: 1.35;
}

.receipt-items-table--bordered th,
.receipt-items-table--bordered td {
  border: 1px solid #000;
}

.receipt-items-table--plain th,
.receipt-items-table--plain td {
  border: none;
}

.receipt-balance-mark {
  font-size: 0.65em;
  font-weight: 700;
  margin-inline-start: 1px;
  line-height: 0;
  vertical-align: super;
}

.receipt-total-row,
.receipt-grand-total-row {
  display: flex;
  justify-content: space-between;
  font-size: 1em;
  font-weight: 400;
  color: #000;
  margin: 1px 0;
}

.receipt-grand-total-row {
  font-weight: 700;
  font-size: 1.15em;
}

.receipt-total-bill {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
  font-size: 1.15em;
  color: #000;
  border-top: 1px solid #000;
  border-bottom: 1px solid #000;
  padding: 3px 0;
  margin: 3px 0;
}

.receipt-bold {
  font-weight: 700;
  color: #000;
}

.receipt-footer {
  text-align: center;
  font-size: 1em;
  font-weight: 400;
  color: #000;
  margin-top: 6px;
  padding-bottom: 2px;
}

.receipt-promo-block--left,
.receipt-promo-block--center,
.receipt-promo-block--right {
  width: 100%;
  margin: 2px 0 0;
}

.receipt-promo-block--left,
.receipt-promo-block--left .receipt-footer-urdu {
  text-align: left !important;
}

.receipt-promo-block--center,
.receipt-promo-block--center .receipt-footer-urdu {
  text-align: center !important;
}

.receipt-promo-block--right,
.receipt-promo-block--right .receipt-footer-urdu {
  text-align: right !important;
}

.receipt-footer-urdu {
  font-family: 'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', serif;
  font-size: 1.35em;
  line-height: 1.55;
  direction: rtl;
  unicode-bidi: plaintext;
  text-align: center;
  margin: 0;
  padding: 0 0 5px;
  color: #000;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.receipt-footer-urdu--small { font-size: 1.05em; line-height: 1.5; }
.receipt-footer-urdu--medium { font-size: 1.35em; line-height: 1.55; }
.receipt-footer-urdu--large { font-size: 1.6em; line-height: 1.65; }
.receipt-footer-urdu--bold { font-weight: 700; }
.receipt-footer-urdu--normal { font-weight: 400; }

.receipt-footer-note {
  font-weight: 700;
  font-size: 1em;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-top: 0;
  border-top: 1px dashed #000;
  padding-top: 5px;
  color: #000;
}

.receipt-footer-note--small { font-size: 0.9em; }
.receipt-footer-note--medium { font-size: 1em; }
.receipt-footer-note--large { font-size: 1.2em; }
.receipt-footer-note--bold { font-weight: 700; }
.receipt-footer-note--normal { font-weight: 400; }

.receipt-text-urdu {
  letter-spacing: 0;
  text-transform: none;
}

.receipt-footer-credit {
  font-size: 0.7em;
  font-weight: 600;
  margin: 0 0 1px;
  color: #000;
  letter-spacing: 0.01em;
  line-height: 1.25;
  text-align: center;
}
`;

/** Same CSS + fonts as on-screen preview — used for POS / Settings print HTML. */
export function buildReceiptPrintHtml(opts: {
  bodyHtml: string;
  urdu: boolean;
  printWidth: string;
  printPageSize: string;
  /** Settings receipt font CSS stack for English/numbers on Urdu slips. */
  latinFontCss: string;
}): string {
  const lang = opts.urdu ? "ur" : "en";
  const dir = opts.urdu ? "rtl" : "ltr";
  // Join — avoid `</…>` inside one TSX template literal.
  return [
    `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8" /><title>Receipt</title><style>`,
    jameelNooriFontFaceCss(),
    `:root { --receipt-latin-font: ${opts.latinFontCss}; }`,
    `@page { size: ${opts.printPageSize}; margin: 0; }`,
    `html, body { width: ${opts.printWidth}; max-width: ${opts.printWidth}; margin: 0; padding: 0; background: #fff; color: #000; }`,
    ".slip-page { break-after: page; page-break-after: always; width: 100%; }",
    ".slip-page:last-child { break-after: auto; }",
    ".thermal-receipt-preview { width: 100%; max-width: 100%; }",
    RECEIPT_THERMAL_CSS,
    /* Keep Urdu sizing identical to preview when the printer stylesheet compresses type. */
    opts.urdu
      ? `
.receipt-inner--urdu-rtl.receipt-size--small { font-size: 14px !important; }
.receipt-inner--urdu-rtl.receipt-size--medium { font-size: 14px !important; }
.receipt-inner--urdu-rtl.receipt-size--large { font-size: 18px !important; }
.receipt-inner--urdu-rtl .receipt-meta-row > span:first-child,
.receipt-inner--urdu-rtl .receipt-items-table th { font-weight: 700 !important; }
.receipt-inner--urdu-rtl .receipt-grand-total-row { font-weight: 800 !important; font-size: 1.28em !important; }
.receipt-inner--urdu-rtl .receipt-payment-banner { font-weight: 800 !important; }
.receipt-divider { border-top: 1px dotted #000 !important; }
.receipt-divider-solid { border-top: 1px solid #000 !important; }
`
      : "",
    "</style></head><body>",
    opts.bodyHtml,
    "</body></html>",
  ].join("");
}
