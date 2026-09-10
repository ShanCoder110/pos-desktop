import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  EmptyRow,
  Field,
  KpiCard,
  PageHead,
  Table,
  Td,
  TextInput,
  THead,
  Th,
  Toggle,
  SelectInput,
} from "@/components/common";
import type { Branch, BranchSetting, BranchType } from "@/shared/domain/types";
import { ensureSession } from "@/services/auth";
import { listAllBranches, mapBranch, mapBranchSetting } from "@/services/org";

function typeTone(t: BranchType) {
  if (t === "STORE") return "ok" as const;
  if (t === "WAREHOUSE") return "info" as const;
  if (t === "REPAIR") return "warn" as const;
  return "info" as const;
}

export function ShopsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [settings, setSettings] = useState<BranchSetting[]>([]);
  const [open, setOpen] = useState<Branch | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const rows = await listAllBranches(controller.signal).catch(() => []);
      setBranches(rows.map(mapBranch));
      setSettings(rows.map(mapBranchSetting).filter((s): s is BranchSetting => s !== null));
    })();
    return () => controller.abort();
  }, []);

  const setting = useMemo(() => {
    const map = new Map<string, BranchSetting>();
    settings.forEach((s) => map.set(s.branchId, s));
    return (id: string) => map.get(id);
  }, [settings]);

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Branches">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(branches[0] ?? null)}>
          Add branch
        </Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        STORE sells. WAREHOUSE holds bulk lots. REPAIR and PRODUCTION consume components. BranchSetting controls lot tracking and negative stock per location.
      </p>
      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
        <KpiCard label="Active" value={branches.filter((b) => b.isActive).length} hint="In use" tone="ok" />
        <KpiCard label="Stores" value={branches.filter((b) => b.type === "STORE").length} hint="POS counters" tone="ok" />
        <KpiCard label="Lot tracking" value={settings.filter((s) => s.branchLotEnabled).length} hint="BranchLot rows" tone="warn" />
      </div>
      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Code</Th>
            <Th>Type</Th>
            <Th>Phone</Th>
            <Th>Lot tracking</Th>
            <Th>Negative stock</Th>
            <Th>Active</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {branches.length === 0 ? <EmptyRow cols={8} /> : null}
          {branches.map((row) => {
            const s = setting(row.id);
            return (
              <tr key={row.id}>
                <Td>{row.name}</Td>
                <Td>{row.code}</Td>
                <Td>
                  <Badge tone={typeTone(row.type)}>{row.type}</Badge>
                </Td>
                <Td>{row.phone}</Td>
                <Td>
                  <Badge tone={s?.branchLotEnabled ? "ok" : "info"}>{s?.branchLotEnabled ? "On" : "Off"}</Badge>
                </Td>
                <Td>
                  <Badge tone={s?.allowNegativeStock ? "warn" : "ok"}>{s?.allowNegativeStock ? "Allowed" : "Blocked"}</Badge>
                </Td>
                <Td>
                  <Badge tone={row.isActive ? "ok" : "danger"}>{row.isActive ? "Yes" : "No"}</Badge>
                </Td>
                <Td>
                  <Button size="icon" variant="ghost" onClick={() => setOpen(row)} aria-label="Edit">
                    <Pencil size={15} />
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(open)}
        title={open?.name ?? "Branch"}
        onClose={() => setOpen(null)}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(null)}>
              Save
            </Button>
          </>
        }
      >
        {open ? (
          <div className="ui-stack [display:grid] [gap:12px]">
            <Field label="Name">
              <TextInput defaultValue={open.name} placeholder="e.g. Main Store" />
            </Field>
            <Field label="Code">
              <TextInput defaultValue={open.code} placeholder="e.g. MAIN" />
            </Field>
            <Field label="Type">
              <SelectInput defaultValue={open.type}>
                <option value="STORE">Store</option>
                <option value="WAREHOUSE">Warehouse</option>
                <option value="REPAIR">Repair</option>
                <option value="PRODUCTION">Production</option>
              </SelectInput>
            </Field>
            <Field label="Phone">
              <TextInput defaultValue={open.phone} placeholder="e.g. 0300 1234567" />
            </Field>
            <Field label="Address">
              <TextInput defaultValue={open.address} placeholder="e.g. Hall Road, Lahore" />
            </Field>
            <Toggle checked={Boolean(setting(open.id)?.branchLotEnabled)} onChange={() => undefined} label="Branch lot tracking" />
            <Toggle checked={Boolean(setting(open.id)?.allowNegativeStock)} onChange={() => undefined} label="Allow negative stock" />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
