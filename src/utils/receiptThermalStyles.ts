/** Shared thermal receipt CSS for in-app preview, invoice print dialog, and browser print windows. */
export const RECEIPT_THERMAL_CSS = `
.receipt-inner {
  width: 100%;
  max-width: 100%;
  margin: 0;
  /* No left pad; keep right inset — XP-Q200II printable width is < roll width */
  padding: 4px 14px 3mm 8px;
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
.receipt-inner.receipt-size--medium { font-size: 13px; }
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
  border-top: 1px dashed #000;
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
  font-size: 1.15em;
  line-height: 1.55;
  text-align: right;
}

.receipt-text-urdu {
  line-height: 1.5;
}

.receipt-inner--urdu-rtl .receipt-total-row,
.receipt-inner--urdu-rtl .receipt-grand-total-row {
  flex-direction: row-reverse;
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

.receipt-cut-gap {
  height: 3mm;
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
