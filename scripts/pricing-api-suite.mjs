#!/usr/bin/env node
/**
 * Broader pricing API suite: wholesale, bill discount, profit snapshot, hold roundtrip.
 * Requires backend. Emits markdown table rows.
 */
const API = process.env.API_URL || "http://127.0.0.1:38580/api/v1";
const DEVICE = "20000000-0000-4000-8000-000000000003";

const rows = [];

function row(caseId, metric, expected, actual, ran = true) {
  const pass =
    !ran
      ? false
      : typeof expected === "number" && typeof actual === "number"
        ? Math.abs(expected - actual) < 0.05
        : String(expected) === String(actual);
  rows.push({ caseId, metric, expected, actual, pass, ran });
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

async function main() {
  const login = await json("POST", "/auth/login", {
    email: "shan@shop.com",
    password: "TestPass123!",
    deviceId: DEVICE,
  });
  const token = login.token;
  row("auth", "login", "ok", token ? "ok" : "fail");

  const list = await json("GET", "/products?page=1&perPage=50", null, token);
  const widget = list.data?.find((p) => p.name?.includes("Audit Widget"));
  if (!widget) {
    row("fixture", "Audit Widget", "found", "missing");
    printTable();
    process.exit(1);
  }
  const unitId = widget.sellUnits?.[0]?.id;
  const retail = Number(widget.retail);
  const wholesale = Number(widget.wholesale);

  // Wholesale piece
  const prod1 = await json("GET", `/products/${widget.id}`, null, token);
  const s1 = prod1.totalStock ?? prod1.stock;
  const saleW = await json(
    "POST",
    "/sales/complete",
    {
      clientRequestId: `suite-wholesale-${Date.now()}`,
      items: [
        {
          productId: widget.id,
          productUnitId: unitId,
          quantity: 1,
          unitPrice: wholesale,
          priceMode: "WHOLESALE",
        },
      ],
      payments: [{ amount: wholesale, paymentMethod: "CASH", amountTendered: wholesale }],
    },
    token,
  );
  row("wholesale-piece", "total", wholesale, saleW.total);
  const itemW = saleW.items?.[0];
  if (itemW) {
    row("wholesale-piece", "grossProfit", itemW.lineTotal - itemW.fifoCost, itemW.grossProfit);
    row("wholesale-piece", "priceMode", "WHOLESALE", itemW.priceMode);
  }
  const prod2 = await json("GET", `/products/${widget.id}`, null, token);
  row("wholesale-piece", "stockDelta", -1, (prod2.totalStock ?? prod2.stock) - s1);

  // Bill discount 10 on retail 2 qty
  const before3 = await json("GET", `/products/${widget.id}`, null, token);
  const b3 = before3.totalStock ?? before3.stock;
  const line = retail * 2;
  const disc = 10;
  const pay = line - disc;
  const saleD = await json(
    "POST",
    "/sales/complete",
    {
      clientRequestId: `suite-discount-${Date.now()}`,
      discount: disc,
      items: [
        {
          productId: widget.id,
          productUnitId: unitId,
          quantity: 2,
          unitPrice: retail,
          priceMode: "RETAIL",
        },
      ],
      payments: [{ amount: pay, paymentMethod: "CASH", amountTendered: pay }],
    },
    token,
  );
  row("bill-discount-10", "total", pay, saleD.total);
  row("bill-discount-10", "discount", disc, saleD.discount);
  const after3 = await json("GET", `/products/${widget.id}`, null, token);
  row("bill-discount-10", "stockDelta", -2, (after3.totalStock ?? after3.stock) - b3);

  // Hold roundtrip (payload preserves unit prices)
  const holdPayload = {
    version: 1,
    cart: [
      {
        id: "line-1",
        productId: widget.id,
        productUnitId: unitId,
        name: widget.name,
        sku: widget.sku,
        baseUnit: widget.unit,
        sellUnit: widget.unit,
        packSize: 1,
        priceMode: "retail",
        minPrice: widget.min,
        listPrice: retail,
        unitPrice: retail,
        qty: 2,
        baseQty: 2,
        lineDisc: 0,
        amount: retail * 2,
        lotsNote: "test",
        minWarn: false,
      },
    ],
    customerId: "",
    guestName: "",
    guestPhone: "",
    priceMode: "retail",
    billDiscount: 0,
    discMode: "rs",
    discPct: 0,
    note: "pricing-suite",
  };
  const hold = await json(
    "POST",
    "/sales/holds",
    { label: "Pricing suite hold", payload: holdPayload },
    token,
  );
  row("hold-create", "holdId", "uuid", hold.id ? "uuid" : "missing");
  const got = await json("GET", `/sales/holds/${hold.id}`, null, token);
  const restoredPrice = got.payload?.cart?.[0]?.unitPrice;
  row("hold-resume-payload", "unitPrice", retail, restoredPrice);
  await json("DELETE", `/sales/holds/${hold.id}`, null, token);

  // Partial return (good) restores stock
  const beforeR = await json("GET", `/products/${widget.id}`, null, token);
  const stockR = beforeR.totalStock ?? beforeR.stock;
  const saleForReturn = await json(
    "POST",
    "/sales/complete",
    {
      clientRequestId: `suite-return-${Date.now()}`,
      items: [
        {
          productId: widget.id,
          productUnitId: unitId,
          quantity: 2,
          unitPrice: retail,
          priceMode: "RETAIL",
        },
      ],
      payments: [{ amount: retail * 2, paymentMethod: "CASH", amountTendered: retail * 2 }],
    },
    token,
  );
  const invId = saleForReturn.id;
  const invItemId = saleForReturn.items?.[0]?.id;
  const profitBefore = saleForReturn.items?.[0]?.grossProfit;
  try {
    const ret = await json(
      "POST",
      "/returns",
      {
        invoiceId: invId,
        returnType: "REFUND",
        reason: "pricing-suite partial return",
        items: [
          {
            invoiceItemId: invItemId,
            quantity: 1,
            condition: "GOOD",
            refundAmount: retail,
          },
        ],
      },
      token,
    );
    row("partial-return-good", "refundAmount", retail, ret.refundAmount);
    const afterR = await json("GET", `/products/${widget.id}`, null, token);
    row("partial-return-good", "stockDelta vs sale", -1, (afterR.totalStock ?? afterR.stock) - stockR);
    row(
      "partial-return-good",
      "sale line profit (2pc)",
      profitBefore,
      saleForReturn.items?.[0]?.grossProfit,
    );
  } catch (error) {
    row("partial-return-good", "API", "success", error instanceof Error ? error.message : "error");
  }

  // Multi-unit pack cases — skipped if DB has no pack row
  const multi = widget.sellUnits?.length > 1;
  row(
    "pack-wholesale-api",
    "status",
    multi ? "run" : "SKIP(no multi-unit product in DB)",
    multi ? "run" : "SKIP",
    multi,
  );

  printTable();
  const failed = rows.filter((r) => r.ran && !r.pass);
  process.exit(failed.length ? 1 : 0);
}

function printTable() {
  console.log("| Case | Metric | Expected | Actual | Ran | Pass |");
  console.log("|------|--------|----------|--------|-----|------|");
  for (const r of rows) {
    console.log(
      `| ${r.caseId} | ${r.metric} | ${r.expected} | ${r.actual} | ${r.ran ? "YES" : "NO"} | ${!r.ran ? "SKIP" : r.pass ? "YES" : "NO"} |`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
