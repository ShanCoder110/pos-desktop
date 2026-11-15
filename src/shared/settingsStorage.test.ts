import { describe, expect, it } from "vitest";
import { defaultSettings } from "./settings";
import { loadShopSettings, persistShopSettings } from "./settingsStorage";

describe("settings persistence", () => {
  it("restores the full invoice settings after refresh, including false and zero values", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const saved = {
      ...defaultSettings,
      receiptFooterBold: false,
      receiptFontFamily: "arial" as const,
      receiptHeaderTextPt: 14,
      receiptTotalsPt: 18,
      receiptTopMarginMm: 0,
      receiptBottomMarginMm: 0,
      receiptBorderPx: 3,
      receiptLogoDataUrl: "data:image/png;base64,test",
    };
    persistShopSettings(storage, saved);
    expect(loadShopSettings(storage, defaultSettings)).toEqual(saved);
  });
  it("fills new defaults for older saved settings", () => {
    expect(
      loadShopSettings({ getItem: () => '{"receiptFooterBold":true}' }, defaultSettings),
    ).toEqual({ ...defaultSettings, receiptFooterBold: true });
  });
  it("reports a failed write rather than silently swallowing it", () => {
    expect(() =>
      persistShopSettings(
        {
          setItem: () => {
            throw new Error("Storage full");
          },
        },
        defaultSettings,
      ),
    ).toThrow("Storage full");
  });
});
