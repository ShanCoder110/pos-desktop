import { Field, SelectInput, TextArea, TextInput, Toggle } from "@/components/common";
import { RECEIPT_FONT_OPTIONS } from "@/shared/constants/receiptBranding";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { ReceiptPreview } from "@/pages/settings/sections/ReceiptPreview";
import { useSettings, useSettingsForm } from "@/shared/settings";
import type { PaperWidth, ReceiptFontFamily } from "@/shared/types";

const KEYS = [
  "invoicePrefix",
  "paperWidth",
  "receiptFontFamily",
  "footer",
  "tagline",
  "contactLine",
  "promoUrdu",
  "showBalanceOnSlip",
  "showLogo",
  "showCashierName",
  "showItemDiscount",
  "itemsTableBordered",
  "receiptShopName",
] as const;

export function ReceiptSection() {
  const { settings } = useSettings();
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);
  const preview = {
    ...settings,
    ...draft,
    printSize: draft.paperWidth === "A4" ? ("a4" as const) : ("thermal" as const),
  };

  return (
    <SettingsSection
      title="Invoice Settings"
      hint="Slip layout, numbering, and live preview"
      dirty={dirty}
      onSave={save}
      onReset={reset}
    >
      <div className="receipt-settings-layout">
        <div className="receipt-settings-form">
          <div className="settings-row">
            <Field label="Invoice prefix" hint="Printed as INV-0001">
              <TextInput
                maxLength={FIELD_LIMITS.prefix}
                value={draft.invoicePrefix}
                onChange={(e) => patch({ invoicePrefix: e.target.value })}
              />
            </Field>
            <Field label="Paper width" hint="Slip design size. Till can override under Printer">
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
          <Field
            label="Invoice font"
            hint="Applies to slip preview and print (Urdu stays Nastaleeq)"
          >
            <SelectInput
              value={draft.receiptFontFamily}
              onChange={(e) => patch({ receiptFontFamily: e.target.value as ReceiptFontFamily })}
            >
              {RECEIPT_FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Shop name on slip">
            <TextInput
              value={draft.receiptShopName}
              onChange={(e) => patch({ receiptShopName: e.target.value })}
            />
          </Field>
          <Field label="Tagline">
            <TextInput value={draft.tagline} onChange={(e) => patch({ tagline: e.target.value })} />
          </Field>
          <Field label="Contact line" hint="Phone / WhatsApp printed on the slip">
            <TextInput
              value={draft.contactLine}
              onChange={(e) => patch({ contactLine: e.target.value })}
            />
          </Field>
          <Field label="Footer">
            <TextArea value={draft.footer} onChange={(e) => patch({ footer: e.target.value })} />
          </Field>
          <Field label="Promo (Urdu)" hint="Unicode. Can print even when the UI is English">
            <TextInput
              value={draft.promoUrdu}
              onChange={(e) => patch({ promoUrdu: e.target.value })}
            />
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
          <Toggle
            checked={draft.itemsTableBordered}
            onChange={(v) => patch({ itemsTableBordered: v })}
            label="Bordered items table"
          />
        </div>
        <ReceiptPreview settings={preview} />
      </div>
    </SettingsSection>
  );
}
