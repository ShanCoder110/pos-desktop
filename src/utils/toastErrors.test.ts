import { describe, expect, it } from "vitest";
import { errorToastMessage } from "@/utils/toastErrors";

describe("errorToastMessage", () => {
  it("does not toast AbortError (signal is aborted)", () => {
    const aborted = new DOMException("signal is aborted", "AbortError");
    expect(errorToastMessage(aborted, "Could not load")).toBeNull();

    const named = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    expect(errorToastMessage(named, "Could not save")).toBeNull();
  });

  it("keeps real error messages", () => {
    expect(errorToastMessage(new Error("Payment incomplete"), "fallback")).toBe(
      "Payment incomplete",
    );
    expect(errorToastMessage("nope", "Could not complete sale")).toBe("Could not complete sale");
  });
});
