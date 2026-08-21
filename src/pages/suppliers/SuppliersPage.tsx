import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader, RowActions, SearchBox } from "@/components/ui/Chrome";
import { Field, Input } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { suppliers as seed } from "@/shared/mock";
import type { Supplier } from "@/shared/types";
import { money } from "@/utils/format";

const blank: Supplier = { id: "", name: "", phone: "", payable: 0 };

export function SuppliersPage() {
  const [rows, setRows] = useState(seed);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [remove, setRemove] = useState<Supplier | null>(null);
  const shown = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Suppliers"
        hint="Who you buy from, and what this shop still owes them."
        actions={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Search" />
            <Button variant="primary" onClick={() => setEdit({ ...blank, id: crypto.randomUUID() })}>
              Add
            </Button>
          </>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th className="text-right">We owe</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{row.name}</Td>
              <Td className="text-slate-500">{row.phone}</Td>
              <Td className="text-right tabular-nums">{row.payable ? money(row.payable) : "—"}</Td>
              <Td>
                <RowActions onEdit={() => setEdit(row)} onDelete={() => setRemove(row)} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Modal
        open={Boolean(edit)}
        title="Supplier"
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit?.name) return;
                setRows((prev) => (prev.some((r) => r.id === edit.id) ? prev.map((r) => (r.id === edit.id ? edit : r)) : [...prev, edit]));
                setEdit(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="grid gap-3">
            <Field label="Name">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </Field>
            <Field label="Payable">
              <Input value={String(edit.payable)} onChange={(e) => setEdit({ ...edit, payable: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete supplier?"
        body="Blocked if lots or reorders still point here. Design only — this demo removes the row."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
