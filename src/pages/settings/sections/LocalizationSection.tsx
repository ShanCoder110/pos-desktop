import { Field, SelectInput, TextInput } from "@/components/common";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { useSettingsForm } from "@/shared/settings";
import type { AppLanguage } from "@/shared/types";

const KEYS = ["currencySymbol", "currencyCode", "language"] as const;

export function LocalizationSection() {
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);

  return (
    <SettingsSection
      title="Localization"
      hint="Money display and application language"
      dirty={dirty}
      onSave={save}
      onReset={reset}
    >
      <div className="settings-row">
        <Field label="Currency symbol" hint="Printed as Rs 62.00">
          <TextInput value={draft.currencySymbol} onChange={(e) => patch({ currencySymbol: e.target.value })} />
        </Field>
        <Field label="Currency code" hint="ISO code. Not shown on the slip unless needed">
          <TextInput value={draft.currencyCode} onChange={(e) => patch({ currencyCode: e.target.value })} />
        </Field>
      </div>
      <div className="settings-row settings-row-single">
        <Field label="Language">
          <SelectInput
            value={draft.language}
            onChange={(e) => patch({ language: e.target.value as AppLanguage })}
          >
            <option value="EN">English</option>
            <option value="UR">Urdu</option>
          </SelectInput>
        </Field>
      </div>
    </SettingsSection>
  );
}
