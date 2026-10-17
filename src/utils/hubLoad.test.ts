import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { hubSideQuery } from "@/utils/hubLoad";

describe("hubSideQuery", () => {
  it("returns the value when the side query succeeds", async () => {
    await expect(hubSideQuery(Promise.resolve([1, 2]), [])).resolves.toEqual([1, 2]);
  });

  it("returns fallback on 403 so cashiers skip forbidden side feeds quietly", async () => {
    await expect(
      hubSideQuery(
        Promise.reject(new ApiError({ code: "FORBIDDEN", message: "denied", status: 403 })),
        [],
      ),
    ).resolves.toEqual([]);
  });

  it("rethrows INTERNAL_ERROR so hub failures are not hidden", async () => {
    const boom = new ApiError({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      status: 500,
    });
    await expect(hubSideQuery(Promise.reject(boom), [])).rejects.toBe(boom);
  });

  it("rethrows AbortError so cancelled hub loads stay silent", async () => {
    const aborted = new DOMException("signal is aborted", "AbortError");
    await expect(hubSideQuery(Promise.reject(aborted), [])).rejects.toBe(aborted);
  });
});
