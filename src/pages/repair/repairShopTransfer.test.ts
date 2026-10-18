import { describe, expect, it } from "vitest";
import {
  decodeRepairTransfer,
  decodeRepairVoid,
  encodeRepairTransfer,
  encodeRepairVoid,
  isActiveRepairTransfer,
} from "./repairShopTransfer";

describe("repair shop transfer metadata", () => {
  it("round-trips editable unit, quantity, and price details", () => {
    const lines = [
      {
        productId: "product-1",
        unitId: "pack-12",
        unitName: "Pack",
        quantity: 2,
        baseQuantity: 24,
        unitPrice: 1500,
        unitCost: 1200,
      },
    ];

    expect(decodeRepairTransfer(encodeRepairTransfer(lines))).toEqual({ version: 1, lines });
  });

  it("ignores ordinary transfer notes and malformed metadata", () => {
    expect(decodeRepairTransfer("Send carefully")).toBeNull();
    expect(decodeRepairTransfer("DUKAN_REPAIR_SHOP:not-json")).toBeNull();
  });

  it("still reads metadata when free-text notes follow the JSON line", () => {
    const lines = [
      {
        productId: "product-1",
        unitId: "base",
        unitName: "pc",
        quantity: 1,
        baseQuantity: 1,
        unitPrice: 100,
        unitCost: 50,
      },
    ];
    const encoded = `${encodeRepairTransfer(lines)}\nHandle with care`;
    expect(decodeRepairTransfer(encoded)).toEqual({ version: 1, lines });
  });

  it("hides voided repair adds and void marker transfers", () => {
    const lines = [
      {
        productId: "product-1",
        unitId: "base",
        unitName: "pc",
        quantity: 1,
        baseQuantity: 1,
        unitPrice: 100,
        unitCost: 50,
      },
    ];
    const addNotes = encodeRepairTransfer(lines);
    const voidNotes = encodeRepairVoid("tr-1");
    expect(decodeRepairVoid(voidNotes)).toBe("tr-1");
    expect(isActiveRepairTransfer({ id: "tr-1", notes: addNotes }, [addNotes, voidNotes])).toBe(
      false,
    );
    expect(isActiveRepairTransfer({ id: "tr-void", notes: voidNotes }, [addNotes, voidNotes])).toBe(
      false,
    );
    expect(isActiveRepairTransfer({ id: "tr-2", notes: addNotes }, [addNotes])).toBe(true);
  });
});
