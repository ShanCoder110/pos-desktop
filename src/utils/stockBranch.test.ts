import { describe, expect, it } from "vitest";
import { resolveStockBranchId } from "@/utils/stockBranch";

describe("resolveStockBranchId", () => {
  const branches = [
    { id: "a", isMain: false },
    { id: "main", isMain: true },
    { id: "b", isMain: false },
  ];

  it("prefers session (current) branch over main", () => {
    expect(resolveStockBranchId(branches, "a")).toBe("a");
  });

  it("keeps preferred id when present", () => {
    expect(resolveStockBranchId(branches, "a", "b")).toBe("b");
  });

  it("falls back to main then first when session missing", () => {
    expect(resolveStockBranchId(branches)).toBe("main");
    expect(resolveStockBranchId([{ id: "x" }, { id: "y" }], "y")).toBe("y");
    expect(resolveStockBranchId([{ id: "x" }, { id: "y" }])).toBe("x");
  });
});
