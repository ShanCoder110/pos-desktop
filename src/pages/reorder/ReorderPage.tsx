import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, PageHeader, RowActions } from "@/components/ui/Chrome";
import { Field, Input, Select } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { productName, products, reorderLines as seed, supplierName, suppliers } from "@/shared/mock";
import type { ReorderLine } from "@/shared/types";
import { money } from "@/utils/format";

export function ReorderPage() {
  const [rows, setRows] = useState(seed);
  const [edit, setEdit] = useState<ReorderLine | null>(null);
  const [remove, setRemove] = useState<ReorderLine | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState(suppliers[0].id);
  const [qty, setQty] = useState("1");

  return (
    <div>
      <PageHeader
        title="Reorder"
        hint="Click Reorder on a product, pick supplier and qty. Receive creates a new lot on the main branch."
      />
      <div className="mb-3 rounded-md border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Catalog</p>
        <div className="grid grid-cols-2 gap-1">
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded border border-slate-100 px-2 py-1.5">
              <div>
                <p>{p.name}</p>
                <p className="text-[11px] text-slate-500">
                  Shop {p.stock} {p.unit} · cost {money(p.cost)}
                </p>
              </div>
              <Button size="sm" variant="soft" onClick={() => { setPick(p.id); setQty("1"); }}>
                Reorder
              </Button>
            </div>
          ))}
        </div>
      </div>
      <Table>
        <THead>
          <tr>
            <Th>Product</Th>
            <Th>Supplier</Th>
            <Th className="text-right">Qty</Th>
            <Th className="text-right">Cost</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>{productName(row.productId)}</Td>
              <Td>{supplierName(row.supplierId)}</Td>
              <Td className="text-right">{row.qty}</Td>
              <Td className="text-right tabular-nums">{money(row.cost)}</Td>
              <Td>
                {row.received ? <Badge tone="emerald">Received</Badge> : <Badge tone="amber">Open</Badge>}
              </Td>
              <Td>
                <div className="flex justify-end gap-1">
                  {!row.received ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, received: true } : r)))}
                    >
                      Receive
                    </Button>
                  ) : null}
                  <RowActions onEdit={() => setEdit(row)} onDelete={() => setRemove(row)} />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Modal
        open={Boolean(pick)}
        title="Add to reorder"
        onClose={() => setPick(null)}
        footer={
          <>
            <Button onClick={() => setPick(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!pick) return;
                const product = products.find((p) => p.id === pick)!;
                setRows((p) => [
                  {
                    id: crypto.randomUUID(),
                    productId: pick,
                    supplierId,
                    qty: Number(qty) || 1,
                    cost: product.cost,
                    received: false,
                  },
                  ...p,
                ]);
                setPick(null);
              }}
            >
              Add
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <p>{pick ? productName(pick) : ""}</p>
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Qty">
            <Input value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
      </Modal>
      <Modal
        open={Boolean(edit)}
        title="Update reorder"
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
            <Field label="Supplier">
              <Select value={edit.supplierId} onChange={(e) => setEdit({ ...edit, supplierId: e.target.value })}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Qty">
              <Input value={String(edit.qty)} onChange={(e) => setEdit({ ...edit, qty: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Cost">
              <Input value={String(edit.cost)} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete reorder line?"
        body="This line will be removed from the order."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
