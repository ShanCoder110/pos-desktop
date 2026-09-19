import type { LucideIcon } from "lucide-react";
import { Cloud, Globe, Monitor, Package, Printer, ReceiptText, Store } from "lucide-react";
import { routes } from "@/shared/constants/routes";

export type SettingsNavItem = {
  id: string;
  to: string;
  end?: boolean;
  label: string;
  hint: string;
  icon: LucideIcon;
};

export const SETTINGS_NAV: SettingsNavItem[] = [
  { id: "profile", to: routes.settings, end: true, label: "Shop Profile", hint: "Business name, address, contact", icon: Store },
  { id: "receipt", to: routes.settingsReceipt, label: "Invoice Settings", hint: "Numbering, footer, slip layout", icon: ReceiptText },
  { id: "products", to: routes.settingsProducts, label: "Products", hint: "Pricing rules when adding items", icon: Package },
  { id: "localization", to: routes.settingsLocalization, label: "Localization", hint: "Currency and language", icon: Globe },
  { id: "printer", to: routes.settingsPrinter, label: "Printer", hint: "This till’s hardware", icon: Printer },
  { id: "devices", to: routes.settingsDevices, label: "Devices", hint: "Tills, last seen, last sync", icon: Monitor },
  { id: "sync", to: routes.settingsSync, label: "Backup & Sync", hint: "Push, pull, and this machine", icon: Cloud },
];
