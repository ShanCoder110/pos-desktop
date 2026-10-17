import { describe, expect, it } from "vitest";
import { formatDetailDate, formatTableDateTime } from "@/utils/format";

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
