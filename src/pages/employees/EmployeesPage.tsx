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
} from "@/components/common";
import type { Branch, StaffUser, UserRole } from "@/shared/domain/types";
import { ensureSession } from "@/services/auth";
import { listAllBranches, listAllUsers, mapBranch, mapUser } from "@/services/org";

const PAGE = 10;

export function EmployeesPage() {
  const [seed, setSeed] = useState<StaffUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE);
  const [open, setOpen] = useState<StaffUser | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const [users, branchRows] = await Promise.all([
        listAllUsers(controller.signal).catch(() => []),
        listAllBranches(controller.signal)
          .then((rows) => rows.map(mapBranch))
          .catch(() => [] as Branch[]),
      ]);
      setSeed(users.map(mapUser));
      setBranches(branchRows);
    })();
    return () => controller.abort();
  }, []);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  const rows = useMemo(() => {
    return seed.filter((r) => {
      if (q && !`${r.name} ${r.username}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (tab === "inactive") return !r.isActive;
      if (tab !== "all" && tab !== "inactive") return r.role === (tab.toUpperCase() as UserRole);
      return tab === "inactive" ? !r.isActive : true;
    });
  }, [seed, q, tab]);

  const showAllRows = pageSize === 0;
  const pages = showAllRows ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = showAllRows ? rows : rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Staff">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(seed[0] ?? null)}>
          Add user
        </Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        Add staff and choose their role and branch.
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
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} pageSize={pageSize} onPageSize={setPageSize} onChange={setPage} />}
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
              <TextInput defaultValue={open.name} placeholder="e.g. Ali Khan" />
            </Field>
            <Field label="Username">
              <TextInput defaultValue={open.username} placeholder="e.g. ali" />
            </Field>
            <Field label="Phone">
              <TextInput defaultValue={open.phone} placeholder="e.g. 0300 1234567" />
            </Field>
            <Field label="Role">
              <SelectInput defaultValue={open.role}>
                <option value="OWNER">Owner</option>
                <option value="MANAGER">Manager</option>
                <option value="CASHIER">Cashier</option>
                <option value="TECHNICIAN">Technician</option>
              </SelectInput>
            </Field>
            <Field label="Branch">
              <SelectInput defaultValue={open.branchId}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
