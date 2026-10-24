import { describe, expect, it } from "vitest";
import type { ProductLotRow, StockTransferRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { allocateRepairItems, lotsWithRestoredRepairTransfer } from "./repairShopMutations";

const product: Product = {
  id: "product-1",
  name: "Test lamp",
  sku: "P-1",
  category: "Other",
  unit: "Piece",
  isLinear: false,
  isManufactured: false,
  packQty: null,
  packPrice: 0,
  cost: 10,
  min: 12,
  wholesale: 14,
  retail: 16,
  warrantyQty: 0,
  warrantyUnit: "days",
  warrantyDays: 0,
  claims: 0,
  damaged: 0,
  stock: 5,
  components: [],
  sellUnits: [
    {
      id: "piece",
      name: "Piece",
      isBase: true,
      isDefault: true,
      contains: 1,
      cost: 10,
      min: 12,
      wholesale: 14,
      price: 16,
      barcode: "",
    },
  ],
};

const lot: ProductLotRow = {
  id: "lot-1",
  productId: product.id,
  supplierId: "supplier-1",
  lotNumber: "L-1",
  branchAllocations: [{ branchId: "main", quantity: 5 }],
  purchasePrice: 10,
  minimumPrice: 12,
  wholesalePrice: 14,
  retailPrice: 16,
  originalQuantity: 10,
  remainingQuantity: 7,
  damagedQuantity: 0,
  receivedAt: "2026-10-01",
  expiryDate: null,
  createdBy: "owner",
};

const transfer: StockTransferRow = {
  id: "transfer-1",
  transferNumber: "TR-1",
  fromBranchId: "main",
  toBranchId: "repair",
  status: "COMPLETED",
  notes: "",
  createdBy: "owner",
  createdAt: "2026-10-01",
  sentAt: "2026-10-01",
  completedAt: "2026-10-01",
  items: [
    {
      productId: product.id,
      productLotId: lot.id,
      quantity: 3,
      sentQuantity: 3,
      receivedQuantity: 3,
    },
  ],
};

function line(quantity: number) {
  return {
    productId: product.id,
    unitId: "piece",
    unitName: "Piece",
    quantity,
    baseQuantity: quantity,
    unitPrice: 16,
    unitCost: 10,
  };
}

describe("repair stock replacement planning", () => {
  it("restores the original lot stock virtually without mutating current state", () => {
    const restored = lotsWithRestoredRepairTransfer([lot], transfer);
    expect(restored[0].branchAllocations?.[0].quantity).toBe(8);
    expect(lot.branchAllocations?.[0].quantity).toBe(5);
    expect(allocateRepairItems([line(8)], [product], restored, "main").items).toEqual([
      { productId: product.id, productLotId: lot.id, quantity: 8 },
    ]);
  });

  it("does not allocate the same available stock twice across lines", () => {
    expect(() => allocateRepairItems([line(4), line(4)], [product], [lot], "main")).toThrow(
      "Not enough stock",
    );
  });
});
