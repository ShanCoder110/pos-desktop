import { useEffect, useState } from "react";
import { Field, SelectInput, TextInput, Toggle, Button } from "@/components/common";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { SettingsSection } from "@/pages/settings/SettingsSection";
import { useSettings, useSettingsForm } from "@/shared/settings";
import { toaster } from "@/components/common/Toast";
import {
  cutThermalPaper,
  listSystemPrinters,
  printThermalTest,
  type SystemPrinter,
} from "@/services/printers";
import type { PaperWidth } from "@/shared/types";

const KEYS = [
  "printerName",
  "printerPaperWidth",
  "copies",
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
  const { settings } = useSettings();
  const [printers, setPrinters] = useState<SystemPrinter[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [testingCut, setTestingCut] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);

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
      onSave={() => save({ printerSetupDone: true })}
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
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            className="min-w-[220px] flex-1"
            value={draft.printerName}
            onChange={(e) => patch({ printerName: e.target.value })}
            placeholder="e.g. XP-Q200II"
          />
          <Button
            type="button"
            variant="outline"
            disabled={testingPrint || !draft.printerName.trim()}
            onClick={() => {
              void (async () => {
                setTestingPrint(true);
                try {
                  const printed = await printThermalTest(
                    draft.printerName,
                    draft.printerPaperWidth,
                    settings.receiptShopName || settings.shopName,
                  );
                  if (printed.ok) {
                    toaster.success("Test print sent.");
                    return;
                  }
                  if (printed.reason === "not-desktop") {
                    toaster.error("Test print only works in the desktop app, not the browser.");
                    return;
                  }
                  if (printed.reason === "no-printer") {
                    toaster.error("Enter the thermal printer OS name first.");
                    return;
                  }
                  toaster.error(
                    printed.message?.trim() || "Test print failed — check the printer name.",
                  );
                } finally {
                  setTestingPrint(false);
                }
              })();
            }}
          >
            {testingPrint ? "Printing…" : "Test print"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={testingCut || !draft.printerName.trim()}
            onClick={() => {
              void (async () => {
                setTestingCut(true);
                try {
                  const cut = await cutThermalPaper(draft.printerName);
                  if (cut.ok) {
                    toaster.success("Cut command sent — paper should feed and cut.");
                    return;
                  }
                  if (cut.reason === "not-desktop") {
                    toaster.error(
                      "Paper cut only works in the desktop app (npm run tauri dev), not the browser.",
                    );
                    return;
                  }
                  if (cut.reason === "no-printer") {
                    toaster.error("Enter the thermal printer OS name first.");
                    return;
                  }
                  toaster.error(
                    cut.message?.trim() || "Cut failed — check the printer name and connection.",
                  );
                } finally {
                  setTestingCut(false);
                }
              })();
            }}
          >
            {testingCut ? "Sending…" : "Test cut"}
          </Button>
        </div>
      </Field>
      <p className="settings-note">
        Print, auto-print, and Test print send ESC/POS straight to this printer — no preview window
        and no system print dialog. Each split page is its own slip and ends with a cut. Save the
        printer name in the desktop app, then use Test print.
      </p>
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
      <p className="settings-note">
        Complete Sale saves the bill without printing. Print / F9 sends the current bill, or the
        most recently completed bill when the cart is empty, to the saved printer.
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
