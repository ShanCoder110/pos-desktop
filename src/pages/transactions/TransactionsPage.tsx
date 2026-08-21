import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateFilter, PageHeader, RowActions, SearchBox } from "@/components/ui/Chrome";
import { Field, Input, Select } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { transactions as seed } from "@/shared/mock";
import type { MoneyTxn, TxnKind } from "@/shared/types";
import { money } from "@/utils/format";

const kinds: TxnKind[] = ["sale", "credit", "purchase", "expense", "salary", "return", "repair"];

export function TransactionsPage() {
  const [rows, setRows] = useState(seed);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [range, setRange] = useState({ from: "2026-08-01", to: "2026-08-13" });
  const [edit, setEdit] = useState<MoneyTxn | null>(null);
  const [remove, setRemove] = useState<MoneyTxn | null>(null);

  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.date >= range.from &&
          r.date <= range.to &&
          (kind === "all" || r.kind === kind) &&
          `${r.party} ${r.note}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [rows, q, kind, range],
  );
  const inn = shown.reduce((s, r) => s + r.inflow, 0);
  const out = shown.reduce((s, r) => s + r.outflow, 0);

  return (
    <div>
      <PageHeader
        title="Money"
        hint="Full diary. Same dates as dashboard."
        actions={
          <>
            <DateFilter from={range.from} to={range.to} onChange={setRange} />
            <Select className="w-32" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All kinds</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            <SearchBox value={q} onChange={setQ} placeholder="Party or note" />
            <Button
              variant="primary"
              onClick={() =>
                setEdit({
                  id: crypto.randomUUID(),
                  date: "2026-08-13",
                  kind: "sale",
                  party: "",
                  inflow: 0,
                  outflow: 0,
                  note: "",
                })
              }
            >
              Add
            </Button>
          </>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>Date</Th>
            <Th>Kind</Th>
            <Th>Party</Th>
            <Th>Note</Th>
            <Th className="text-right">In</Th>
            <Th className="text-right">Out</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{row.date}</Td>
              <Td className="capitalize">{row.kind}</Td>
              <Td>{row.party}</Td>
              <Td className="text-slate-500">{row.note}</Td>
              <Td className="text-right tabular-nums">{row.inflow ? money(row.inflow) : "—"}</Td>
              <Td className="text-right tabular-nums">{row.outflow ? money(row.outflow) : "—"}</Td>
              <Td>
                <RowActions onEdit={() => setEdit(row)} onDelete={() => setRemove(row)} />
              </Td>
            </tr>
          ))}
          <tr>
            <Td colSpan={4} className="font-medium">
              Totals
            </Td>
            <Td className="text-right font-semibold tabular-nums">{money(inn)}</Td>
            <Td className="text-right font-semibold tabular-nums">{money(out)}</Td>
            <Td />
          </tr>
        </tbody>
      </Table>
      <Modal
        open={Boolean(edit)}
        title="Transaction"
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit?.party) return;
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
            <Field label="Kind">
              <Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as TxnKind })}>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
            </Field>
            <Field label="Party" className="col-span-2">
              <Input value={edit.party} onChange={(e) => setEdit({ ...edit, party: e.target.value })} />
            </Field>
            <Field label="In">
              <Input value={String(edit.inflow)} onChange={(e) => setEdit({ ...edit, inflow: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Out">
              <Input value={String(edit.outflow)} onChange={(e) => setEdit({ ...edit, outflow: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Note" className="col-span-2">
              <Input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete transaction?"
        body="This line leaves the diary."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
