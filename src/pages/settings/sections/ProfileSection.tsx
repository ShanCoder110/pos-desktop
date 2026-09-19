import { Field, PhoneField, TextInput } from "@/components/common";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { useSettingsForm } from "@/shared/settings";

const KEYS = ["shopName", "receiptShopName", "phone", "email", "address", "legalName"] as const;

export function ProfileSection() {
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);

  return (
    <SettingsSection
      title="Shop Profile"
      hint="Appears on invoices and reports"
      dirty={dirty}
      onSave={save}
      onReset={reset}
    >
      <Field
        label="POS name"
        hint="Main brand name for the app sidebar and browser tab. Leave empty to use shop name below."
      >
        <TextInput value={draft.shopName} onChange={(e) => patch({ shopName: e.target.value })} />
      </Field>
      <div className="settings-row">
        <Field
          label="Shop name"
          hint="Printed at the top of the slip. Can differ from the POS name."
        >
          <TextInput
            value={draft.receiptShopName}
            onChange={(e) => patch({ receiptShopName: e.target.value })}
          />
        </Field>
        <PhoneField value={draft.phone} onChange={(phone) => patch({ phone })} />
      </div>
      <Field label="Email">
        <TextInput
          type="email"
          value={draft.email}
          onChange={(e) => patch({ email: e.target.value })}
        />
      </Field>
      <Field label="Address">
        <TextInput
          maxLength={FIELD_LIMITS.address}
          value={draft.address}
          onChange={(e) => patch({ address: e.target.value })}
        />
      </Field>
      <Field label="Legal name" hint="Optional extra line for invoices and reports">
        <TextInput
          value={draft.legalName}
          placeholder="More business details"
          onChange={(e) => patch({ legalName: e.target.value })}
        />
      </Field>
    </SettingsSection>
  );
}
