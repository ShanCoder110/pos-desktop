import { describe, expect, it } from "vitest";
import { hubSideQuery } from "@/utils/hubLoad";

describe("hubSideQuery", () => {
  it("returns the value when the side query succeeds", async () => {
    await expect(hubSideQuery(Promise.resolve([1, 2]), [])).resolves.toEqual([1, 2]);
  });

  it("returns fallback when a side query fails (products list must still show)", async () => {
    await expect(
      hubSideQuery(Promise.reject(new Error("An unexpected error occurred.")), []),
    ).resolves.toEqual([]);
  });

  it("rethrows AbortError so cancelled hub loads stay silent", async () => {
    const aborted = new DOMException("signal is aborted", "AbortError");
    await expect(hubSideQuery(Promise.reject(aborted), [])).rejects.toBe(aborted);
  });
});
