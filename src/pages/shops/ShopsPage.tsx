import { useState } from "react";
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
import { branches as seed, branchSettings } from "@/shared/domain/mock";
import type { Branch, BranchType } from "@/shared/domain/types";

function typeTone(t: BranchType) {
  if (t === "STORE") return "ok" as const;
  if (t === "WAREHOUSE") return "info" as const;
  if (t === "REPAIR") return "warn" as const;
  return "info" as const;
}

export function ShopsPage() {
  const [open, setOpen] = useState<Branch | null>(null);
  const setting = (id: string) => branchSettings.find((s) => s.branchId === id);

  return (
    <div className="ui-stack">
      <PageHead title="Branches">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(seed[0])}>
          Add branch
        </Button>
      </PageHead>
      <p className="ui-note">
        STORE sells. WAREHOUSE holds bulk lots. REPAIR and PRODUCTION consume components. BranchSetting controls lot tracking and negative stock per location.
      </p>
      <div className="ui-kpi-row">
        <KpiCard label="Active" value={seed.filter((b) => b.isActive).length} hint="In use" tone="ok" />
        <KpiCard label="Stores" value={seed.filter((b) => b.type === "STORE").length} hint="POS counters" tone="ok" />
        <KpiCard label="Lot tracking" value={branchSettings.filter((s) => s.branchLotEnabled).length} hint="BranchLot rows" tone="warn" />
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
          {seed.length === 0 ? <EmptyRow cols={8} /> : null}
          {seed.map((row) => {
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
          <div className="ui-stack">
            <Field label="Name">
              <TextInput defaultValue={open.name} />
            </Field>
            <Field label="Code">
              <TextInput defaultValue={open.code} />
            </Field>
            <Field label="Type">
              <SelectInput defaultValue={open.type}>
                <option>STORE</option>
                <option>WAREHOUSE</option>
                <option>REPAIR</option>
                <option>PRODUCTION</option>
              </SelectInput>
            </Field>
            <Field label="Phone">
              <TextInput defaultValue={open.phone} />
            </Field>
            <Field label="Address">
              <TextInput defaultValue={open.address} />
            </Field>
            <Toggle checked={Boolean(setting(open.id)?.branchLotEnabled)} onChange={() => undefined} label="Branch lot tracking" />
            <Toggle checked={Boolean(setting(open.id)?.allowNegativeStock)} onChange={() => undefined} label="Allow negative stock" />
            <p className="ui-note">Lot tracking writes BranchLot allocations. Negative stock is for the repair bench only in this shop.</p>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
