import { useState, type ChangeEvent, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, ImagePlus, Trash2 } from "lucide-react";
import { Field, SelectInput, TextArea, TextInput, Toggle } from "@/components/common";
import { RECEIPT_FONT_OPTIONS } from "@/shared/constants/receiptBranding";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { ReceiptPreview } from "@/pages/settings/sections/ReceiptPreview";
import { useSettings, useSettingsForm } from "@/shared/settings";
import type {
  PaperWidth,
  ReceiptFontFamily,
  ReceiptHeaderLayout,
  ReceiptTextAlign,
  ReceiptTextSize,
} from "@/shared/types";

const KEYS = [
  "invoicePrefix",
  "paperWidth",
  "receiptFontFamily",
  "receiptLanguage",
  "footer",
  "tagline",
  "contactLine",
  "promoUrdu",
  "showBalanceOnSlip",
  "showLogo",
  "receiptLogoDataUrl",
  "receiptLogoScale",
  "receiptHeaderLayout",
  "receiptTextSize",
  "receiptPaymentStatusSize",
  "receiptShopNameSize",
  "receiptShopNameBold",
  "receiptTaglineAlign",
  "receiptContactAlign",
  "receiptFooterSize",
  "receiptFooterBold",
  "receiptPromoAlign",
  "receiptPromoSize",
  "receiptPromoBold",
  "showCashierName",
  "showItemDiscount",
  "itemsTableBordered",
  "receiptShopName",
] as const;

function SizeChoice({
  value,
  onChange,
}: {
  value: ReceiptTextSize;
  onChange: (value: ReceiptTextSize) => void;
}) {
  return (
    <div className="receipt-option-group" role="group" aria-label="Text size">
      {(["small", "medium", "large"] as const).map((size) => (
        <button
          key={size}
          type="button"
          className={value === size ? "is-active" : ""}
          onClick={() => onChange(size)}
        >
          {size[0].toUpperCase() + size.slice(1)}
        </button>
      ))}
    </div>
  );
}

function WeightChoice({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="receipt-option-group" role="group" aria-label="Font weight">
      <button type="button" className={!value ? "is-active" : ""} onClick={() => onChange(false)}>
        Normal
      </button>
      <button type="button" className={value ? "is-active" : ""} onClick={() => onChange(true)}>
        Bold
      </button>
    </div>
  );
}

function AlignChoice({
  value,
  onChange,
}: {
  value: ReceiptTextAlign;
  onChange: (value: ReceiptTextAlign) => void;
}) {
  const options = [
    { value: "left" as const, label: "Left", icon: AlignLeft },
    { value: "center" as const, label: "Center", icon: AlignCenter },
    { value: "right" as const, label: "Right", icon: AlignRight },
  ];
  return (
    <div className="receipt-option-group" role="group" aria-label="Text alignment">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "is-active" : ""}
            onClick={() => onChange(option.value)}
          >
            <Icon size={15} aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="receipt-control-row">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function ReceiptSection() {
  const [logoError, setLogoError] = useState("");
  const { settings } = useSettings();
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);
  const preview = {
    ...settings,
    ...draft,
    printSize: draft.paperWidth === "A4" ? ("a4" as const) : ("thermal" as const),
  };

  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Choose a PNG, JPG, WebP, or SVG image.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setLogoError("Logo must be 1 MB or smaller so it can be stored safely on this PC.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      patch({ receiptLogoDataUrl: reader.result, showLogo: true });
      setLogoError("");
    };
    reader.onerror = () => setLogoError("The logo could not be read. Please choose another file.");
    reader.readAsDataURL(file);
  }

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
          <div className="receipt-logo-card">
            <div className="receipt-logo-preview" aria-label="Invoice logo preview">
              {draft.receiptLogoDataUrl ? (
                <img src={draft.receiptLogoDataUrl} alt="Invoice logo" />
              ) : (
                <ImagePlus aria-hidden="true" />
              )}
            </div>
            <div className="receipt-logo-copy">
              <strong>Invoice logo</strong>
              <p>Saved locally on this PC. PNG, JPG, WebP, or SVG up to 1 MB.</p>
              {logoError ? <p className="receipt-logo-error">{logoError}</p> : null}
              <div className="receipt-logo-actions">
                <label className="receipt-logo-upload">
                  <ImagePlus size={16} aria-hidden="true" />
                  {draft.receiptLogoDataUrl ? "Replace logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoUpload}
                  />
                </label>
                {draft.receiptLogoDataUrl ? (
                  <button
                    type="button"
                    className="receipt-logo-remove"
                    onClick={() => {
                      patch({ receiptLogoDataUrl: "" });
                      setLogoError("");
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="receipt-customization-card">
            <div className="receipt-range-head">
              <label htmlFor="receipt-logo-scale">Logo size</label>
              <strong>{draft.receiptLogoScale}%</strong>
            </div>
            <input
              id="receipt-logo-scale"
              className="receipt-range"
              type="range"
              min="50"
              max="200"
              step="1"
              value={draft.receiptLogoScale}
              onChange={(event) => patch({ receiptLogoScale: Number(event.target.value) })}
            />
            <div className="receipt-range-labels" aria-hidden="true">
              <span>50%</span>
              <span>200%</span>
            </div>
            <div className="receipt-control-stack">
              <span className="receipt-control-label">Header layout</span>
              <div className="receipt-layout-options" role="group" aria-label="Header layout">
                {(
                  [
                    { value: "text", title: "Text only", hint: "Shop name without logo" },
                    { value: "logo", title: "Logo only", hint: "Image without shop name" },
                    {
                      value: "logo_text",
                      title: "Logo + text",
                      hint: "Logo above the shop name",
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={draft.receiptHeaderLayout === option.value ? "is-active" : ""}
                    onClick={() =>
                      patch({ receiptHeaderLayout: option.value as ReceiptHeaderLayout })
                    }
                  >
                    <strong>{option.title}</strong>
                    <span>{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="receipt-settings-card">
            <div>
              <strong>Invoice language</strong>
              <p>Print all invoice labels and product names in English or Urdu.</p>
            </div>
            <div className="receipt-language-options" role="group" aria-label="Invoice language">
              <button
                type="button"
                className={draft.receiptLanguage === "EN" ? "is-active" : ""}
                onClick={() => patch({ receiptLanguage: "EN" })}
              >
                English
              </button>
              <button
                type="button"
                dir="rtl"
                className={
                  draft.receiptLanguage === "UR"
                    ? "is-active receipt-text-urdu"
                    : "receipt-text-urdu"
                }
                onClick={() => patch({ receiptLanguage: "UR" })}
              >
                اردو
              </button>
            </div>
          </div>
          <Field label="Shop name on slip">
            <TextInput
              value={draft.receiptShopName}
              onChange={(e) => patch({ receiptShopName: e.target.value })}
            />
          </Field>
          <div className="receipt-customization-card">
            <ControlRow label="Receipt text size">
              <SizeChoice
                value={draft.receiptTextSize}
                onChange={(receiptTextSize) => patch({ receiptTextSize })}
              />
            </ControlRow>
            <ControlRow label="Payment status size">
              <SizeChoice
                value={draft.receiptPaymentStatusSize}
                onChange={(receiptPaymentStatusSize) => patch({ receiptPaymentStatusSize })}
              />
            </ControlRow>
            <ControlRow label="Items table style">
              <div className="receipt-option-group" role="group" aria-label="Items table style">
                <button
                  type="button"
                  className={!draft.itemsTableBordered ? "is-active" : ""}
                  onClick={() => patch({ itemsTableBordered: false })}
                >
                  No borders
                </button>
                <button
                  type="button"
                  className={draft.itemsTableBordered ? "is-active" : ""}
                  onClick={() => patch({ itemsTableBordered: true })}
                >
                  With borders
                </button>
              </div>
            </ControlRow>
            <ControlRow label="Shop name style">
              <SizeChoice
                value={draft.receiptShopNameSize}
                onChange={(receiptShopNameSize) => patch({ receiptShopNameSize })}
              />
              <WeightChoice
                value={draft.receiptShopNameBold}
                onChange={(receiptShopNameBold) => patch({ receiptShopNameBold })}
              />
            </ControlRow>
          </div>
          <Field label="Tagline">
            <AlignChoice
              value={draft.receiptTaglineAlign}
              onChange={(receiptTaglineAlign) => patch({ receiptTaglineAlign })}
            />
            <TextArea value={draft.tagline} onChange={(e) => patch({ tagline: e.target.value })} />
          </Field>
          <Field label="Proprietor / contact" hint="Phone / WhatsApp printed on the slip">
            <AlignChoice
              value={draft.receiptContactAlign}
              onChange={(receiptContactAlign) => patch({ receiptContactAlign })}
            />
            <TextArea
              value={draft.contactLine}
              onChange={(e) => patch({ contactLine: e.target.value })}
            />
          </Field>
          <Field label="Footer note">
            <TextInput value={draft.footer} onChange={(e) => patch({ footer: e.target.value })} />
            <ControlRow label="Style">
              <SizeChoice
                value={draft.receiptFooterSize}
                onChange={(receiptFooterSize) => patch({ receiptFooterSize })}
              />
              <WeightChoice
                value={draft.receiptFooterBold}
                onChange={(receiptFooterBold) => patch({ receiptFooterBold })}
              />
            </ControlRow>
          </Field>
          <Field
            label="Footer promo"
            hint="Promotional message printed at the bottom. Works with Urdu, English, or any language."
          >
            <AlignChoice
              value={draft.receiptPromoAlign}
              onChange={(receiptPromoAlign) => patch({ receiptPromoAlign })}
            />
            <TextArea
              dir="auto"
              value={draft.promoUrdu}
              onChange={(e) => patch({ promoUrdu: e.target.value })}
            />
            <ControlRow label="Style">
              <SizeChoice
                value={draft.receiptPromoSize}
                onChange={(receiptPromoSize) => patch({ receiptPromoSize })}
              />
              <WeightChoice
                value={draft.receiptPromoBold}
                onChange={(receiptPromoBold) => patch({ receiptPromoBold })}
              />
            </ControlRow>
          </Field>
          <div className="receipt-toggle-grid">
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
              label="Show customer balance"
            />
            <Toggle
              checked={draft.showItemDiscount}
              onChange={(v) => patch({ showItemDiscount: v })}
              label="Show discount"
            />
          </div>
        </div>
        <ReceiptPreview settings={preview} />
      </div>
    </SettingsSection>
  );
}
