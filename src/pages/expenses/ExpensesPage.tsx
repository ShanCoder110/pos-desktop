import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader, RowActions } from "@/components/ui/Chrome";
import { Field, Input } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { expenses as seed } from "@/shared/mock";
import type { Expense } from "@/shared/types";
import { money } from "@/utils/format";

export function ExpensesPage() {
  const [rows, setRows] = useState(seed);
  const [edit, setEdit] = useState<Expense | null>(null);
  const [remove, setRemove] = useState<Expense | null>(null);
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <PageHeader
        title="Expenses"
        hint="Overheads only. These reduce profit on the dashboard."
        actions={
          <Button
            variant="primary"
            onClick={() => setEdit({ id: crypto.randomUUID(), date: "2026-08-13", title: "", amount: 0 })}
          >
            Add
          </Button>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>Date</Th>
            <Th>Title</Th>
            <Th className="text-right">Amount</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>{row.date}</Td>
              <Td>{row.title}</Td>
              <Td className="text-right tabular-nums">{money(row.amount)}</Td>
              <Td>
                <RowActions onEdit={() => setEdit(row)} onDelete={() => setRemove(row)} />
              </Td>
            </tr>
          ))}
          <tr>
            <Td />
            <Td className="font-medium">Total</Td>
            <Td className="text-right font-semibold tabular-nums">{money(total)}</Td>
            <Td />
          </tr>
        </tbody>
      </Table>
      <Modal
        open={Boolean(edit)}
        title="Expense"
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit?.title) return;
                setRows((p) => (p.some((r) => r.id === edit.id) ? p.map((r) => (r.id === edit.id ? edit : r)) : [edit, ...p]));
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
            <Field label="Title">
              <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            <Field label="Amount">
              <Input value={String(edit.amount)} onChange={(e) => setEdit({ ...edit, amount: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Date">
              <Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete expense?"
        body={`${remove?.title} will be removed.`}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
