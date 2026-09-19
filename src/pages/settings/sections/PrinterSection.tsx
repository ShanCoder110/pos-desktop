import { Field, SelectInput, TextInput, Toggle } from "@/components/common";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { useSettingsForm } from "@/shared/settings";
import type { PaperWidth } from "@/shared/types";

const KEYS = ["printerName", "printerPaperWidth", "copies", "autoPrint", "splitLongBill"] as const;

export function PrinterSection() {
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);

  return (
    <SettingsSection
      title="Printer"
      hint="This till’s printer. Slip layout stays under Invoice Settings"
      dirty={dirty}
      onSave={save}
      onReset={reset}
    >
      <Field label="Printer name" hint="OS printer name. Does not sync to cloud">
        <TextInput
          value={draft.printerName}
          onChange={(e) => patch({ printerName: e.target.value })}
        />
      </Field>
      <div className="settings-row">
        <Field label="Paper width" hint="Override the slip paper size on this machine only">
          <SelectInput
            value={draft.printerPaperWidth}
            onChange={(e) => patch({ printerPaperWidth: e.target.value as PaperWidth })}
          >
            <option value="MM_58">58 mm</option>
            <option value="MM_80">80 mm</option>
            <option value="A4">A4</option>
          </SelectInput>
        </Field>
        <Field label="Copies">
          <TextInput
            inputMode="numeric"
            maxLength={FIELD_LIMITS.copies}
            value={String(draft.copies)}
            onChange={(e) => patch({ copies: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
      </div>
      <Toggle
        checked={draft.autoPrint}
        onChange={(v) => patch({ autoPrint: v })}
        label="Auto-print after sale"
      />
      <Toggle
        checked={draft.splitLongBill}
        onChange={(v) => patch({ splitLongBill: v })}
        label="Split long bills"
      />
    </SettingsSection>
  );
}
