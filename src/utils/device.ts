import { SEED_AUTH } from "@/shared/constants/api";

const DEVICE_KEY = "pos.device.id";

/** Local counter device id — single-shop POS uses the seeded counter until multi-device registration exists. */
export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored === SEED_AUTH.deviceId) return stored;
    localStorage.setItem(DEVICE_KEY, SEED_AUTH.deviceId);
    return SEED_AUTH.deviceId;
  } catch {
    return SEED_AUTH.deviceId;
  }
}
