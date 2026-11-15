import type { ShopSettings } from "@/shared/types";

const KEY = "dukan:shop-settings";

export function loadShopSettings(
  storage: Pick<Storage, "getItem">,
  defaults: ShopSettings,
): ShopSettings {
  try {
    const saved = storage.getItem(KEY);
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  } catch {
    return defaults;
  }
}

export function persistShopSettings(storage: Pick<Storage, "setItem">, settings: ShopSettings) {
  storage.setItem(KEY, JSON.stringify(settings));
}
