import { Field, SelectInput, TextInput, Toggle } from "@/components/common";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { useSettingsForm } from "@/shared/settings";
import type { PaperWidth } from "@/shared/types";

const KEYS = [
  "printerName",
  "printerPaperWidth",
  "copies",
  "autoPrint",
  "splitLongBill",
  "splitFirstPageItems",
  "splitMiddlePageItems",
  "splitLastPageItems",
] as const;

function pageCount(raw: string, fallback: number) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(40, n) : fallback;
}

export function PrinterSection() {
  const { draft, patch, dirty, save, reset } = useSettingsForm(KEYS);

  return (
    <SettingsSection
      title="Printer"
      hint="This till’s printer, split cuts, and products per page"
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
      {draft.splitLongBill ? (
        <p className="settings-inline-hint">
          Split long thermal bills into separate print pages. Configure the Windows printer driver
          to cut after each page; this option is ignored for A4.
        </p>
      ) : null}
      {draft.splitLongBill ? (
        <div className="settings-row">
          <Field label="First page items" hint="Products on the first cut (default 12)">
            <TextInput
              inputMode="numeric"
              maxLength={2}
              value={String(draft.splitFirstPageItems)}
              onChange={(e) =>
                patch({ splitFirstPageItems: pageCount(e.target.value, draft.splitFirstPageItems) })
              }
            />
          </Field>
          <Field label="Middle page items" hint="Continuation pages (default 15)">
            <TextInput
              inputMode="numeric"
              maxLength={2}
              value={String(draft.splitMiddlePageItems)}
              onChange={(e) =>
                patch({
                  splitMiddlePageItems: pageCount(e.target.value, draft.splitMiddlePageItems),
                })
              }
            />
          </Field>
          <Field label="Last page items" hint="Last cut with totals (default 12)">
            <TextInput
              inputMode="numeric"
              maxLength={2}
              value={String(draft.splitLastPageItems)}
              onChange={(e) =>
                patch({ splitLastPageItems: pageCount(e.target.value, draft.splitLastPageItems) })
              }
            />
          </Field>
        </div>
      ) : null}
    </SettingsSection>
  );
}
