import { useMemo, useState } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
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
import { domainCustomers as seed, ledger } from "@/shared/domain/mock";
import type { DomainCustomer } from "@/shared/domain/types";
import { creditState, money } from "@/utils/format";

const PAGE = 10;
const blank: DomainCustomer = {
  id: "",
  name: "",
  phone: "",
  address: "",
  currentBalance: 0,
  creditLimit: null,
  notes: "",
  isActive: true,
};

export function CustomersPage() {
  const [rows, setRows] = useState(seed);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<DomainCustomer | null>(null);
  const [open, setOpen] = useState<DomainCustomer | null>(null);
  const [remove, setRemove] = useState<DomainCustomer | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (q && !`${r.name} ${r.phone}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (tab === "owe") return r.currentBalance > 0;
      if (tab === "inactive") return !r.isActive;
      return tab === "all" ? true : r.isActive;
    });
  }, [rows, q, tab]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="ui-stack">
      <PageHead title="Customers">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ ...blank, id: crypto.randomUUID() })}>
          Add customer
        </Button>
      </PageHead>
      <p className="ui-note">
        Walk-in sales leave customer_id empty on the invoice — they never get a khata. +balance owes the shop. −balance is advance.
      </p>
      <div className="ui-kpi-row">
        <KpiCard label="Active" value={rows.filter((r) => r.isActive).length} hint="Can sell on name" tone="ok" />
        <KpiCard label="Owing" value={rows.filter((r) => r.currentBalance > 0).length} hint="Open udhaar" tone="warn" />
        <KpiCard label="To collect" value={money(rows.filter((r) => r.currentBalance > 0).reduce((s, r) => s + r.currentBalance, 0))} hint="Sum of +" tone="danger" />
      </div>
      <Tabs
        value={tab}
        onChange={(id) => {
          setTab(id);
          setPage(1);
        }}
        items={[
          { id: "all", label: "All" },
          { id: "owe", label: "Owes" },
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
            <Th>Limit</Th>
            <Th>Khata</Th>
            <Th>Active</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={6} /> : null}
          {shown.map((row) => {
            const st = creditState(row.currentBalance);
            return (
              <tr key={row.id}>
                <Td>{row.name}</Td>
                <Td>{row.phone || "—"}</Td>
                <Td numeric>{row.creditLimit == null ? "None" : money(row.creditLimit)}</Td>
                <Td>
                  <Badge tone={st.tone === "neutral" ? "info" : st.tone}>{st.text}</Badge>
                </Td>
                <Td>
                  <Badge tone={row.isActive ? "ok" : "danger"}>{row.isActive ? "Yes" : "No"}</Badge>
                </Td>
                <Td>
                  <Menu>
                    <MenuItem icon={<Eye size={14} />} onClick={() => setOpen(row)}>
                      Ledger
                    </MenuItem>
                    <MenuItem icon={<Pencil size={14} />} onClick={() => setEdit(row)}>
                      Edit
                    </MenuItem>
                    <MenuItem danger icon={<Trash2 size={14} />} onClick={() => setRemove(row)}>
                      Delete
                    </MenuItem>
                  </Menu>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(edit)}
        title={edit?.name ? "Edit customer" : "Add customer"}
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
            <Field label="Address">
              <TextInput value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </Field>
            <Field label="Credit limit (empty = none)">
              <TextInput
                value={edit.creditLimit == null ? "" : String(edit.creditLimit)}
                onChange={(e) => setEdit({ ...edit, creditLimit: e.target.value === "" ? null : Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Notes">
              <TextArea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Drawer>

      <Drawer open={Boolean(open)} title={open ? `${open.name} ledger` : "Ledger"} onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
        {open ? (
          <Table>
            <THead>
              <tr>
                <Th>When</Th>
                <Th>Type</Th>
                <Th>Debit</Th>
                <Th>Credit</Th>
                <Th>After</Th>
              </tr>
            </THead>
            <tbody>
              {ledger.filter((l) => l.customerId === open.id).map((line) => (
                <tr key={line.id}>
                  <Td>{line.createdAt}</Td>
                  <Td>{line.type}</Td>
                  <Td numeric>{line.debit ? money(line.debit) : "—"}</Td>
                  <Td numeric>{line.credit ? money(line.credit) : "—"}</Td>
                  <Td numeric>{creditState(line.balanceAfter).text}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete customer?"
        body="Blocked if invoices or ledger lines still point here."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
