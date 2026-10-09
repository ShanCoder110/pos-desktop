#!/usr/bin/env node
/**
 * Browser pricing UI cases (Vite :1420, API :38472).
 */
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.APP_URL || "http://127.0.0.1:1420";
const API = process.env.API_URL || "http://127.0.0.1:38472/api/v1";
const DEVICE = "20000000-0000-4000-8000-000000000003";
const SHOTS = "/opt/cursor/artifacts/screenshots";
const rows = [];

function record(id, expected, actual, pass) {
  rows.push({ id, layer: "UI", expected, actual, pass, ran: true });
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  if (!page.url().includes("/login")) return;
  await page.fill('input[type="email"], input[name="email"]', "shan@shop.com");
  await page.fill('input[type="password"]', "TestPass123!");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25000 });
}

async function apiLogin() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "shan@shop.com",
      password: "TestPass123!",
      deviceId: DEVICE,
    }),
  });
  const data = await res.json();
  return data.token;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const fixture = JSON.parse(
    await readFile(new URL("./.pricing-fixture.json", import.meta.url), "utf8"),
  );
  const token = await apiLogin();
  const product = await fetch(`${API}/products/${fixture.productId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const pack = product.sellUnits?.find((u) => u.name === "Pack");
  const piece = product.sellUnits?.find((u) => u.name === "Piece");

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);

  // POS unit-first + pack add + mid-line unit switch
  await page.goto(`${BASE}/pos`, { waitUntil: "networkidle" });
  const search = page.locator("#productSearch, input[placeholder*='Search']").first();
  await search.fill("Pricing Matrix");
  await page.waitForTimeout(900);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const packBtn = page.locator(".unit-tog").filter({ hasText: /Pack/i }).first();
  await packBtn.click();
  await page.waitForTimeout(300);
  await page.locator("#btnWholesale, .mode-btn").filter({ hasText: /Wholesale/i }).first().click();
  await page.waitForTimeout(300);
  const wholesaleBtn = page.locator("#btnWholesale, .mode-btn").filter({ hasText: /Wholesale/i }).first();
  const wText = await wholesaleBtn.innerText();
  await page.screenshot({ path: `${SHOTS}/pmx-pos-pack-wholesale.png` });
  record(
    "ui-unit-before-tier",
    String(pack?.wholesale ?? 1140),
    wText,
    wText.replace(/[^\d]/g, "").includes(String(pack?.wholesale ?? 1140).replace(".", "")),
  );
  await page.locator("#qtyInput").fill("1");
  await page.locator("#btnAdd, button:has-text('Add')").first().click();
  await page.waitForTimeout(600);
  const linePackPrice = await page.locator(".c-price input").first().inputValue().catch(() => "");
  record("ui-pack-cart-price", String(pack?.wholesale ?? 1140), linePackPrice, linePackPrice.includes(String(pack?.wholesale ?? 1140).slice(0, 3)));

  const pieceToggle = page.locator(".line-units button").filter({ hasText: /Piece|pc/i }).first();
  if (await pieceToggle.isVisible().catch(() => false)) {
    await pieceToggle.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    const linePiecePrice = await page.locator(".c-price input").first().inputValue().catch(() => "");
    await page.screenshot({ path: `${SHOTS}/pmx-pos-mid-cart-unit-switch.png` });
    record(
      "ui-mid-cart-switch-piece",
      String(piece?.wholesale ?? 95),
      linePiecePrice,
      linePiecePrice.includes(String(piece?.wholesale ?? 95)),
    );
  }

  const holdPayload = {
    version: 1,
    cart: [
      {
        id: "ui-hold-line",
        productId: product.id,
        productUnitId: pack.id,
        name: product.name,
        sku: product.sku,
        baseUnit: product.unit,
        sellUnit: "Pack",
        packSize: 12,
        priceMode: "wholesale",
        minPrice: pack.min,
        listPrice: pack.wholesale,
        unitPrice: pack.wholesale,
        qty: 1,
        baseQty: 12,
        lineDisc: 0,
        amount: pack.wholesale,
        lotsNote: "ui-hold",
        minWarn: false,
      },
    ],
    customerId: "",
    guestName: "",
    guestPhone: "",
    priceMode: "wholesale",
    billDiscount: 0,
    discMode: "rs",
    discPct: 0,
    note: "ui-hold",
  };
  await fetch(`${API}/sales/holds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ label: "UI hold resume", payload: holdPayload }),
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.keyboard.press("F4");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/pmx-pos-hold-modal.png` });
  await page.locator(".modal:not([hidden]) .list-row").first().click({ timeout: 8000 });
  await page.waitForTimeout(800);
  const cartLines = await page.locator("tbody tr").count();
  record("ui-hold-resume-lines", ">=1", String(cartLines), cartLines >= 1);
  await page.screenshot({ path: `${SHOTS}/pmx-pos-hold-resumed.png` });

  // Credit book browser flow
  await page.goto(`${BASE}/credit`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const bookRow = page.locator("table tbody tr").first();
  if (await bookRow.count()) {
    await bookRow.click();
    await page.waitForTimeout(800);
    const newSale = page.getByRole("button", { name: /new credit sale/i }).first();
    if (await newSale.count()) {
      await newSale.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}/pmx-credit-unit-first.png` });
      const unitBlock = page.locator("text=Unit").first();
      record("ui-credit-unit-first", "visible", await unitBlock.isVisible() ? "visible" : "hidden", await unitBlock.isVisible());
    }
  }

  await browser.close();
  const md = [
    "# Pricing edge matrix (UI)",
    "",
    "| ID | Layer | Expected | Actual | Ran | Pass |",
    "|----|-------|----------|--------|-----|------|",
    ...rows.map(
      (r) => `| ${r.id} | ${r.layer} | ${r.expected} | ${r.actual} | YES | ${r.pass ? "YES" : "NO"} |`,
    ),
  ].join("\n");
  await writeFile("/opt/cursor/artifacts/pricing-edge-ui.md", md);
  console.log(md);
  process.exit(rows.every((r) => r.pass) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
