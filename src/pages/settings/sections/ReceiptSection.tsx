import { Field, SelectInput, TextArea, TextInput, Toggle } from "@/components/common";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { useSettingsForm } from "@/shared/settings";
import type { PaperWidth } from "@/shared/types";

const KEYS = [
  "invoicePrefix",
  "paperWidth",
  "footer",
  "tagline",
  "contactLine",
  "promoUrdu",
  "showBalanceOnSlip",
  "showLogo",
  "showCashierName",
  "showItemDiscount",
] as const;

export function ReceiptSection() {
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);

  return (
    <SettingsSection
      title="Invoice Settings"
      hint="Slip layout and invoice numbering"
      dirty={dirty}
      onSave={save}
      onReset={reset}
    >
      <div className="settings-row">
        <Field label="Invoice prefix" hint="Printed as INV-0001">
          <TextInput value={draft.invoicePrefix} onChange={(e) => patch({ invoicePrefix: e.target.value })} />
        </Field>
        <Field label="Paper width" hint="Slip design size. This till can override it under Printer">
          <SelectInput
            value={draft.paperWidth}
            onChange={(e) => patch({ paperWidth: e.target.value as PaperWidth })}
          >
            <option value="MM_58">58 mm</option>
            <option value="MM_80">80 mm</option>
            <option value="A4">A4</option>
          </SelectInput>
        </Field>
      </div>
      <Field label="Tagline">
        <TextInput value={draft.tagline} onChange={(e) => patch({ tagline: e.target.value })} />
      </Field>
      <Field label="Contact line" hint="Phone / WhatsApp printed on the slip">
        <TextInput value={draft.contactLine} onChange={(e) => patch({ contactLine: e.target.value })} />
      </Field>
      <Field label="Footer">
        <TextArea value={draft.footer} onChange={(e) => patch({ footer: e.target.value })} />
      </Field>
      <Field label="Promo (Urdu)" hint="Unicode. Can print even when the UI is English">
        <TextInput value={draft.promoUrdu} onChange={(e) => patch({ promoUrdu: e.target.value })} />
      </Field>
      <Toggle
        checked={draft.showLogo}
        onChange={(v) => patch({ showLogo: v })}
        label="Show logo"
      />
      <Toggle
        checked={draft.showCashierName}
        onChange={(v) => patch({ showCashierName: v })}
        label="Show cashier name"
      />
      <Toggle
        checked={draft.showBalanceOnSlip}
        onChange={(v) => patch({ showBalanceOnSlip: v })}
        label="Show customer balance on slip"
      />
      <Toggle
        checked={draft.showItemDiscount}
        onChange={(v) => patch({ showItemDiscount: v })}
        label="Show item discount"
      />
    </SettingsSection>
  );
}
