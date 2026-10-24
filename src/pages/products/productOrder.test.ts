import { describe, expect, it } from "vitest";
import { compareNewestProducts } from "@/pages/products/productOrder";

describe("compareNewestProducts", () => {
  it("puts the latest assigned product ID first", () => {
    const rows = [{ productNo: 17 }, { productNo: 29 }, { productNo: 5 }];
    expect(rows.sort(compareNewestProducts).map((row) => row.productNo)).toEqual([29, 17, 5]);
  });

  it("uses creation time for products without an assigned ID", () => {
    const rows = [{ createdAt: "2026-10-23T12:00:00Z" }, { createdAt: "2026-10-24T12:00:00Z" }];
    expect(rows.sort(compareNewestProducts)[0].createdAt).toBe("2026-10-24T12:00:00Z");
  });

  it("prefers creation time over a higher imported ID", () => {
    const rows = [
      { productNo: 100, createdAt: "2026-10-23T12:00:00Z" },
      { productNo: 20, createdAt: "2026-10-24T12:00:00Z" },
    ];
    expect(rows.sort(compareNewestProducts)[0].productNo).toBe(20);
  });
});
