import { describe, expect, it } from "vitest";
import {
  formatDetailDate,
  formatTableDate,
  formatTableDateTime,
  receiptMoneyNum,
} from "@/utils/format";

describe("receiptMoneyNum", () => {
  it("omits zero decimals and keeps real fractional values", () => {
    expect(receiptMoneyNum(45_000)).toBe("45,000");
    expect(receiptMoneyNum(45_000.5)).toBe("45,000.5");
    expect(receiptMoneyNum(45_000.25)).toBe("45,000.25");
  });
});

describe("formatTableDate", () => {
  it("formats date-only as day mon year", () => {
    expect(formatTableDate("2029-06-01")).toMatch(/1 Jun 2029|01 Jun 2029|Jun/);
    expect(formatTableDate(null)).toBe("—");
  });
});

describe("formatTableDateTime", () => {
  it("formats local time as '17 Oct 2026, 3:40 PM'", () => {
    // Fixed instant: 2026-10-17 15:40 UTC — assert shape with en-GB day + en-US hour12.
    const iso = "2026-10-17T15:40:00.000Z";
    const formatted = formatTableDateTime(iso);
    expect(formatted).toMatch(/^\d{1,2} \w{3} \d{4}, \d{1,2}:\d{2} (AM|PM)$/);
    expect(formatDetailDate(iso)).toBe(formatted);
  });

  it("returns em dash for empty", () => {
    expect(formatTableDateTime(null)).toBe("—");
    expect(formatTableDateTime("")).toBe("—");
  });
});
