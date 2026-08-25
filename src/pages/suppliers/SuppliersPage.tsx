import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  Field,
  KpiCard,
  Menu,
  MenuItem,
  PageHead,
  Pagination,
  SearchInput,
  Table,
  Tabs,
  Td,
  TextArea,
  TextInput,
  THead,
  Th,
} from "@/components/common";
import { suppliers as seed } from "@/shared/domain/mock";
import type { SupplierRow } from "@/shared/domain/types";

const PAGE = 10;
const blank: SupplierRow = { id: "", name: "", phone: "", email: "", address: "", notes: "", isActive: true };

export function SuppliersPage() {
  const [rows, setRows] = useState(seed);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("active");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<SupplierRow | null>(null);
  const [remove, setRemove] = useState<SupplierRow | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (q && !`${r.name} ${r.phone}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (tab === "active") return r.isActive;
      if (tab === "inactive") return !r.isActive;
      return true;
    });
  }, [rows, q, tab]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="ui-stack">
      <PageHead title="Suppliers">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ ...blank, id: crypto.randomUUID() })}>
          Add supplier
        </Button>
      </PageHead>
      <p className="ui-note">No supplier ledger in V1. Receiving stock creates a ProductLot with this supplier_id.</p>
      <div className="ui-kpi-row">
        <KpiCard label="Active" value={rows.filter((r) => r.isActive).length} hint="Can receive lots" tone="ok" />
        <KpiCard label="Inactive" value={rows.filter((r) => !r.isActive).length} hint="Hidden on receive" tone="stale" />
      </div>
      <Tabs
        value={tab}
        onChange={(id) => {
          setTab(id);
          setPage(1);
        }}
        items={[
          { id: "all", label: "All" },
          { id: "active", label: "Active" },
          { id: "inactive", label: "Inactive" },
        ]}
      />
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or phone" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={filtered.length} onChange={setPage} />}
      >
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>Email</Th>
            <Th>Address</Th>
            <Th>Active</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={6} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{row.name}</Td>
              <Td>{row.phone || "—"}</Td>
              <Td>{row.email || "—"}</Td>
              <Td>{row.address || "—"}</Td>
              <Td>
                <Badge tone={row.isActive ? "ok" : "danger"}>{row.isActive ? "Yes" : "No"}</Badge>
              </Td>
              <Td>
                <Menu>
                  <MenuItem icon={<Pencil size={14} />} onClick={() => setEdit(row)}>
                    Edit
                  </MenuItem>
                  <MenuItem danger icon={<Trash2 size={14} />} onClick={() => setRemove(row)}>
                    Delete
                  </MenuItem>
                </Menu>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(edit)}
        title={edit?.name ? "Edit supplier" : "Add supplier"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit?.name) return;
                setRows((p) => (p.some((r) => r.id === edit.id) ? p.map((r) => (r.id === edit.id ? edit : r)) : [...p, edit]));
                setEdit(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="ui-stack">
            <Field label="Name">
              <TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <TextInput value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <TextInput value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </Field>
            <Field label="Address">
              <TextInput value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </Field>
            <Field label="Notes">
              <TextArea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete supplier?"
        body="Blocked if lots still point here."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
