#!/usr/bin/env node
/**
 * Pricing matrix via API (backend must be running). Records expected vs actual per case.
 */
const API = process.env.API_URL || "http://127.0.0.1:38472/api/v1";
const DEVICE = "20000000-0000-4000-8000-000000000003";

const results = [];

function record(caseId, field, expected, actual) {
  const pass =
    typeof expected === "number" && typeof actual === "number"
      ? Math.abs(expected - actual) < 0.02
      : String(expected) === String(actual);
  results.push({ caseId, field, expected, actual, pass });
  return pass;
}

async function json(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${path}: ${data?.error?.message || res.statusText}`);
  return data;
}

function unitRow(product, namePart) {
  return product.sellUnits?.find((u) =>
    (u.name || "").toLowerCase().includes(namePart.toLowerCase()),
  );
}

async function main() {
  let token;
  try {
    const login = await json("POST", "/auth/login", {
      email: "shan@shop.com",
      password: "TestPass123!",
      deviceId: DEVICE,
    });
    token = login.token;
    record("auth", "token", "present", token ? "present" : "missing");
  } catch (e) {
    record("auth", "login", "ok", e.message);
    printTable();
    process.exit(1);
  }

  const list = await json("GET", "/products?page=1&perPage=100", null, token);
  const widget = list.data?.find((p) => p.name?.includes("Audit Widget"));
  if (!widget) {
    record("fixture", "Audit Widget", "found", "missing");
    printTable();
    process.exit(1);
  }

  const piece = unitRow(widget, "piece") || widget.sellUnits?.[0];
  const pack = unitRow(widget, "pack") || widget.sellUnits?.find((u) => u.contains === 12);

  // Case: retail piece qty 1
  if (piece) {
    const before = widget.totalStock ?? widget.stock;
    const price = Number(piece.price) || widget.retail;
    const sale = await json(
      "POST",
      "/sales/complete",
      {
        clientRequestId: `mx-piece-retail-${Date.now()}`,
        items: [
          {
            productId: widget.id,
            productUnitId: piece.id,
            quantity: 1,
            unitPrice: price,
            priceMode: "RETAIL",
          },
        ],
        payments: [{ amount: price, paymentMethod: "CASH", amountTendered: price }],
      },
      token,
    );
    record("piece-retail-q1", "total", price, sale.total);
    const after = await json("GET", `/products/${widget.id}`, null, token);
    record("piece-retail-q1", "stockDelta", -1, (after.totalStock ?? after.stock) - before);
  }

  // Case: wholesale pack if multi-unit
  if (pack && pack.id !== piece?.id) {
    const prod = await json("GET", `/products/${widget.id}`, null, token);
    const before = prod.totalStock ?? prod.stock;
    const wPrice = Number(pack.wholesale) || 0;
    const baseQty = 12;
    const sale = await json(
      "POST",
      "/sales/complete",
      {
        clientRequestId: `mx-pack-wholesale-${Date.now()}`,
        items: [
          {
            productId: widget.id,
            productUnitId: pack.id,
            quantity: 1,
            unitPrice: wPrice,
            priceMode: "WHOLESALE",
          },
        ],
        payments: [{ amount: wPrice, paymentMethod: "CASH", amountTendered: wPrice }],
      },
      token,
    );
    record("pack-wholesale-q1", "total", wPrice, sale.total);
    const after = await json("GET", `/products/${widget.id}`, null, token);
    record("pack-wholesale-q1", "stockDelta", -baseQty, (after.totalStock ?? after.stock) - before);
    record(
      "pack-wholesale-q1",
      "unitPriceTier",
      wPrice,
      sale.items?.[0]?.unitPrice ?? sale.lines?.[0]?.unitPrice,
    );
  }

  // Case: fractional pack (0.5 pack = 6 base) if pack exists
  if (pack) {
    const prod = await json("GET", `/products/${widget.id}`, null, token);
    const before = prod.totalStock ?? prod.stock;
    const rPrice = Number(pack.price) || 0;
    const halfTotal = +(rPrice * 0.5).toFixed(2);
    const sale = await json(
      "POST",
      "/sales/complete",
      {
        clientRequestId: `mx-pack-half-${Date.now()}`,
        items: [
          {
            productId: widget.id,
            productUnitId: pack.id,
            quantity: 0.5,
            unitPrice: rPrice,
            priceMode: "RETAIL",
          },
        ],
        payments: [{ amount: halfTotal, paymentMethod: "CASH", amountTendered: halfTotal }],
      },
      token,
    );
    record("pack-fractional-0.5", "total", halfTotal, sale.total);
    const after = await json("GET", `/products/${widget.id}`, null, token);
    record("pack-fractional-0.5", "stockDelta", -6, (after.totalStock ?? after.stock) - before);
  }

  printTable();
  const failed = results.filter((r) => !r.pass).length;
  process.exit(failed ? 1 : 0);
}

function printTable() {
  console.log("| Case | Field | Expected | Actual | Pass |");
  console.log("|------|-------|----------|--------|------|");
  for (const r of results) {
    console.log(
      `| ${r.caseId} | ${r.field} | ${r.expected} | ${r.actual} | ${r.pass ? "YES" : "NO"} |`,
    );
  }
  console.log(`\nTotal: ${results.length}, failed: ${results.filter((x) => !x.pass).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
