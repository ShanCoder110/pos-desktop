import { apiRequest } from "@/services/api";
import type { ShopSettings } from "@/shared/types";

export function getAppSettings(signal?: AbortSignal) {
  return apiRequest<Partial<ShopSettings> | null>("/settings/app", { signal });
}
export function saveAppSettings(settings: ShopSettings) {
  return apiRequest<ShopSettings>("/settings/app", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
