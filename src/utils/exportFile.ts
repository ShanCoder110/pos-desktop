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
  const frame = document.createElement("iframe");
  Object.assign(frame.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: size === "thermal" ? "80mm" : "210mm",
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
