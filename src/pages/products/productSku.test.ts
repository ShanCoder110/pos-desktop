import { describe, expect, it } from "vitest";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import {
  buildCreateProductPayload,
  buildUpdateProductPayload,
} from "@/pages/products/productPayload";
import type { Product } from "@/shared/types";

const SKU_PATTERN = /^[A-Za-z0-9._/-]+$/;

function validateSku(raw: string): string | null {
  const sku = raw.trim();
  if (!sku) return null;
  if (sku.length > FIELD_LIMITS.sku || !SKU_PATTERN.test(sku)) {
    return "invalid";
  }
  return null;
}

function sampleProduct(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Widget",
    sku: "",
    barcode: "",
    category: "Other",
    categoryId: "c1",
    unit: "pc",
    baseUnitId: "u1",
    minimumStock: 0,
    isLinear: false,
    isManufactured: false,
    packQty: null,
    packPrice: 0,
    cost: 10,
    min: 12,
    wholesale: 14,
    retail: 16,
    warrantyEnabled: false,
    warrantyQty: 0,
    warrantyUnit: "DAYS",
    warrantyDays: 0,
    warrantyNote: "",
    stock: 0,
    damaged: 0,
    sellUnits: [
      {
        id: "su1",
        name: "Piece",
        symbol: "pc",
        kind: "base",
        contains: 1,
        cost: 10,
        min: 12,
        wholesale: 14,
        price: 16,
        barcode: "",
        priceManual: {},
        isBase: true,
        isDefault: true,
      },
    ],
    components: [],
    ...over,
  } as Product;
}

describe("custom SKU rules", () => {
  it("accepts PMX-002 and rejects bad chars / overlength", () => {
    expect(validateSku("PMX-002")).toBeNull();
    expect(validateSku("pmx_002.x/1")).toBeNull();
    expect(validateSku("bad sku")).toBe("invalid");
    expect(validateSku("x".repeat(33))).toBe("invalid");
    expect(FIELD_LIMITS.sku).toBe(32);
  });

  it("create payload includes custom sku and omits blank", () => {
    const units = [{ id: "u1", symbol: "pc", name: "Piece" }];
    const withSku = buildCreateProductPayload(sampleProduct({ sku: "PMX-002" }), {
      categoryId: "c1",
      units,
      branchId: "b1",
    });
    expect(withSku?.sku).toBe("PMX-002");
    const blank = buildCreateProductPayload(sampleProduct({ sku: "  " }), {
      categoryId: "c1",
      units,
      branchId: "b1",
    });
    expect(blank?.sku).toBeUndefined();
  });

  it("update payload always sends sku so other fields do not drop it", () => {
    const units = [{ id: "u1", symbol: "pc", name: "Piece" }];
    const payload = buildUpdateProductPayload(sampleProduct({ sku: "PMX-002" }), {
      categoryId: "c1",
      units,
    });
    expect(payload?.sku).toBe("PMX-002");
  });
});

describe("product unit payload", () => {
  it("keeps Piece as inventory and Pack as the default sale unit", () => {
    const piece = sampleProduct().sellUnits![0];
    const product = sampleProduct({
      sellUnits: [
        { ...piece, isDefault: false },
        {
          ...piece,
          id: "su-pack",
          name: "Pack",
          symbol: "pk",
          kind: "bigger",
          contains: 24,
          factorDirection: "multiply",
          cost: 240,
          min: 288,
          wholesale: 336,
          price: 384,
          isBase: false,
          isDefault: true,
        },
      ],
    });
    const payload = buildUpdateProductPayload(product, {
      categoryId: "c1",
      units: [
        { id: "u1", symbol: "pc", name: "Piece" },
        { id: "u-pack", symbol: "pk", name: "Pack" },
      ],
    });
    const sellUnits = payload?.sellUnits as { isBase: boolean; isDefault: boolean }[];
    expect(sellUnits).toHaveLength(2);
    expect(sellUnits[0]).toMatchObject({ isBase: false, isDefault: true });
    expect(sellUnits[1]).toMatchObject({ isBase: true, isDefault: false });
  });
});
