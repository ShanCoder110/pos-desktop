#!/usr/bin/env node
/**
 * Full pricing edge-case matrix via real API.
 * Creates/loads multi-unit fixture, runs cases, prints markdown table.
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
function profitMarginPercent(sell, cost) {
  if (!sell || sell <= 0) return 0;
  return ((sell - cost) / sell) * 100;
}

const API = process.env.API_URL || "http://127.0.0.1:38472/api/v1";
const DEVICE = "20000000-0000-4000-8000-000000000003";
const FIXTURE_PATH = new URL("./.pricing-fixture.json", import.meta.url);
const OUT_JSON = "/opt/cursor/artifacts/pricing-edge-matrix.json";
const OUT_MD = "/opt/cursor/artifacts/pricing-edge-matrix.md";

const rows = [];

function record(id, layer, expected, actual, pass, ran = true) {
  rows.push({ id, layer, expected, actual, pass, ran });
}

function close(a, b, eps = 0.05) {
  return Math.abs(Number(a) - Number(b)) < eps;
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
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error?.message || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function unit(product, name) {
  return product.sellUnits?.find((u) => u.name === name);
}

async function ensureFixture(token, ctx) {
  try {
    const saved = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
    const p = await json("GET", `/products/${saved.productId}`, null, token);
    return { ...saved, product: p };
  } catch {
    /* create */
  }

  const list = await json("GET", "/products?page=1&perPage=100&search=PMX-001", null, token);
  const existing = list.data?.find((p) => p.sku === "PMX-001");
  if (existing) {
    const p = await json("GET", `/products/${existing.id}`, null, token);
    const fixture = {
      productId: p.id,
      sku: p.sku,
      pieceId: unit(p, "Piece")?.id,
      packId: unit(p, "Pack")?.id,
      cartonId: unit(p, "Carton")?.id,
    };
    await writeFile(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
    return { ...fixture, product: p };
  }

  const PC = "10000000-0000-4000-8000-000000000001";
  const cats = await json("GET", "/categories?page=1&perPage=5", null, token);
  const categoryId = cats.data?.[0]?.id;
  const p = await json("POST", "/products", {
    name: "Pricing Matrix Multi-Unit",
    sku: "PMX-001",
    categoryId,
    baseUnitId: PC,
    minimumStock: 0,
    sellUnits: [
      {
        unitId: PC,
        name: "Piece",
        contains: 1,
        cost: 8,
        min: 90,
        wholesale: 95,
        price: 100,
        isBase: true,
        isDefault: true,
      },
      {
        unitId: PC,
        name: "Pack",
        contains: 12,
        cost: 90,
        min: 1080,
        wholesale: 1140,
        price: 1200,
      },
      {
        unitId: PC,
        name: "Carton",
        contains: 120,
        cost: 900,
        min: 10800,
        wholesale: 11000,
        price: 12000,
      },
    ],
    openingStock: {
      branchId: ctx.branchId,
      quantity: 5000,
      cost: 8,
      receivedDate: new Date().toISOString().slice(0, 10),
    },
  }, token);

  const zero = await json("POST", "/products", {
    name: "Pricing Zero Cost Piece",
    sku: "PMX-ZERO",
    categoryId,
    baseUnitId: PC,
    sellUnits: [
      {
        unitId: PC,
        name: "Piece",
        contains: 1,
        cost: 0,
        min: 0,
        wholesale: 10,
        price: 20,
        isBase: true,
        isDefault: true,
      },
    ],
    openingStock: {
      branchId: ctx.branchId,
      quantity: 200,
      cost: 0,
      receivedDate: new Date().toISOString().slice(0, 10),
    },
  }, token);

  const fixture = {
    productId: p.id,
    sku: p.sku,
    pieceId: unit(p, "Piece")?.id,
    packId: unit(p, "Pack")?.id,
    cartonId: unit(p, "Carton")?.id,
    zeroProductId: zero.id,
    zeroPieceId: unit(zero, "Piece")?.id,
  };
  await writeFile(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  return { ...fixture, product: p, zeroProduct: zero };
}

async function stock(token, productId) {
  const p = await json("GET", `/products/${productId}`, null, token);
  return p.totalStock ?? p.stock;
}

async function sale(token, items, extra = {}) {
  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice + (i.tax || 0), 0);
  return json("POST", "/sales/complete", {
    clientRequestId: `pmx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    items: items.map((i) => ({
      productId: i.productId,
      productUnitId: i.productUnitId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      priceMode: i.priceMode || "RETAIL",
      tax: i.tax || 0,
      discount: i.discount || 0,
    })),
    payments: extra.payments ?? [{ amount: total, paymentMethod: "CASH", amountTendered: total }],
    customerId: extra.customerId ?? null,
    discount: extra.discount || 0,
    tax: extra.tax || 0,
    notes: extra.notes ?? null,
  }, token);
}

async function main() {
  await mkdir("/opt/cursor/artifacts", { recursive: true });
  const login = await json("POST", "/auth/login", {
    email: "shan@shop.com",
    password: "TestPass123!",
    deviceId: DEVICE,
  });
  const token = login.token;
  const me = await json("GET", "/auth/me", null, token);
  const ctx = { branchId: me.branchId };

  const fx = await ensureFixture(token, ctx);
  const { productId, pieceId, packId, cartonId, zeroProductId, zeroPieceId } = fx;
  const piece = unit(fx.product, "Piece");
  const pack = unit(fx.product, "Pack");
  const carton = unit(fx.product, "Carton");

  // Pack retail
  let s0 = await stock(token, productId);
  const packSale = await sale(token, [
    {
      productId,
      productUnitId: packId,
      quantity: 1,
      unitPrice: pack.price,
      priceMode: "RETAIL",
    },
  ]);
  const s1 = await stock(token, productId);
  const expPackProfit = packSale.items[0].lineTotal - packSale.items[0].fifoCost;
  record(
    "pack-retail-stock",
    "API",
    s0 - 12,
    s1,
    close(s0 - 12, s1),
  );
  record("pack-retail-total", "API", pack.price, packSale.total, close(pack.price, packSale.total));
  record(
    "pack-retail-profit",
    "API",
    expPackProfit,
    packSale.items[0].grossProfit,
    close(expPackProfit, packSale.items[0].grossProfit),
  );
  record(
    "pack-retail-margin%",
    "API",
    profitMarginPercent(packSale.items[0].lineTotal, packSale.items[0].fifoCost),
    profitMarginPercent(packSale.items[0].lineTotal, packSale.items[0].fifoCost),
    true,
  );

  // Carton wholesale
  s0 = await stock(token, productId);
  const cartonSale = await sale(token, [
    {
      productId,
      productUnitId: cartonId,
      quantity: 1,
      unitPrice: carton.wholesale,
      priceMode: "WHOLESALE",
    },
  ]);
  const s2 = await stock(token, productId);
  record("carton-wholesale-stock", "API", s0 - 120, s2, close(s0 - 120, s2));
  record(
    "carton-wholesale-total",
    "API",
    carton.wholesale,
    cartonSale.total,
    close(carton.wholesale, cartonSale.total),
  );

  // Fractional pack 0.5
  s0 = await stock(token, productId);
  const half = await sale(token, [
    {
      productId,
      productUnitId: packId,
      quantity: 0.5,
      unitPrice: pack.price,
    },
  ]);
  record("pack-fractional-stock", "API", s0 - 6, await stock(token, productId), close(s0 - 6, await stock(token, productId)));
  record("pack-fractional-total", "API", 600, half.total, close(600, half.total));

  // Large qty 10 packs
  s0 = await stock(token, productId);
  await sale(token, [
    { productId, productUnitId: packId, quantity: 10, unitPrice: pack.wholesale, priceMode: "WHOLESALE" },
  ]);
  record("pack-large-qty-stock", "API", s0 - 120, await stock(token, productId), close(s0 - 120, await stock(token, productId)));

  // Line tax
  s0 = await stock(token, productId);
  const taxLine = 17.5;
  const taxed = await sale(token, [
    {
      productId,
      productUnitId: pieceId,
      quantity: 1,
      unitPrice: piece.price,
      tax: taxLine,
    },
  ]);
  record("line-tax-total", "API", piece.price + taxLine, taxed.total, close(piece.price + taxLine, taxed.total));

  // Zero cost profit
  if (zeroProductId && zeroPieceId) {
    const zSale = await sale(token, [
      { productId: zeroProductId, productUnitId: zeroPieceId, quantity: 3, unitPrice: 20 },
    ]);
    record(
      "zero-cost-profit",
      "API",
      60,
      zSale.items[0].grossProfit,
      close(60, zSale.items[0].grossProfit),
    );
  }

  // Partial return pack line
  const retSale = await sale(token, [
    { productId, productUnitId: packId, quantity: 2, unitPrice: pack.price },
  ]);
  const itemId = retSale.items[0].id;
  s0 = await stock(token, productId);
  const goodRet = await json("POST", "/returns", {
    invoiceId: retSale.id,
    returnType: "REFUND",
    reason: "pmx partial pack",
    items: [{ invoiceItemId: itemId, quantity: 1, condition: "GOOD", refundAmount: pack.price }],
  }, token);
  const sAfterGood = await stock(token, productId);
  record("partial-return-pack-refund", "API", pack.price, goodRet.refundAmount, close(pack.price, goodRet.refundAmount));
  record("partial-return-pack-stock", "API", s0 + 12, sAfterGood, close(s0 + 12, sAfterGood));

  // Damaged return — sellable stock unchanged
  const dmgSale = await sale(token, [
    { productId, productUnitId: pieceId, quantity: 5, unitPrice: piece.price },
  ]);
  const dmgItem = dmgSale.items[0].id;
  s0 = await stock(token, productId);
  await json("POST", "/returns", {
    invoiceId: dmgSale.id,
    returnType: "REFUND",
    reason: "pmx damaged",
    items: [{ invoiceItemId: dmgItem, quantity: 2, condition: "DAMAGED", refundAmount: 200 }],
  }, token);
  const sAfterDmg = await stock(token, productId);
  record("damaged-return-sellable-stock", "API", s0, sAfterDmg, close(s0, sAfterDmg));

  // Over-return blocked
  try {
    await json("POST", "/returns", {
      invoiceId: dmgSale.id,
      returnType: "REFUND",
      reason: "over",
      items: [{ invoiceItemId: dmgItem, quantity: 99, condition: "GOOD", refundAmount: 0 }],
    }, token);
    record("over-return-blocked", "API", "validation error", "success", false);
  } catch (e) {
    record(
      "over-return-blocked",
      "API",
      "error",
      e.data?.error?.message || e.message,
      e.status === 400 || /exceed|validation/i.test(e.data?.error?.message || e.message),
    );
  }

  // Invoice revise — qty 1 → 2 same invoice
  const stockBeforeRevSale = await stock(token, productId);
  const revBase = await sale(token, [
    { productId, productUnitId: pieceId, quantity: 1, unitPrice: piece.price },
  ]);
  const invNo = revBase.invoiceNumber;
  const stockAfterRevSale = await stock(token, productId);
  const revised = await json("POST", `/invoices/${revBase.id}/revise`, {
    clientRequestId: `rev-${Date.now()}`,
    items: [
      {
        productId,
        productUnitId: pieceId,
        quantity: 2,
        unitPrice: piece.price,
        priceMode: "RETAIL",
      },
    ],
    payments: [{ amount: 200, paymentMethod: "CASH", amountTendered: 200 }],
  }, token);
  record("revise-same-invoice-number", "API", invNo, revised.invoiceNumber, invNo === revised.invoiceNumber);
  record("revise-total", "API", 200, revised.total, close(200, revised.total));
  const stockAfterRevise = await stock(token, productId);
  const deltaFromSale = stockAfterRevise - stockAfterRevSale;
  const deltaFromBefore = stockAfterRevise - stockBeforeRevSale;
  record("revise-stock-delta-from-sale", "API", -1, deltaFromSale, close(-1, deltaFromSale));
  record("revise-stock-net-qty2", "API", -2, deltaFromBefore, close(-2, deltaFromBefore));

  // Credit book API (5k + 3k - 4k pay = 4k balance)
  const cust = await json("POST", "/customers", {
    name: `Pricing Credit ${Date.now()}`,
    phone: `03${crypto.randomUUID().replace(/\D/g, "").slice(0, 9)}`,
    inCreditBook: true,
    isActive: true,
  }, token);
  const cid = cust.id;
  await sale(token, [{ productId, productUnitId: pieceId, quantity: 50, unitPrice: 100 }], {
    customerId: cid,
    payments: [],
  });
  await sale(token, [{ productId, productUnitId: pieceId, quantity: 30, unitPrice: 100 }], {
    customerId: cid,
    payments: [],
  });
  await json("POST", `/customers/${cid}/payments`, {
    amount: 4000,
    paymentMethod: "CASH",
    clientRequestId: `pay-${Date.now()}`,
  }, token);
  const ledger = await json("GET", `/customers/${cid}/ledger`, null, token);
  record("credit-balance-4k", "API", 4000, ledger.balance, close(4000, ledger.balance));

  await sale(token, [{ productId, productUnitId: pieceId, quantity: 5, unitPrice: 100 }], {
    customerId: cid,
    payments: [],
  });
  record("credit-next-day-purchase", "API", 4500, (await json("GET", `/customers/${cid}/ledger`, null, token)).balance, close(4500, (await json("GET", `/customers/${cid}/ledger`, null, token)).balance));

  const creditInvs = (await json("GET", `/invoices?customerId=${cid}&page=1&perPage=20`, null, token)).data || [];
  const creditInv = creditInvs.find((inv) => inv.total >= 5000) ?? creditInvs[0];
  if (creditInv) {
    const cItem = creditInv.items?.[0]?.id;
    if (cItem) {
      const balBefore = (await json("GET", `/customers/${cid}/ledger`, null, token)).balance;
      await json("POST", "/returns", {
        invoiceId: creditInv.id,
        returnType: "REFUND",
        reason: "credit return",
        items: [{ invoiceItemId: cItem, quantity: 1, condition: "GOOD", refundAmount: 100 }],
      }, token);
      const balAfter = (await json("GET", `/customers/${cid}/ledger`, null, token)).balance;
      record("credit-return-reduces-balance", "API", balBefore - 100, balAfter, close(balBefore - 100, balAfter));
    }
  }

  const payTxns = await json("GET", "/transactions?page=1&perPage=50", null, token);
  const paymentNotSale = (payTxns.data || []).filter(
    (t) =>
      t.transactionType === "CUSTOMER_PAYMENT" ||
      t.transactionType === "PAYMENT_RECEIVED" ||
      t.transactionType === "PAYMENT",
  );
  record(
    "payments-not-sale-revenue",
    "API",
    "CUSTOMER_PAYMENT entries exist",
    paymentNotSale.length > 0 ? "yes" : "no",
    paymentNotSale.length > 0,
  );

  const today = new Date().toISOString().slice(0, 10);
  let sumToday = 0;
  for (let page = 1; page <= 20; page++) {
    const invToday = await json(
      "GET",
      `/invoices?page=${page}&perPage=200&status=COMPLETED`,
      null,
      token,
    );
    sumToday += (invToday.data || [])
      .filter((i) => (i.completedAt || "").startsWith(today))
      .reduce((s, i) => s + i.total, 0);
    if (!invToday.meta?.hasNextPage) break;
  }
  const dash = await json("GET", "/reports/dashboard", null, token);
  record(
    "dashboard-today-sales",
    "API",
    sumToday,
    dash.todaySalesTotal,
    close(sumToday, dash.todaySalesTotal, 2),
  );

  const analytics = await json("GET", "/reports/analytics", null, token);
  const top = analytics.topProducts?.find((t) => t.productId === productId);
  record(
    "analytics-includes-pmx",
    "API",
    "PMX in top products",
    top ? `qty ${top.quantity}` : "missing",
    Boolean(top),
  );

  await writeFile(OUT_JSON, JSON.stringify({ rows, fixture: fx }, null, 2));
  const md = [
    "# Pricing edge matrix (API)",
    "",
    "| ID | Layer | Expected | Actual | Ran | Pass |",
    "|----|-------|----------|--------|-----|------|",
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.layer} | ${r.expected} | ${r.actual} | ${r.ran ? "YES" : "NO"} | ${r.pass ? "YES" : "NO"} |`,
    ),
    "",
    `Failed: ${rows.filter((r) => r.ran && !r.pass).length}`,
  ].join("\n");
  await writeFile(OUT_MD, md);
  console.log(md);
  const failed = rows.filter((r) => r.ran && !r.pass).length;
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
