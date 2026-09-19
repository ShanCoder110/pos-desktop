import { Field, SelectInput, TextInput } from "@/components/common";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { useSettingsForm } from "@/shared/settings";
import type { AppLanguage } from "@/shared/types";

import { STAFF_PAYOUT_PROFIT, STAFF_PAYOUT_REVENUE } from "@/shared/constants/staff";

const KEYS = ["currencySymbol", "currencyCode", "language", "payoutDeductFrom"] as const;

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
          <TextInput
            maxLength={FIELD_LIMITS.currency}
            value={draft.currencySymbol}
            onChange={(e) => patch({ currencySymbol: e.target.value })}
          />
        </Field>
        <Field label="Currency code" hint="ISO code. Not shown on the slip unless needed">
          <TextInput
            maxLength={FIELD_LIMITS.code}
            value={draft.currencyCode}
            onChange={(e) => patch({ currencyCode: e.target.value })}
          />
        </Field>
      </div>
      <div className="settings-row">
        <Field label="Language">
          <SelectInput
            value={draft.language}
            onChange={(e) => patch({ language: e.target.value as AppLanguage })}
          >
            <option value="EN">English</option>
            <option value="UR">Urdu</option>
          </SelectInput>
        </Field>
        <Field
          label="Staff payouts deduct from"
          hint="Whether salary and commission reduce profit or gross revenue in reports"
        >
          <SelectInput
            value={draft.payoutDeductFrom}
            onChange={(e) =>
              patch({ payoutDeductFrom: e.target.value as typeof draft.payoutDeductFrom })
            }
          >
            <option value={STAFF_PAYOUT_PROFIT}>Profit</option>
            <option value={STAFF_PAYOUT_REVENUE}>Revenue</option>
          </SelectInput>
        </Field>
      </div>
    </SettingsSection>
  );
}
