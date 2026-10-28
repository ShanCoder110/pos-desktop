import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import { Field, TextInput, MoneyInput } from "./index";
import { SearchableSelect } from "../SearchableSelect";
import { ProductSearch } from "../ProductSearch";
import { Tabs } from "../Tabs";

describe("accessible form controls", () => {
  it("connects field labels and validation messages to native inputs", () => {
    const html = renderToStaticMarkup(
      h(Field, { label: "Name", error: "Enter a name", required: true, children: h(TextInput) }),
    );
    const labelId = html.match(/id="([^"]+-label)"/)?.[1];
    const descriptionId = html.match(/id="([^"]+-description)"/)?.[1];
    expect(html).toContain(`aria-labelledby="${labelId}"`);
    expect(html).toContain(`aria-describedby="${descriptionId}"`);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-required="true"');
  });
  it("gives controls within the same Field unique IDs", () => {
    const html = renderToStaticMarkup(
      h(Field, {
        label: "Opening stock",
        children: [
          h(TextInput, { key: "qty" }),
          h(SearchableSelect, { key: "unit", options: [], value: "", onChange: () => {} }),
        ],
      }),
    );
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect((html.match(/aria-labelledby=/g) ?? []).length).toBe(2);
  });
  it("preserves explicit per-unit price names", () => {
    const html = renderToStaticMarkup(
      h(Field, { label: "Cost", children: h(MoneyInput, { "aria-label": "Pack cost" }) }),
    );
    expect(html).toContain('aria-label="Pack cost"');
    expect(html).not.toContain("aria-labelledby");
  });
  it("labels custom ProductSearch inputs", () => {
    const html = renderToStaticMarkup(
      h(Field, {
        label: "Product",
        children: h(ProductSearch, { products: [], value: "", onChange: () => {} }),
      }),
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain("aria-labelledby=");
  });
  it("keeps the selected tab reachable and associated with its panel", () => {
    const html = renderToStaticMarkup(
      h(Tabs, {
        idPrefix: "lot",
        panelId: "lot-panel",
        items: [
          { id: "receive", label: "Receive" },
          { id: "expiry", label: "Expiry" },
        ],
        value: "receive",
        onChange: () => {},
      }),
    );
    expect(html).toContain('id="lot-tab-receive"');
    expect(html).toContain('aria-controls="lot-panel"');
    expect(html).toContain('aria-selected="true" tabindex="0"');
    expect(html).toContain('aria-selected="false" tabindex="-1"');
  });
});
