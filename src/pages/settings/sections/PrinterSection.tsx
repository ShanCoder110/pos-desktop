import { useEffect, useState } from "react";
import { Field, SelectInput, TextInput, Toggle, Button } from "@/components/common";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { useSettingsForm } from "@/shared/settings";
import { listSystemPrinters, type SystemPrinter } from "@/services/printers";
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
  const [printers, setPrinters] = useState<SystemPrinter[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);

  async function refreshPrinters() {
    setLoadingPrinters(true);
    try {
      const rows = await listSystemPrinters();
      setPrinters(rows);
      if (!draft.printerName) {
        const preferred = rows.find((row) => row.isDefault) ?? rows[0];
        if (preferred) patch({ printerName: preferred.name });
      }
    } finally {
      setLoadingPrinters(false);
    }
  }

  useEffect(() => {
    void refreshPrinters();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const knownNames = new Set(printers.map((row) => row.name));
  const customName = draft.printerName && !knownNames.has(draft.printerName);

  return (
    <SettingsSection
      title="Printer"
      hint="Thermal till printer — Print / F9 goes straight to the system printer (no preview window)"
      dirty={dirty}
      onSave={save}
      onReset={reset}
    >
      <Field
        label="Thermal printer"
        hint="Pick the OS printer used for receipts. Set the same printer as the system default for one-step print."
      >
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput
            className="min-w-[220px] flex-1"
            value={customName ? "__custom__" : draft.printerName}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "__custom__") return;
              patch({ printerName: value });
            }}
          >
            <option value="">Select printer…</option>
            {printers.map((row) => (
              <option key={row.name} value={row.name}>
                {row.name}
                {row.isDefault ? " (system default)" : ""}
              </option>
            ))}
            {customName ? <option value="__custom__">{draft.printerName}</option> : null}
          </SelectInput>
          <Button
            type="button"
            variant="outline"
            disabled={loadingPrinters}
            onClick={() => void refreshPrinters()}
          >
            {loadingPrinters ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </Field>
      <Field label="Printer name" hint="Exact OS name if it is not in the list above">
        <TextInput
          value={draft.printerName}
          onChange={(e) => patch({ printerName: e.target.value })}
          placeholder="e.g. XP-80C"
        />
      </Field>
      <div className="settings-row">
        <Field label="Paper width" hint="58 mm / 80 mm thermal, or A4">
          <SelectInput
            value={draft.printerPaperWidth}
            onChange={(e) => patch({ printerPaperWidth: e.target.value as PaperWidth })}
          >
            <option value="MM_58">58 mm thermal</option>
            <option value="MM_80">80 mm thermal</option>
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
      <p className="settings-note">
        Print and auto-print send the slip directly (no preview). Use Preview on POS only when you
        want to check the bill first. Choose your thermal printer in the OS print dialog once, or
        set it as the system default.
      </p>
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
