import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BalanceBadge, PageHeader, RowActions, SearchBox } from "@/components/ui/Chrome";
import { Field, Input } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { customers as seed } from "@/shared/mock";
import type { Customer } from "@/shared/types";

const blank: Customer = { id: "", name: "", phone: "", balance: 0, isWalking: false };

export function CustomersPage() {
  const [rows, setRows] = useState(seed);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Customer | null>(null);
  const [remove, setRemove] = useState<Customer | null>(null);

  const shown = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Customers"
        hint="Negative = they pay us later. Positive = store credit used on the next bill."
        actions={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Search name" />
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
            <Th>Khata</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.id} className={row.isWalking ? "bg-slate-50" : undefined}>
              <Td>
                {row.name}
                {row.isWalking ? <span className="ml-2 text-[11px] text-slate-400">default</span> : null}
              </Td>
              <Td className="text-slate-500">{row.phone || "—"}</Td>
              <Td>
                <BalanceBadge n={row.balance} />
              </Td>
              <Td>
                <RowActions onEdit={() => setEdit(row)} onDelete={() => setRemove(row)} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal
        open={Boolean(edit)}
        title={edit && rows.some((r) => r.id === edit.id && r.name) ? "Update customer" : "Add customer"}
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
              <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="Needed for WhatsApp" />
            </Field>
            <Field label="Opening khata (− they owe, + advance)">
              <Input
                value={String(edit.balance)}
                onChange={(e) => setEdit({ ...edit, balance: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete customer?"
        body={remove?.isWalking ? "Walking customer is the default. Deleting is blocked." : `${remove?.name} will be removed from the directory.`}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove && !remove.isWalking) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
