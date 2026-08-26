import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  EmptyRow,
  Field,
  KpiCard,
  PageHead,
  Pagination,
  SearchInput,
  SelectInput,
  Table,
  TabSheet,
  Tabs,
  Td,
  TextInput,
  THead,
  Th,
  Toggle,
} from "@/components/common";
import { staffUsers as seed, userPermissions, branchName, branches } from "@/shared/domain/mock";
import type { StaffUser, UserRole } from "@/shared/domain/types";

const PAGE = 10;
const PERMS = ["invoice.create", "product.edit", "return.create", "expense.view", "report.view"];

export function EmployeesPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<StaffUser | null>(null);

  const rows = useMemo(() => {
    return seed.filter((r) => {
      if (q && !`${r.name} ${r.username}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (tab === "inactive") return !r.isActive;
      if (tab !== "all" && tab !== "inactive") return r.role === (tab.toUpperCase() as UserRole);
      return tab === "inactive" ? !r.isActive : true;
    });
  }, [q, tab]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Staff">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(seed[1])}>
          Add user
        </Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        Users log in with username + password_hash. Owner sees every screen. Cashier permissions are per-flag (invoice.create, product.edit, …).
      </p>
      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
        <KpiCard label="Active" value={seed.filter((u) => u.isActive).length} hint="Can sign in" tone="ok" />
        <KpiCard label="Cashiers" value={seed.filter((u) => u.role === "CASHIER").length} hint="POS users" tone="ok" />
        <KpiCard label="Inactive" value={seed.filter((u) => !u.isActive).length} hint="Blocked" tone="stale" />
      </div>
      <TabSheet
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => {
              setTab(id);
              setPage(1);
            }}
            items={[
              { id: "all", label: "All" },
              { id: "cashier", label: "Cashier" },
              { id: "manager", label: "Manager" },
              { id: "technician", label: "Technician" },
              { id: "inactive", label: "Inactive" },
            ]}
          />
        }
      >
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or username" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} onChange={setPage} />}
      >
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Username</Th>
            <Th>Role</Th>
            <Th>Branch</Th>
            <Th>Phone</Th>
            <Th>Active</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={7} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{row.name}</Td>
              <Td>{row.username}</Td>
              <Td>
                <Badge tone={row.role === "OWNER" ? "ok" : "info"}>{row.role}</Badge>
              </Td>
              <Td>{branchName(row.branchId)}</Td>
              <Td>{row.phone || "—"}</Td>
              <Td>
                <Badge tone={row.isActive ? "ok" : "danger"}>{row.isActive ? "Yes" : "No"}</Badge>
              </Td>
              <Td>
                <Button size="icon" variant="ghost" onClick={() => setOpen(row)} aria-label="Edit">
                  <Pencil size={15} />
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      </TabSheet>

      <Drawer
        open={Boolean(open)}
        title={open ? open.name : "User"}
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
              <TextInput defaultValue={open.name} />
            </Field>
            <Field label="Username">
              <TextInput defaultValue={open.username} />
            </Field>
            <Field label="Role">
              <SelectInput defaultValue={open.role}>
                <option>OWNER</option>
                <option>MANAGER</option>
                <option>CASHIER</option>
                <option>TECHNICIAN</option>
              </SelectInput>
            </Field>
            <Field label="Home branch">
              <SelectInput defaultValue={open.branchId}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <p className="ui-page-title [font-size:22px] [font-weight:800] [letter-spacing:-0.03em] [color:var(--ink)] [min-width:0]" style={{ fontSize: 14 }}>
              Permissions
            </p>
            {PERMS.map((perm) => {
              const row = userPermissions.find((p) => p.userId === open.id && p.permission === perm);
              const on = open.role === "OWNER" || Boolean(row?.isAllowed);
              return <Toggle key={perm} checked={on} onChange={() => undefined} label={perm} />;
            })}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
