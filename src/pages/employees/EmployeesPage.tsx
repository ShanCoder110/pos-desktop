import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader, RowActions } from "@/components/ui/Chrome";
import { Field, Input } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { employees as seed } from "@/shared/mock";
import type { Employee } from "@/shared/types";
import { money } from "@/utils/format";

const blank: Employee = { id: "", name: "", role: "Cashier", salary: 0, paidThisMonth: 0 };

export function EmployeesPage() {
  const [rows, setRows] = useState(seed);
  const [edit, setEdit] = useState<Employee | null>(null);
  const [remove, setRemove] = useState<Employee | null>(null);
  const [pay, setPay] = useState<Employee | null>(null);
  const [amount, setAmount] = useState("");

  return (
    <div>
      <PageHeader
        title="Employees"
        hint="Salary, partial pay, repair commission is recorded on the job."
        actions={
          <Button variant="primary" onClick={() => setEdit({ ...blank, id: crypto.randomUUID() })}>
            Add
          </Button>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th className="text-right">Salary</Th>
            <Th className="text-right">Paid</Th>
            <Th className="text-right">Left</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>{row.name}</Td>
              <Td>{row.role}</Td>
              <Td className="text-right tabular-nums">{money(row.salary)}</Td>
              <Td className="text-right tabular-nums">{money(row.paidThisMonth)}</Td>
              <Td className="text-right tabular-nums">{money(row.salary - row.paidThisMonth)}</Td>
              <Td>
                <div className="flex justify-end gap-1">
                  <Button size="sm" onClick={() => { setPay(row); setAmount(""); }}>
                    Pay
                  </Button>
                  <RowActions onEdit={() => setEdit(row)} onDelete={() => setRemove(row)} />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Modal
        open={Boolean(edit)}
        title="Employee"
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
            <Field label="Role">
              <Input value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} />
            </Field>
            <Field label="Salary">
              <Input value={String(edit.salary)} onChange={(e) => setEdit({ ...edit, salary: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        ) : null}
      </Modal>
      <Modal
        open={Boolean(pay)}
        title={`Pay ${pay?.name ?? ""}`}
        onClose={() => setPay(null)}
        footer={
          <>
            <Button onClick={() => setPay(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!pay) return;
                const n = Number(amount) || 0;
                setRows((p) => p.map((r) => (r.id === pay.id ? { ...r, paidThisMonth: r.paidThisMonth + n } : r)));
                setPay(null);
              }}
            >
              Update
            </Button>
          </>
        }
      >
        <Field label="Amount this time">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete employee?"
        body={`${remove?.name} will be removed.`}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
