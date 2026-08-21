import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, PageHeader, RowActions } from "@/components/ui/Chrome";
import { Field, Input, Select } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { customerName, customers, employeeName, employees, products, repairJobs as seed } from "@/shared/mock";
import { useSettings } from "@/shared/settings";
import type { InvoiceLine, RepairJob, RepairStatus } from "@/shared/types";
import { money } from "@/utils/format";
import { consumeLots } from "@/utils/lots";

const tones: Record<RepairStatus, "amber" | "teal" | "emerald"> = {
  open: "amber",
  done: "teal",
  delivered: "emerald",
};

export function RepairPage() {
  const { settings } = useSettings();
  const [rows, setRows] = useState(seed);
  const [edit, setEdit] = useState<RepairJob | null>(null);
  const [remove, setRemove] = useState<RepairJob | null>(null);
  const [q, setQ] = useState("");
  const [qty, setQty] = useState("1");

  function addPart(job: RepairJob, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return job;
    const result = consumeLots(product, Number(qty) || 1, settings.stockPick);
    if ("error" in result) return job;
    const line: InvoiceLine = {
      id: crypto.randomUUID(),
      productId: product.id,
      name: product.name,
      qty: Number(qty) || 1,
      unit: product.unit,
      price: result.price,
      minFloor: result.minFloor,
      lotsNote: result.lotsNote,
    };
    return { ...job, parts: [...job.parts, line] };
  }

  return (
    <div>
      <PageHeader
        title="Repair shop"
        hint="Move stock onto a job like a credit sale. Labour and commission sit on the job."
        actions={
          <Button
            variant="primary"
            onClick={() =>
              setEdit({
                id: crypto.randomUUID(),
                no: `RP-${90 + rows.length}`,
                date: "2026-08-13",
                customerId: customers[4].id,
                item: "",
                status: "open",
                parts: [],
                labour: 0,
                employeeId: "e3",
                commission: 0,
              })
            }
          >
            New job
          </Button>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>No</Th>
            <Th>Customer</Th>
            <Th>Item</Th>
            <Th>Tech</Th>
            <Th className="text-right">Parts</Th>
            <Th className="text-right">Labour</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>{row.no}</Td>
              <Td>{customerName(row.customerId)}</Td>
              <Td>{row.item}</Td>
              <Td>{employeeName(row.employeeId)}</Td>
              <Td className="text-right tabular-nums">{money(row.parts.reduce((s, l) => s + l.qty * l.price, 0))}</Td>
              <Td className="text-right tabular-nums">{money(row.labour)}</Td>
              <Td>
                <Badge tone={tones[row.status]}>{row.status}</Badge>
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
        title={edit?.no ?? "Job"}
        wide
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit?.item) return;
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer">
              <Select value={edit.customerId} onChange={(e) => setEdit({ ...edit, customerId: e.target.value })}>
                {customers.filter((c) => !c.isWalking).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as RepairStatus })}>
                <option value="open">Open</option>
                <option value="done">Done</option>
                <option value="delivered">Delivered</option>
              </Select>
            </Field>
            <Field label="What came in" className="col-span-2">
              <Input value={edit.item} onChange={(e) => setEdit({ ...edit, item: e.target.value })} />
            </Field>
            <Field label="Tech">
              <Select value={edit.employeeId} onChange={(e) => setEdit({ ...edit, employeeId: e.target.value })}>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Labour">
              <Input value={String(edit.labour)} onChange={(e) => setEdit({ ...edit, labour: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Commission">
              <Input value={String(edit.commission)} onChange={(e) => setEdit({ ...edit, commission: Number(e.target.value) || 0 })} />
            </Field>
            <div className="col-span-2 flex gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const p = products.find((x) => x.name.toLowerCase().includes(q.toLowerCase()));
                    if (p) {
                      setEdit(addPart(edit, p.id));
                      setQ("");
                    }
                  }
                }}
                placeholder="Add part · search, Enter"
              />
              <Input className="w-20" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="col-span-2 grid gap-1">
              {edit.parts.map((line) => (
                <div key={line.id} className="flex justify-between text-[13px]">
                  <span>
                    {line.qty} {line.unit} {line.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {money(line.qty * line.price)}
                    <button onClick={() => setEdit({ ...edit, parts: edit.parts.filter((l) => l.id !== line.id) })}>
                      <Trash2 size={13} className="text-rose-600" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete job?"
        body="Parts already taken from stock stay in history unless you restock them."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
