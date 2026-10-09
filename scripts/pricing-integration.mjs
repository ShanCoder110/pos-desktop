#!/usr/bin/env node
/**
 * API integration checks for pricing/stock (requires running backend + seeded shop).
 * Exit 0 only when all checks pass.
 */
const API = process.env.API_URL || "http://127.0.0.1:38472/api/v1";
const DEVICE = "20000000-0000-4000-8000-000000000003";

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
  if (!res.ok) throw new Error(data?.error?.message || res.statusText);
  return data;
}

const results = [];

function record(name, expected, actual, pass) {
  results.push({ name, expected, actual, pass });
}

async function main() {
  const login = await json("POST", "/auth/login", {
    email: "shan@shop.com",
    password: "TestPass123!",
    deviceId: DEVICE,
  });
  const token = login.token;
  if (!token) throw new Error("login failed");

  const products = await json("GET", "/products?page=1&perPage=50", null, token);
  const widget = products.data?.find((p) => p.name?.includes("Audit Widget"));
  if (!widget) {
    record("find Audit Widget", "product row", "missing", false);
    printAndExit();
    return;
  }
  const unitId = widget.sellUnits?.[0]?.id;
  const stockBefore = widget.totalStock ?? widget.stock;
  record("widget stock before", ">0", String(stockBefore), stockBefore > 0);

  const sale = await json(
    "POST",
    "/sales/complete",
    {
      clientRequestId: `pricing-int-${Date.now()}`,
      items: [
        {
          productId: widget.id,
          productUnitId: unitId,
          quantity: 1,
          unitPrice: widget.retail,
          priceMode: "RETAIL",
        },
      ],
      payments: [{ amount: widget.retail, paymentMethod: "CASH", amountTendered: widget.retail }],
    },
    token,
  );
  record("sale line total", String(widget.retail), String(sale.total), sale.total === widget.retail);

  const after = await json("GET", `/products/${widget.id}`, null, token);
  const stockAfter = after.totalStock ?? after.stock;
  record(
    "stock -1 base",
    String(stockBefore - 1),
    String(stockAfter),
    Math.abs(stockAfter - (stockBefore - 1)) < 0.01,
  );

  printAndExit();
}

function printAndExit() {
  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ results, failed: failed.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
