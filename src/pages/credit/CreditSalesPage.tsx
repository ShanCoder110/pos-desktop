import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader, RowActions } from "@/components/ui/Chrome";
import { Field, Input, Select } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { creditSales as seed, customerName, customers, products, suppliers } from "@/shared/mock";
import { useSettings } from "@/shared/settings";
import type { CreditSale, InvoiceLine } from "@/shared/types";
import { money } from "@/utils/format";
import { consumeLots } from "@/utils/lots";

export function CreditSalesPage() {
  const { settings } = useSettings();
  const [rows, setRows] = useState(seed);
  const [edit, setEdit] = useState<CreditSale | null>(null);
  const [remove, setRemove] = useState<CreditSale | null>(null);
  const [creating, setCreating] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [q, setQ] = useState("");
  const [qty, setQty] = useState("1");
  const [supplierId, setSupplierId] = useState("");

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return products.filter((p) => p.name.toLowerCase().includes(s)).slice(0, 6);
  }, [q]);

  function addLine(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const result = consumeLots(product, Number(qty) || 1, settings.stockPick, supplierId || undefined);
    if ("error" in result) return;
    setLines((p) => [
      ...p,
      {
        id: crypto.randomUUID(),
        productId: product.id,
        name: product.name,
        qty: Number(qty) || 1,
        unit: product.unit,
        price: result.price,
        minFloor: result.minFloor,
        lotsNote: result.lotsNote,
      },
    ]);
    setQ("");
  }

  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const customer = customers.find((c) => c.id === customerId);

  return (
    <div>
      <PageHeader
        title="Credit sale"
        hint="Pick a customer first, then add products. Same lot rules as POS. No cash drawer."
        actions={
          <Button variant="primary" onClick={() => { setCreating(true); setCustomerId(""); setLines([]); }}>
            New credit sale
          </Button>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>No</Th>
            <Th>Date</Th>
            <Th>Customer</Th>
            <Th className="text-right">Total</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>{row.no}</Td>
              <Td>{row.date}</Td>
              <Td>{customerName(row.customerId)}</Td>
              <Td className="text-right tabular-nums">{money(row.total)}</Td>
              <Td>
                <RowActions onEdit={() => setEdit(row)} onDelete={() => setRemove(row)} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal
        open={creating}
        title="Credit sale"
        wide
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!customerId || !lines.length}
              onClick={() => {
                setRows((p) => [
                  {
                    id: crypto.randomUUID(),
                    no: `CR-${220 + p.length + 1}`,
                    date: "2026-08-13",
                    customerId,
                    lines,
                    total,
                  },
                  ...p,
                ]);
                setCreating(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Customer">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select customer</option>
              {customers.filter((c) => !c.isWalking).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.balance < 0 ? `(owes ${money(-c.balance)})` : c.balance > 0 ? `(adv ${money(c.balance)})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          {customer ? (
            <p className="text-[12px] text-slate-500">
              After {money(total)} unpaid, khata becomes{" "}
              {customer.balance - total < 0
                ? `owes ${money(-(customer.balance - total))}`
                : customer.balance - total > 0
                  ? `advance ${money(customer.balance - total)}`
                  : "settled"}
            </p>
          ) : null}
          {settings.stockPick === "ask" ? (
            <Field label="Supplier for next line">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) addLine(results[0].id);
              }}
              placeholder="Search product, Enter, then qty"
            />
            <Input className="w-20" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          {results.map((p) => (
            <button key={p.id} className="rounded border border-slate-200 px-2 py-1 text-left hover:bg-slate-50" onClick={() => addLine(p.id)}>
              {p.name} · shop {p.stock} {p.unit}
            </button>
          ))}
          {lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between text-[13px]">
              <span>
                {line.qty} {line.unit} {line.name}
                <span className="ml-2 text-[11px] text-slate-400">{line.lotsNote}</span>
              </span>
              <span className="flex items-center gap-2">
                {money(line.qty * line.price)}
                <button onClick={() => setLines((p) => p.filter((l) => l.id !== line.id))}>
                  <Trash2 size={13} className="text-rose-600" />
                </button>
              </span>
            </div>
          ))}
        </div>
      </Modal>
      <Modal
        open={Boolean(edit)}
        title="Update credit sale"
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
          <Field label="Customer">
            <Select value={edit.customerId} onChange={(e) => setEdit({ ...edit, customerId: e.target.value })}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete credit sale?"
        body="Customer khata from this sale should be reversed in the live app."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
