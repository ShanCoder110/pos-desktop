import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, isTauri } = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri }));

import { printThermalPngBatch } from "./printers";

describe("thermal receipt printing", () => {
  beforeEach(() => {
    invoke.mockReset();
    isTauri.mockReturnValue(true);
  });

  it("sends receipt pages and copies in one desktop job", async () => {
    invoke.mockResolvedValue(undefined);

    const result = await printThermalPngBatch("Receipt Printer", [new Uint8Array([1])], "MM_80", 2);

    expect(result).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("print_thermal_receipt_batch", {
      printerName: "Receipt Printer",
      pngBase64Pages: ["AQ=="],
      paperWidth: "MM_80",
      copies: 2,
    });
  });

  it("uses the older receipt command only when the batch command is missing", async () => {
    invoke.mockRejectedValueOnce("Command print_thermal_receipt_batch not found");
    invoke.mockResolvedValue(undefined);

    const result = await printThermalPngBatch("Receipt Printer", [new Uint8Array([2])], "MM_80", 2);

    expect(result).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenNthCalledWith(2, "print_thermal_receipt", {
      printerName: "Receipt Printer",
      pngBase64: "Ag==",
      paperWidth: "MM_80",
    });
  });

  it("reports actual spooler errors without printing a second time", async () => {
    invoke.mockRejectedValueOnce("Printer offline");

    const result = await printThermalPngBatch("Receipt Printer", [new Uint8Array([3])], "MM_80", 1);

    expect(result).toEqual({ ok: false, reason: "failed", message: "Printer offline" });
    expect(invoke).toHaveBeenCalledOnce();
  });
});
