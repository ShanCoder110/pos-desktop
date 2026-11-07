import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoiceThermalReceipt } from "@/components/print/InvoiceThermalReceipt";
import { defaultSettings } from "@/shared/settings";
import type { InvoiceItemRow } from "@/shared/domain/types";
import { receiptLinesFromInvoice } from "@/utils/posReceipt";
import { posLineDiscount } from "@/pages/pos/posBilling";

describe("saved invoice receipt", () => {
  it.each(["EN", "UR"] as const)(
    "does not print an above-minimum wholesale reduction as discount in %s preview or saved receipt",
    (language) => {
      const discount = posLineDiscount(
        { priceMode: "wholesale", listPrice: 100, minPrice: 90, unitPrice: 95, qty: 1 },
        defaultSettings.wholesaleDiscountBelowMinimumOnly,
      );
      expect(discount).toBe(0);
      const savedLines = receiptLinesFromInvoice({
        items: [
          {
            id: "line",
            productId: "product",
            productUnitId: "unit",
            productName: "Cable",
            sku: "P1",
            unitName: "Piece",
            quantity: 1,
            baseQuantity: 1,
            unitPrice: 95,
            priceMode: "WHOLESALE",
            discount: 0,
            total: 95,
            fifoCost: 70,
            grossProfit: 25,
          },
        ],
      });
      const previewLines = [{ ...savedLines[0], minFloor: 90, discount }];
      for (const lines of [previewLines, savedLines]) {
        const html = renderToStaticMarkup(
          createElement(InvoiceThermalReceipt, {
            settings: { ...defaultSettings, receiptLanguage: language },
            customer: { id: "walk-in", name: "Walk-in", phone: "", balance: 0, isWalking: true },
            lines,
            total: 95,
            discount: 0,
            paid: 95,
            balanceBefore: 0,
            balanceAfter: 0,
          }),
        );
        expect(html).toContain('class="receipt-col-price">95</td>');
        expect(html).toContain('class="receipt-col-total receipt-bold">95</td>');
        expect(html).toContain(
          `<span>${language === "UR" ? "رعایت" : "Discount"}</span><span>Rs. 0</span>`,
        );
        expect(html).not.toContain("- Rs. 5");
      }
    },
  );
  it.each(["EN", "UR"] as const)(
    "hides unit names by default on %s receipts and allows opting in",
    (language) => {
      const render = (showUnitOnInvoice = defaultSettings.showUnitOnInvoice) =>
        renderToStaticMarkup(
          createElement(InvoiceThermalReceipt, {
            settings: { ...defaultSettings, receiptLanguage: language, showUnitOnInvoice },
            customer: { id: "walk-in", name: "Walk-in", phone: "", balance: 0, isWalking: true },
            lines: [
              {
                id: "1",
                productId: "p1",
                name: "Cable",
                qty: 2.5,
                unit: "Piece",
                price: 100,
                minFloor: 0,
                lotsNote: "",
              },
            ],
            total: 250,
            paid: 250,
            balanceBefore: 0,
            balanceAfter: 0,
          }),
        );
      expect(defaultSettings.showUnitOnInvoice).toBe(false);
      expect(render()).toContain('class="receipt-col-qty">2.5</td>');
      expect(render(true)).toContain(
        `class="receipt-col-qty">2.5 ${language === "UR" ? "عدد" : "pcs"}</td>`,
      );
      expect(render()).toContain('class="receipt-col-total receipt-bold">250</td>');
    },
  );

  it("prints the persisted edited unit price and matching totals", () => {
    const item: InvoiceItemRow = {
      id: "line-1",
      productId: "product-1",
      productUnitId: "unit-1",
      productName: "Test item",
      sku: "P-0001",
      unitName: "Piece",
      quantity: 1,
      baseQuantity: 1,
      unitPrice: 90,
      priceMode: "RETAIL",
      discount: 0,
      total: 90,
      fifoCost: 50,
      grossProfit: 40,
    };
    const lines = receiptLinesFromInvoice({ items: [item] });
    expect(lines[0].price).toBe(90);

    const html = renderToStaticMarkup(
      createElement(InvoiceThermalReceipt, {
        settings: { ...defaultSettings, receiptLanguage: "EN" },
        customer: { id: "walk-in", name: "Walk-in", phone: "", balance: 0, isWalking: true },
        lines,
        total: 90,
        discount: 0,
        paid: 90,
        balanceBefore: 0,
        balanceAfter: 0,
        invoiceNumber: "INV-0001",
      }),
    );
    expect(html).toContain("Test item");
    expect(html).toContain('class="receipt-col-price">90</td>');
    expect(html).toContain('class="receipt-col-total receipt-bold">90</td>');
    expect(html).toContain("Subtotal");
    expect(html).not.toContain('class="receipt-col-price">100</td>');
  });

  it("labels unpaid and partially paid walk-in invoices on the printed slip", () => {
    const render = (paid: number) =>
      renderToStaticMarkup(
        createElement(InvoiceThermalReceipt, {
          settings: {
            ...defaultSettings,
            receiptLanguage: "EN",
            receiptPaymentStatusSize: "small",
          },
          customer: { id: "walk-in", name: "Walk-in", phone: "", balance: 0, isWalking: true },
          lines: [],
          total: 100,
          discount: 0,
          paid,
          balanceBefore: 0,
          balanceAfter: 0,
          invoiceNumber: "INV-0002",
        }),
      );

    expect(render(0)).toContain('is-unpaid" role="status">Unpaid');
    expect(render(0)).toContain("Remaining Amount");
    expect(render(40)).toContain('is-partial" role="status">Partially paid');
    expect(render(100)).toContain('is-paid" role="status">Paid');
  });
});
