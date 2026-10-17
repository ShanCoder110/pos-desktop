import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { classifyListFetch } from "@/utils/listLoad";

describe("classifyListFetch", () => {
  it("treats AbortError as silent (abort-on-unmount)", () => {
    const aborted = new DOMException("signal is aborted", "AbortError");
    expect(classifyListFetch({ ok: false, error: aborted }, "Could not load")).toEqual({
      kind: "aborted",
    });
    const named = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(classifyListFetch({ ok: false, error: named }, "Could not load")).toEqual({
      kind: "aborted",
    });
  });

  it("shows an error with retryable message on network failure", () => {
    const network = new TypeError("Failed to fetch");
    expect(classifyListFetch({ ok: false, error: network }, "Could not load lots")).toEqual({
      kind: "error",
      message: "Failed to fetch",
    });
  });

  it("shows an error with retryable message on 500", () => {
    const boom = new ApiError({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      status: 500,
    });
    expect(classifyListFetch({ ok: false, error: boom }, "Could not load")).toEqual({
      kind: "error",
      message: "An unexpected error occurred.",
    });
  });

  it("shows empty only on a successful empty response", () => {
    expect(classifyListFetch({ ok: true, rows: [] }, "Could not load")).toEqual({
      kind: "empty",
    });
  });

  it("returns data for a successful non-empty response", () => {
    expect(classifyListFetch({ ok: true, rows: [{ id: "1" }] }, "Could not load")).toEqual({
      kind: "data",
      rows: [{ id: "1" }],
    });
  });
});
