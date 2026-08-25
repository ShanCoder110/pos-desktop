import { createContext, useContext } from "react";
import type { ShopSettings } from "@/shared/types";

export const defaultSettings: ShopSettings = {
  shopName: "Madina Electric",
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
};

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

export const stockPickLabel: Record<ShopSettings["stockPick"], string> = {
  oldest: "Sell oldest stock first",
  newest: "Sell newest stock first",
  ask: "Ask which supplier each time",
};
