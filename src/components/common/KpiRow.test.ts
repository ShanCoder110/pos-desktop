import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { KpiRow } from "./KpiRow";
import { KpiCard } from "./KpiCard";

describe("shared KPI row", () => {
  it("starts visible and preserves the page's card grid and content", () => {
    const html = renderToStaticMarkup(
      h(MemoryRouter, {
        children: h(KpiRow, {
          className: "grid grid-cols-4",
          children: h(KpiCard, { label: "Customers", value: 24 }),
        }),
      }),
    );
    expect(html).toContain('class="ui-kpi-reveal"');
    expect(html).toContain('aria-hidden="false"');
    expect(html).not.toContain('inert=""');
    expect(html).toContain("grid-cols-4");
    expect(html).toContain("Customers");
    expect(html).toContain("24");
  });
});
