import { useState } from "react";
import { Badge, Button, Field, PageHead, SelectInput, Table, TabSheet, Tabs, Td, TextArea, TextInput, THead, Th, Toggle } from "@/components/common";
import { devices, syncLogs, branchName } from "@/shared/domain/mock";
import { useSettings } from "@/shared/settings";

export function SettingsPage() {
  const { settings, setSettings } = useSettings();
  const [tab, setTab] = useState("business");
  const [name, setName] = useState("Madina Electric");
  const [phone, setPhone] = useState("042 1110001");
  const [address, setAddress] = useState("Hall Road, Lahore");
  const [lot, setLot] = useState(false);
  const [neg, setNeg] = useState(false);
  const [prefix, setPrefix] = useState("INV-");
  const [footer, setFooter] = useState("Thank you. Goods once sold are not returned without receipt.");
  const [showBal, setShowBal] = useState(true);
  const [autoPrint, setAutoPrint] = useState(true);
  const [paper, setPaper] = useState("thermal");

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Settings">
        <Button variant="primary">Save</Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">AppSetting is shop-wide. InvoiceSetting is the slip. PrinterSetting and Device are per computer. SyncLog is the last pull/push.</p>
      <TabSheet
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: "business", label: "Business" },
              { id: "invoice", label: "Invoice print" },
              { id: "printer", label: "Printer" },
              { id: "devices", label: "Devices" },
            ]}
          />
        }
      >
      {tab === "business" ? (
        <div className="ui-sheet-panel [flex:1] [min-height:0] [overflow:auto] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:0_10px_10px_10px] [padding:16px]">
        <div className="ui-form-grid [display:grid] [grid-template-columns:1fr_1fr] [gap:12px] [min-height:0] [overflow:hidden]">
          <section className="settings-card">
            <h2 className="panel-title [font-size:13px] [font-weight:700] [color:var(--ink)]">AppSetting</h2>
            <div className="ui-stack [display:grid] [gap:12px]" style={{ marginTop: 12 }}>
              <Field label="Business name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Phone">
                <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Address">
                <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
              <Field label="Currency">
                <TextInput defaultValue="PKR" />
              </Field>
            </div>
          </section>
          <section className="settings-card">
            <h2 className="panel-title [font-size:13px] [font-weight:700] [color:var(--ink)]">Defaults</h2>
            <div className="ui-stack [display:grid] [gap:12px]" style={{ marginTop: 12 }}>
              <Toggle
                checked={settings.autoSku}
                onChange={(v) => setSettings({ ...settings, autoSku: v })}
                label="Assign SKU on save"
              />
              <Toggle checked={lot} onChange={setLot} label="branch_lot_enabled (shop default)" />
              <Toggle checked={neg} onChange={setNeg} label="allow_negative_stock (shop default)" />
              <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">SKU stays optional unless this is on. Each branch can override lot and stock rules on Branches.</p>
            </div>
          </section>
        </div>
        </div>
      ) : null}
      {tab === "invoice" ? (
        <div className="ui-sheet-panel [flex:1] [min-height:0] [overflow:auto] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:0_10px_10px_10px] [padding:16px]">
        <div className="ui-form-grid [display:grid] [grid-template-columns:1fr_1fr] [gap:12px] [min-height:0] [overflow:hidden]">
          <section className="settings-card">
            <h2 className="panel-title [font-size:13px] [font-weight:700] [color:var(--ink)]">InvoiceSetting</h2>
            <div className="ui-stack [display:grid] [gap:12px]" style={{ marginTop: 12 }}>
              <Field label="Invoice prefix">
                <TextInput value={prefix} onChange={(e) => setPrefix(e.target.value)} />
              </Field>
              <Field label="Footer">
                <TextArea value={footer} onChange={(e) => setFooter(e.target.value)} />
              </Field>
              <Toggle checked={showBal} onChange={setShowBal} label="Show customer balance on slip" />
            </div>
          </section>
          <section className="settings-card">
            <h2 className="panel-title [font-size:13px] [font-weight:700] [color:var(--ink)]">Paper</h2>
            <div className="ui-stack [display:grid] [gap:12px]" style={{ marginTop: 12 }}>
              <Field label="Paper size">
                <SelectInput value={paper} onChange={(e) => setPaper(e.target.value)}>
                  <option value="thermal">Thermal 80mm</option>
                  <option value="a4">A4</option>
                </SelectInput>
              </Field>
              <Toggle checked={true} onChange={() => undefined} label="Show logo" />
              <Toggle checked={true} onChange={() => undefined} label="Show discount" />
            </div>
          </section>
        </div>
        </div>
      ) : null}
      {tab === "printer" ? (
        <div className="ui-sheet-panel [flex:1] [min-height:0] [overflow:auto] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:0_10px_10px_10px] [padding:16px]">
        <section className="settings-card">
          <h2 className="panel-title [font-size:13px] [font-weight:700] [color:var(--ink)]">PrinterSetting for this device</h2>
          <div className="ui-stack [display:grid] [gap:12px]" style={{ marginTop: 12, maxWidth: 420 }}>
            <Field label="Printer name">
              <TextInput defaultValue="XP-80C" />
            </Field>
            <Field label="Receipt width (mm)">
              <TextInput defaultValue="80" />
            </Field>
            <Field label="Copies">
              <TextInput defaultValue="1" />
            </Field>
            <Toggle checked={autoPrint} onChange={setAutoPrint} label="auto_print after sale" />
          </div>
        </section>
        </div>
      ) : null}
      {tab === "devices" ? (
        <Table>
          <THead>
            <tr>
              <Th>Device</Th>
              <Th>Branch</Th>
              <Th>Last seen</Th>
              <Th>Last sync</Th>
              <Th>Active</Th>
              <Th>Last log</Th>
            </tr>
          </THead>
          <tbody>
            {devices.map((d) => {
              const log = syncLogs.find((s) => s.deviceId === d.id);
              return (
                <tr key={d.id}>
                  <Td>{d.name}</Td>
                  <Td>{branchName(d.branchId)}</Td>
                  <Td>{d.lastSeenAt}</Td>
                  <Td>{d.lastSyncedAt}</Td>
                  <Td>
                    <Badge tone={d.isActive ? "ok" : "danger"}>{d.isActive ? "Yes" : "No"}</Badge>
                  </Td>
                  <Td>
                    {log ? <Badge tone={log.status === "SUCCESS" ? "ok" : "danger"}>{log.status}</Badge> : "—"}
                    {log?.errorMessage ? <span className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]"> {log.errorMessage}</span> : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : null}
      </TabSheet>
    </div>
  );
}
