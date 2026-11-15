import type { ShopSettings } from "@/shared/types";

/** One database load per signed-in scope, including concurrent/StrictMode mounts. */
export class SettingsSession {
  private entry?: { scope: string; promise: Promise<ShopSettings> };

  load(scope: string, loader: () => Promise<ShopSettings>) {
    if (this.entry?.scope === scope) return this.entry.promise;
    const entry = { scope, promise: Promise.resolve().then(loader) };
    this.entry = entry;
    entry.promise = entry.promise.catch((error) => {
      if (this.entry === entry) this.entry = undefined;
      throw error;
    });
    return entry.promise;
  }

  update(scope: string, settings: ShopSettings) {
    this.entry = { scope, promise: Promise.resolve(settings) };
  }

  clear() {
    this.entry = undefined;
  }
}
