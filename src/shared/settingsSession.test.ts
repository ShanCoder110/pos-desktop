import { describe, expect, it, vi } from "vitest";
import { SettingsSession } from "./settingsSession";
import { defaultSettings } from "./settings";

describe("settings session", () => {
  it("loads once and reuses the latest saved settings without fetching for prints", async () => {
    const session = new SettingsSession();
    const load = vi.fn(async () => defaultSettings);
    const [first, second] = await Promise.all([
      session.load("counter", load),
      session.load("counter", load),
    ]);
    expect(first).toBe(second);
    expect(load).toHaveBeenCalledTimes(1);
    const saved = { ...defaultSettings, receiptFooterBold: false, receiptTotalsPt: 18 };
    session.update("counter", saved);
    expect(await session.load("counter", load)).toEqual(saved);
    expect(await session.load("counter", load)).toEqual(saved);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("reloads for another scope or after sign-out", async () => {
    const session = new SettingsSession();
    const load = vi.fn(async () => defaultSettings);
    await session.load("a", load);
    await session.load("b", load);
    session.clear();
    await session.load("b", load);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("permits a retry after the initial request fails", async () => {
    const session = new SettingsSession();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue(defaultSettings);
    await expect(session.load("counter", load)).rejects.toThrow("Offline");
    expect(await session.load("counter", load)).toEqual(defaultSettings);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
