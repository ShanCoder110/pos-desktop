import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PaperWidth, PrintSize, ShopSettings } from "@/shared/types";

export const defaultSettings: ShopSettings = {
  shopName: "Madina Electric",
  legalName: "",
  phone: "042 1110001",
  email: "",
  address: "Hall Road, Lahore",
  footer: "Thank you. Goods once sold are not returned without receipt.",
  showBalanceOnSlip: true,
  printSize: "thermal",
  autoPrint: true,
  autoSku: false,
  minPriceRule: true,
  stockPick: "oldest",
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
  showCashierName: true,
  showItemDiscount: false,
  tagline: "",
  contactLine: "",
  promoUrdu: "",
  printerName: "XP-80C",
  printerPaperWidth: "MM_80",
  copies: 1,
  splitLongBill: false,
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

  function save() {
    const paper =
      (draft as { printerPaperWidth?: PaperWidth }).printerPaperWidth ??
      (draft as { paperWidth?: PaperWidth }).paperWidth;
    setSettings({
      ...settings,
      ...draft,
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
