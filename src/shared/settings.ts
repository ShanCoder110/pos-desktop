import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { RECEIPT_BRANDING } from "@/shared/constants/receiptBranding";
import type { PaperWidth, PrintSize, ShopSettings } from "@/shared/types";

export const defaultSettings: ShopSettings = {
  shopName: "Madina Electric",
  legalName: "",
  phone: "042 1110001",
  email: "",
  address: "Hall Road, Lahore",
  footer: RECEIPT_BRANDING.notValidForCourt,
  showBalanceOnSlip: true,
  printSize: "thermal",
  autoPrint: false,
  clearInvoiceAfterPrint: true,
  autoSku: false,
  minPriceRule: true,
  stockPick: "oldest",
  creditPriceMode: "WHOLESALE",
  defaultTax: 0,
  defaultDiscount: 0,
  isMainServer: true,
  currencySymbol: "Rs",
  currencyCode: "PKR",
  language: "EN",
  expiryReminderDays: 30,
  payoutDeductFrom: "PROFIT",
  invoicePrefix: "INV",
  skuPrefix: "P",
  lotPrefix: "L",
  fifoEnabled: true,
  receiptShopName: "Madina Electric",
  paperWidth: "MM_80",
  showLogo: true,
  receiptLogoDataUrl: "",
  receiptLogoScale: 100,
  receiptHeaderLayout: "logo_text",
  receiptTextSize: "medium",
  receiptPaymentStatusSize: "small",
  receiptShopNameSize: "medium",
  receiptShopNameBold: true,
  receiptTaglineAlign: "center",
  receiptTaglineSize: "medium",
  receiptContactAlign: "center",
  receiptContactSize: "medium",
  receiptAddressSize: "medium",
  receiptFooterSize: "medium",
  receiptFooterBold: true,
  receiptPromoAlign: "center",
  receiptPromoSize: "medium",
  receiptPromoBold: false,
  showCashierName: true,
  showItemDiscount: true,
  showUnitOnInvoice: false,
  receiptLanguage: "EN",
  tagline: RECEIPT_BRANDING.tagline,
  contactLine: RECEIPT_BRANDING.contactLine,
  promoUrdu: RECEIPT_BRANDING.promoUrdu,
  receiptFontFamily: "thermal",
  itemsTableBordered: true,
  printerName: "XP-80C",
  printerPaperWidth: "MM_80",
  printerSetupDone: false,
  copies: 1,
  splitLongBill: false,
  splitFirstPageItems: 12,
  splitMiddlePageItems: 15,
  splitLastPageItems: 12,
};

export function printSizeFromPaper(width: PaperWidth): PrintSize {
  return width === "A4" ? "a4" : "thermal";
}

function pick<K extends keyof ShopSettings>(settings: ShopSettings, keys: readonly K[]) {
  const next = {} as Pick<ShopSettings, K>;
  for (const key of keys) next[key] = settings[key];
  return next;
}

export const SettingsContext = createContext<{
  settings: ShopSettings;
  setSettings: (next: ShopSettings) => void;
}>({
  settings: defaultSettings,
  setSettings: () => undefined,
});

export function useSettings() {
  return useContext(SettingsContext);
}

export function useSettingsForm<K extends keyof ShopSettings>(keys: readonly K[]) {
  const { settings, setSettings } = useSettings();
  const live = useMemo(() => pick(settings, keys), [keys, settings]);
  const [draft, setDraft] = useState(live);

  useEffect(() => {
    setDraft(live);
  }, [live]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(live);

  function patch(next: Partial<Pick<ShopSettings, K>>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  function reset() {
    setDraft(live);
  }

  function save(extra?: Partial<ShopSettings>) {
    const paper =
      (draft as { printerPaperWidth?: PaperWidth }).printerPaperWidth ??
      (draft as { paperWidth?: PaperWidth }).paperWidth;
    setSettings({
      ...settings,
      ...draft,
      ...extra,
      ...(paper ? { printSize: printSizeFromPaper(paper) } : {}),
    });
  }

  return { draft, patch, dirty, save, reset };
}

export const stockPickLabel: Record<ShopSettings["stockPick"], string> = {
  oldest: "Sell oldest stock first",
  newest: "Sell newest stock first",
  ask: "Ask which supplier each time",
};
