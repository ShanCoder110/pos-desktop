import { money } from "@/utils/format";
import type { PrintSize, Product } from "@/shared/types";

const COLS = ["Name", "SKU", "Category", "Cost", "Retail", "Stock", "Unit", "Status"] as const;

function stockLabel(row: Product) {
  if (row.stock <= 0) return "Out of stock";
  if (row.stock < 20) return "Low stock";
  return "In stock";
}

function cells(row: Product) {
  return [row.name, row.sku, row.category, row.cost, row.retail, row.stock, row.unit, stockLabel(row)] as const;
}

function stamp() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function xml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function html(value: string | number) {
  return xml(value).replace(/'/g, "&#39;");
}

export function exportProductsCsv(rows: Product[], filename = "products.csv") {
  const header = COLS.join(",");
  const body = rows.map((row) => cells(row).map(csvCell).join(",")).join("\n");
  download(filename, new Blob([`\uFEFF${header}\n${body}`], { type: "text/csv;charset=utf-8" }));
}

export function exportProductsExcel(rows: Product[], filename = "products.xls") {
  const header = COLS.map((col) => `<Cell><Data ss:Type="String">${xml(col)}</Data></Cell>`).join("");
  const body = rows
    .map((row) => {
      const values = cells(row);
      const tds = values
        .map((value, i) => {
          const type = i === 3 || i === 4 || i === 5 ? "Number" : "String";
          return `<Cell><Data ss:Type="${type}">${xml(value)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${tds}</Row>`;
    })
    .join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Products">
    <Table>
      <Row>${header}</Row>
      ${body}
    </Table>
  </Worksheet>
</Workbook>`;
  download(filename, new Blob([sheet], { type: "application/vnd.ms-excel" }));
}

function thermalHtml(rows: Product[], shopName: string) {
  const items = rows
    .map(
      (row) => `<article>
  <strong>${html(row.name)}</strong>
  <p>${html(row.sku || "—")} · ${html(row.category || "—")}</p>
  <p>${html(row.stock)} ${html(row.unit)} · ${html(stockLabel(row))}</p>
  <p>Cost ${html(money(row.cost))} · Sell ${html(money(row.retail))}</p>
</article>`,
    )
    .join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Products</title>
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body { margin: 0; width: 74mm; color: #000; font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
    h1 { margin: 0; font-size: 13px; text-align: center; }
    .meta { margin: 4px 0 8px; text-align: center; font-size: 10px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
    article { padding: 6px 0; border-bottom: 1px dashed #000; }
    article strong { display: block; }
    article p { margin: 2px 0 0; }
  </style>
</head>
<body>
  <h1>${html(shopName)}</h1>
  <p class="meta">Product list · Thermal 80mm<br/>${html(stamp())} · ${rows.length} items</p>
  <hr />
  ${items}
</body>
</html>`;
}

function a4Html(rows: Product[], shopName: string) {
  const body = rows
    .map((row) => {
      const values = cells(row);
      return `<tr>${values.map((value, i) => `<td class="${i >= 3 && i <= 5 ? "num" : ""}">${html(i === 3 || i === 4 ? money(Number(value)) : value)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Products</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font: 12px/1.4 Inter, system-ui, sans-serif; }
    h1 { margin: 0; font-size: 18px; }
    .meta { margin: 4px 0 14px; color: #64748b; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
    th { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    thead { display: table-header-group; }
  </style>
</head>
<body>
  <h1>${html(shopName)}</h1>
  <p class="meta">Product list · A4 · ${html(stamp())} · ${rows.length} items</p>
  <table>
    <thead><tr>${COLS.map((col) => `<th>${col}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

export function printProducts(rows: Product[], size: PrintSize, shopName: string) {
  const markup = size === "thermal" ? thermalHtml(rows, shopName) : a4Html(rows, shopName);
  printHtml(markup, size === "thermal" ? "80mm" : "210mm");
}

export type ShopReportPdf = {
  shopName: string;
  rangeLabel: string;
  kpis: { label: string; value: string }[];
  invoices: { number: string; when: string; status: string; total: string; paid: string; credit: string }[];
  products: { name: string; qty: string; revenue: string }[];
  expenses: { when: string; description: string; amount: string }[];
};

export function exportReportPdf(report: ShopReportPdf) {
  const kpi = report.kpis
    .map((item) => `<div class="kpi"><span>${html(item.label)}</span><strong>${html(item.value)}</strong></div>`)
    .join("");
  const invoices = report.invoices.length
    ? report.invoices
        .map(
          (row) =>
            `<tr><td>${html(row.number)}<small>${html(row.when)}</small></td><td>${html(row.status)}</td><td class="num">${html(row.total)}</td><td class="num">${html(row.paid)}</td><td class="num">${html(row.credit)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No invoices in this range.</td></tr>`;
  const products = report.products.length
    ? report.products
        .map((row) => `<tr><td>${html(row.name)}</td><td class="num">${html(row.qty)}</td><td class="num">${html(row.revenue)}</td></tr>`)
        .join("")
    : `<tr><td colspan="3">No product sales in this range.</td></tr>`;
  const expenses = report.expenses.length
    ? report.expenses
        .map((row) => `<tr><td>${html(row.when)}</td><td>${html(row.description)}</td><td class="num">${html(row.amount)}</td></tr>`)
        .join("")
    : `<tr><td colspan="3">No expenses in this range.</td></tr>`;

  const markup = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${html(report.shopName)} report</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #0f172a; font: 12px/1.4 Inter, system-ui, sans-serif; }
    h1 { margin: 0; font-size: 20px; }
    h2 { margin: 18px 0 8px; font-size: 13px; }
    .meta { margin: 4px 0 14px; color: #64748b; font-size: 11px; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
    .kpi span { display: block; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .kpi strong { display: block; margin-top: 4px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
    th { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    small { display: block; color: #64748b; font-size: 10px; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
  </style>
</head>
<body>
  <h1>${html(report.shopName)}</h1>
  <p class="meta">Shop report · ${html(report.rangeLabel)} · ${html(stamp())}</p>
  <div class="kpis">${kpi}</div>
  <h2>Invoices</h2>
  <table>
    <thead><tr><th>Invoice</th><th>Status</th><th>Total</th><th>Paid</th><th>Credit</th></tr></thead>
    <tbody>${invoices}</tbody>
  </table>
  <h2>Top products</h2>
  <table>
    <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead>
    <tbody>${products}</tbody>
  </table>
  <h2>Expenses</h2>
  <table>
    <thead><tr><th>When</th><th>Description</th><th>Amount</th></tr></thead>
    <tbody>${expenses}</tbody>
  </table>
</body>
</html>`;
  printHtml(markup, "210mm");
}

function printHtml(markup: string, width: string) {
  const frame = document.createElement("iframe");
  Object.assign(frame.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width,
    height: "100vh",
    border: "0",
  });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(markup);
  doc.close();
  const win = frame.contentWindow;
  const cleanup = () => window.setTimeout(() => frame.remove(), 400);
  if (win) win.onafterprint = cleanup;
  const run = () => {
    win?.focus();
    win?.print();
    window.setTimeout(cleanup, 1500);
  };
  if (doc.readyState === "complete") run();
  else frame.onload = run;
}
