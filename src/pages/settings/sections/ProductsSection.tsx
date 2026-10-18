import { useRef, useState } from "react";
import { Field, SelectInput, TextInput, Toggle, Button } from "@/components/common";
import { toaster } from "@/components/common/Toast";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { stockPickLabel, useSettingsForm } from "@/shared/settings";
import type { StockPick } from "@/shared/types";
import { importProductsCatalog } from "@/services/products";
import { shortError } from "@/utils/format";

const KEYS = [
  "autoSku",
  "minPriceRule",
  "stockPick",
  "creditPriceMode",
  "fifoEnabled",
  "skuPrefix",
  "lotPrefix",
] as const;

export function ProductsSection() {
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function onPickFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const catalog = JSON.parse(text) as { categories?: unknown[]; products?: unknown[] };
      if (!catalog || !Array.isArray(catalog.categories) || !Array.isArray(catalog.products)) {
        toaster.error(
          "JSON must include categories and products arrays (use imports/products-catalog.json).",
        );
        return;
      }
      const result = await importProductsCatalog(catalog);
      const errHint =
        result.errors.length > 0
          ? ` · ${result.errors.length} error${result.errors.length === 1 ? "" : "s"} (see console)`
          : "";
      if (result.errors.length) {
        console.warn("Product import errors", result.errors.slice(0, 40));
      }
      toaster.success(
        `Imported ${result.created} products · ${result.categoriesCreated} categories · ${result.skipped} skipped${errHint}`,
      );
    } catch (error) {
      toaster.error(shortError(error, "Could not import products"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <SettingsSection
      title="Products"
      hint="SKU, FIFO, minimum price, and catalog JSON import"
      dirty={dirty}
      onSave={save}
      onReset={reset}
    >
      <Toggle
        checked={draft.autoSku}
        onChange={(v) => patch({ autoSku: v })}
        label="Assign SKU on save"
      />
      <p className="settings-note">SKU stays optional unless this is on.</p>
      <div className="settings-row">
        <Field label="SKU prefix">
          <TextInput
            maxLength={FIELD_LIMITS.prefix}
            value={draft.skuPrefix}
            onChange={(e) => patch({ skuPrefix: e.target.value })}
          />
        </Field>
        <Field label="Lot prefix">
          <TextInput
            maxLength={FIELD_LIMITS.prefix}
            value={draft.lotPrefix}
            onChange={(e) => patch({ lotPrefix: e.target.value })}
          />
        </Field>
      </div>
      <Toggle
        checked={draft.fifoEnabled}
        onChange={(v) => patch({ fifoEnabled: v })}
        label="FIFO enabled"
      />
      <p className="settings-note">
        Sales consume oldest lots first when this is on. Negative stock is set per branch on
        Branches.
      </p>
      <Toggle
        checked={draft.minPriceRule}
        onChange={(v) => patch({ minPriceRule: v })}
        label="Block selling below minimum"
      />
      <Field
        label="Which lot to sell"
        hint="Ask is only used when a product has more than one supplier lot"
      >
        <SelectInput
          value={draft.stockPick}
          onChange={(e) => patch({ stockPick: e.target.value as StockPick })}
        >
          {(Object.keys(stockPickLabel) as StockPick[]).map((id) => (
            <option key={id} value={id}>
              {stockPickLabel[id]}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Default credit-sale price" hint="The rate can still be changed on each sale">
        <SelectInput
          value={draft.creditPriceMode}
          onChange={(event) =>
            patch({ creditPriceMode: event.target.value as "WHOLESALE" | "RETAIL" })
          }
        >
          <option value="WHOLESALE">Wholesale</option>
          <option value="RETAIL">Retail</option>
        </SelectInput>
      </Field>

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="text-[13px] font-extrabold text-ink">Import catalog JSON</h3>
        <p className="settings-note mt-1">
          Upload <code>imports/products-catalog.json</code>. Same file has <code>categories</code>{" "}
          first (<code>name</code> + <code>nameUrdu</code>), then <code>products</code> with{" "}
          <code>productId</code> (1, 2, 3…) and <code>category</code> matching those names. Import
          creates categories first, then products (attaches by category name). Maps unit symbols (
          <code>pc</code>, <code>gaz</code>, <code>roll</code>…). Existing product IDs are skipped.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => void onPickFile(event.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
        >
          {importing ? "Importing…" : "Choose JSON file"}
        </Button>
      </div>
    </SettingsSection>
  );
}
