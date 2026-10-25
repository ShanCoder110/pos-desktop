import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFontEmbedCSS, toBlob } from "html-to-image";
import { captureReceiptPages } from "./receiptCapture";

vi.mock("html-to-image", () => ({ getFontEmbedCSS: vi.fn(), toBlob: vi.fn() }));

const page = { clientWidth: 280, scrollWidth: 280, clientHeight: 500, scrollHeight: 1200 };
const node = {
  querySelectorAll: (selector: string) => (selector === ".slip-page" ? [page, page] : []),
} as unknown as HTMLElement;

describe("receipt preparation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
    vi.mocked(getFontEmbedCSS).mockResolvedValue("embedded receipt fonts");
    vi.mocked(toBlob).mockResolvedValue(new Blob([new Uint8Array([1, 2])]));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("captures full page heights and embeds fonts once for all split pages", async () => {
    const pages = await captureReceiptPages(node, "MM_80");
    expect(pages).toEqual([new Uint8Array([1, 2]), new Uint8Array([1, 2])]);
    expect(getFontEmbedCSS).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledTimes(2);
    expect(toBlob).toHaveBeenCalledWith(
      page,
      expect.objectContaining({
        width: 280,
        height: 1216,
        fontEmbedCSS: "embedded receipt fonts",
      }),
    );
  });

  it("stops preparation after timeout even if the fonts finish loading later", async () => {
    vi.useFakeTimers();
    let loaded!: () => void;
    vi.stubGlobal("document", {
      fonts: {
        ready: new Promise<void>((resolve) => {
          loaded = resolve;
        }),
      },
    });
    const result = captureReceiptPages(node, "MM_80");
    const rejected = expect(result).rejects.toThrow("Nothing was sent to the printer");
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    loaded();
    await vi.runAllTimersAsync();
    expect(toBlob).not.toHaveBeenCalled();
    expect(getFontEmbedCSS).not.toHaveBeenCalled();
  });

  it("reports capture failure instead of returning an incomplete receipt", async () => {
    vi.mocked(toBlob).mockResolvedValueOnce(null);
    await expect(captureReceiptPages(node, "MM_80")).rejects.toThrow(
      "Could not capture the receipt",
    );
  });
  it("loads newly mounted receipt fonts before measuring or capturing", async () => {
    const load = vi.fn().mockResolvedValue([]);
    vi.stubGlobal("document", { fonts: { ready: Promise.resolve(), load } });
    vi.stubGlobal("getComputedStyle", () => ({
      fontStyle: "normal",
      fontWeight: "400",
      fontSize: "20px",
      fontFamily: "Jameel Noori Nastaleeq",
    }));
    const receipt = {
      textContent: "اردو",
      querySelectorAll: (selector: string) => (selector === ".slip-page" ? [page] : []),
    } as unknown as HTMLElement;
    await captureReceiptPages(receipt, "MM_80");
    expect(load).toHaveBeenCalledWith("normal 400 20px Jameel Noori Nastaleeq", "اردو");
    expect(load.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(toBlob).mock.invocationCallOrder[0],
    );
  });
});
