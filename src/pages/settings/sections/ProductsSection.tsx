import { Field, SelectInput, TextInput, Toggle } from "@/components/common";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { stockPickLabel, useSettingsForm } from "@/shared/settings";
import type { StockPick } from "@/shared/types";

const KEYS = [
  "autoSku",
  "minPriceRule",
  "stockPick",
  "fifoEnabled",
  "skuPrefix",
  "lotPrefix",
] as const;

export function ProductsSection() {
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);

  return (
    <SettingsSection
      title="Products"
      hint="SKU, FIFO, and minimum price when adding items"
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
      <p className="settings-note">
        A tax rate table is not in this version. Line tax and discount on the invoice are enough for
        now.
      </p>
    </SettingsSection>
  );
}
