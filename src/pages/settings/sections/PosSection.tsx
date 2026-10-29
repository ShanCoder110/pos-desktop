import { Toggle } from "@/components/common";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { useSettingsForm } from "@/shared/settings";

const KEYS = ["clearInvoiceAfterPrint"] as const;

export function PosSection() {
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);
  return (
    <SettingsSection
      title="POS"
      hint="Choose what stays on the counter after printing"
      dirty={dirty}
      onSave={save}
      onReset={reset}
    >
      <Toggle
        checked={draft.clearInvoiceAfterPrint}
        onChange={(value) => patch({ clearInvoiceAfterPrint: value })}
        label="Clear invoice after printing"
      />
      <p className="settings-note">
        On: start a new bill after a successful print. Off: save the invoice and keep it in POS.
        Opening or closing a preview never clears the invoice. Unfinished previews are saved in Held
        bills.
      </p>
    </SettingsSection>
  );
}
