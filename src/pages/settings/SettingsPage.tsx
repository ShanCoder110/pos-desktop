import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Chrome";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/Field";
import { stockPickLabel, useSettings } from "@/shared/settings";
import type { PrintSize, StockPick } from "@/shared/types";

export function SettingsPage() {
  const { settings, setSettings } = useSettings();
  const patch = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) =>
    setSettings({ ...settings, [key]: value });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" hint="Short labels. No FIFO jargon on the screen." />

      <Section title="Shop">
        <Field label="Name on receipts">
          <Input value={settings.shopName} onChange={(e) => patch("shopName", e.target.value)} />
        </Field>
      </Section>

      <Section title="Receipt">
        <Field label="Footer">
          <Textarea value={settings.footer} onChange={(e) => patch("footer", e.target.value)} />
        </Field>
        <Toggle
          checked={settings.showBalanceOnSlip}
          onChange={(v) => patch("showBalanceOnSlip", v)}
          label="Show customer khata on the slip"
        />
        <Field label="Paper">
          <Select value={settings.printSize} onChange={(e) => patch("printSize", e.target.value as PrintSize)}>
            <option value="thermal">Thermal</option>
            <option value="a4">A4</option>
          </Select>
        </Field>
        <Toggle checked={settings.autoPrint} onChange={(v) => patch("autoPrint", v)} label="Print right after a sale" />
      </Section>

      <Section title="Prices">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default tax %">
            <Input
              value={String(settings.defaultTax)}
              onChange={(e) => patch("defaultTax", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Default discount %">
            <Input
              value={String(settings.defaultDiscount)}
              onChange={(e) => patch("defaultDiscount", Number(e.target.value) || 0)}
            />
          </Field>
        </div>
        <Toggle
          checked={settings.minPriceRule}
          onChange={(v) => patch("minPriceRule", v)}
          label="Do not sell below minimum (POS, credit, repair)"
        />
      </Section>

      <Section title="Which stock to sell">
        <Field label="When a product has more than one supplier">
          <Select value={settings.stockPick} onChange={(e) => patch("stockPick", e.target.value as StockPick)}>
            <option value="oldest">{stockPickLabel.oldest}</option>
            <option value="newest">{stockPickLabel.newest}</option>
            <option value="ask">{stockPickLabel.ask}</option>
          </Select>
        </Field>
        <p className="text-[12px] text-slate-500">
          Oldest = first received lot. Newest = last received lot. Ask = cashier picks the supplier on every sale.
        </p>
      </Section>

      <Section title="This computer">
        <Toggle
          checked={settings.isMainServer}
          onChange={(v) => patch("isMainServer", v)}
          label="This PC is the main server"
        />
        <p className="text-[12px] text-slate-500">Other tills connect over Wi‑Fi. They do not start a new shop.</p>
        <div className="flex gap-2">
          <Button disabled={!settings.isMainServer}>Export database</Button>
          <Button disabled={!settings.isMainServer}>Import database</Button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-3 rounded-md border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}
