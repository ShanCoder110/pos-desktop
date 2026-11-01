import { describe, expect, it, vi } from "vitest";
import {
  completePosInvoice,
  confirmBrowserPrint,
  finishPosPrint,
  preparePosReceipt,
} from "./posPrintFlow";

function flow() {
  return {
    hasItems: true,
    editing: false,
    printNow: false,
    saveDraft: vi.fn(async () => true),
    previewDraft: vi.fn(),
    saveInvoice: vi.fn(async (): Promise<string | null> => "INV-1"),
    showReceipt: vi.fn(),
    lastReceipt: null as string | null,
    nothingToPrint: vi.fn(),
  };
}

describe("POS preview and print lifecycle", () => {
  it("completes an invoice by saving then clearing, without opening a receipt", async () => {
    const f = flow();
    const clear = vi.fn();
    await completePosInvoice(f.saveInvoice, clear);
    expect(f.saveInvoice).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(f.showReceipt).not.toHaveBeenCalled();
    expect(f.previewDraft).not.toHaveBeenCalled();
  });
  it("keeps the invoice when Complete cannot save", async () => {
    const clear = vi.fn();
    await completePosInvoice(async () => null, clear);
    expect(clear).not.toHaveBeenCalled();
    await expect(
      completePosInvoice(async () => {
        throw new Error("offline");
      }, clear),
    ).rejects.toThrow("offline");
    expect(clear).not.toHaveBeenCalled();
  });
  it("clears only when the POS after-print setting is enabled", () => {
    const clear = vi.fn();
    finishPosPrint(false, clear);
    expect(clear).not.toHaveBeenCalled();
    finishPosPrint(true, clear);
    expect(clear).toHaveBeenCalledOnce();
  });
  it("saves an unfinished preview without completing the sale", async () => {
    const f = flow();
    await preparePosReceipt(f);
    expect(f.saveDraft).toHaveBeenCalledOnce();
    expect(f.previewDraft).toHaveBeenCalledOnce();
    expect(f.saveInvoice).not.toHaveBeenCalled();
    expect(f.showReceipt).not.toHaveBeenCalled();
  });
  it("does not open a preview when draft saving fails", async () => {
    const f = flow();
    f.saveDraft.mockResolvedValue(false);
    await preparePosReceipt(f);
    expect(f.previewDraft).not.toHaveBeenCalled();
    expect(f.saveInvoice).not.toHaveBeenCalled();
  });
  it("saves the final invoice for direct print or Print from preview", async () => {
    const f = flow();
    f.printNow = true;
    await preparePosReceipt(f);
    expect(f.saveInvoice).toHaveBeenCalledOnce();
    expect(f.showReceipt).toHaveBeenCalledWith("INV-1");
    expect(f.saveDraft).not.toHaveBeenCalled();
  });
  it("does not print when final invoice saving fails", async () => {
    const f = flow();
    f.printNow = true;
    f.saveInvoice.mockResolvedValue(null);
    await preparePosReceipt(f);
    expect(f.showReceipt).not.toHaveBeenCalled();
  });
  it("reprints a saved receipt without creating a new invoice", async () => {
    const f = flow();
    f.hasItems = false;
    f.lastReceipt = "INV-1";
    f.printNow = true;
    await preparePosReceipt(f);
    expect(f.showReceipt).toHaveBeenCalledWith("INV-1");
    expect(f.saveInvoice).not.toHaveBeenCalled();
  });
  it("does not treat a cancelled browser print as printed", () => {
    const onPrinted = vi.fn();
    confirmBrowserPrint(onPrinted, () => false);
    expect(onPrinted).not.toHaveBeenCalled();
    confirmBrowserPrint(onPrinted, () => true);
    expect(onPrinted).toHaveBeenCalledOnce();
  });
});
