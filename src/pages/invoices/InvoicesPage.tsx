import { useMemo, useState } from "react";
import { Copy, Pencil, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, DateFilter, PageHeader, SearchBox } from "@/components/ui/Chrome";
import { Field, Input, Select } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { PrintPreview } from "@/components/print/PrintPreview";
import { customerName, customers, invoices as seed } from "@/shared/mock";
import type { Invoice } from "@/shared/types";
import { money } from "@/utils/format";

const statusTone = {
  paid: "emerald",
  partial: "amber",
  credit: "rose",
  held: "slate",
} as const;

export function InvoicesPage() {
  const [rows, setRows] = useState(seed);
  const [q, setQ] = useState("");
  const [range, setRange] = useState({ from: "2026-08-01", to: "2026-08-13" });
  const [edit, setEdit] = useState<Invoice | null>(null);
  const [remove, setRemove] = useState<Invoice | null>(null);
  const [print, setPrint] = useState<Invoice | null>(null);
  const [dup, setDup] = useState(false);

  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.date >= range.from &&
          r.date <= range.to &&
          (`${r.no} ${customerName(r.customerId)}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [rows, q, range],
  );

  return (
    <div>
      <PageHeader
        title="Invoices"
        hint="Before/after khata is stored on each bill. Reprint marks a copy. No extra phone box."
        actions={
          <>
            <DateFilter from={range.from} to={range.to} onChange={setRange} />
            <SearchBox value={q} onChange={setQ} placeholder="No or customer" />
          </>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>No</Th>
            <Th>When</Th>
            <Th>Customer</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Paid</Th>
            <Th>Khata</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.id}>
              <Td className="font-medium">{row.no}</Td>
              <Td>
                {row.date} {row.time}
              </Td>
              <Td>{customerName(row.customerId)}</Td>
              <Td className="text-right tabular-nums">{money(row.total)}</Td>
              <Td className="text-right tabular-nums">{money(row.paid)}</Td>
              <Td className="text-[12px] text-slate-500">
                {row.balanceBefore} → {row.balanceAfter}
              </Td>
              <Td>
                <Badge tone={statusTone[row.status]}>{row.status}</Badge>
              </Td>
              <Td>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setPrint(row); setDup(false); }} aria-label="Print">
                    <Printer size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setPrint(row); setDup(true); }} aria-label="Duplicate">
                    <Copy size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEdit(row)} aria-label="Edit">
                    <Pencil size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setRemove(row)} aria-label="Delete">
                    <Trash2 size={14} className="text-rose-600" />
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Modal
        open={Boolean(edit)}
        title={`Update ${edit?.no ?? ""}`}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit) return;
                setRows((p) => p.map((r) => (r.id === edit.id ? edit : r)));
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
            <Field label="Customer">
              <Select value={edit.customerId} onChange={(e) => setEdit({ ...edit, customerId: e.target.value })}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Paid">
              <Input value={String(edit.paid)} onChange={(e) => setEdit({ ...edit, paid: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete invoice?"
        body="History and khata snapshots go with it. Use only if this bill was a mistake."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
      {print ? (
        <PrintPreview
          open
          onClose={() => setPrint(null)}
          customer={customers.find((c) => c.id === print.customerId) ?? customers[0]}
          lines={print.lines}
          total={print.total}
          paid={print.paid}
          balanceBefore={print.balanceBefore}
          balanceAfter={print.balanceAfter}
          duplicate={dup}
        />
      ) : null}
    </div>
  );
}
