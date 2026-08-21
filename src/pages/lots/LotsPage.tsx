import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader, RowActions } from "@/components/ui/Chrome";
import { Field, Input, Select } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { lots as seed, productName, shops, supplierName, products, suppliers } from "@/shared/mock";
import type { Lot } from "@/shared/types";
import { money } from "@/utils/format";

const blank = (): Lot => ({
  id: crypto.randomUUID(),
  productId: products[0].id,
  supplierId: suppliers[0].id,
  branchId: shops[0].id,
  receivedOn: "2026-08-13",
  qtyIn: 0,
  qtyLeft: 0,
  cost: 0,
  min: 0,
  wholesale: 0,
  retail: 0,
});

export function LotsPage() {
  const [rows, setRows] = useState(seed);
  const [edit, setEdit] = useState<Lot | null>(null);
  const [remove, setRemove] = useState<Lot | null>(null);
  const [blocked, setBlocked] = useState(false);

  return (
    <div>
      <PageHeader
        title="Stock lots"
        hint="Each receive creates a lot. Sales take oldest first unless you change that in Settings."
        actions={
          <Button variant="primary" onClick={() => setEdit(blank())}>
            Add lot
          </Button>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>Received</Th>
            <Th>Product</Th>
            <Th>Supplier</Th>
            <Th>Branch</Th>
            <Th className="text-right">Left / in</Th>
            <Th className="text-right">Cost</Th>
            <Th className="text-right">Min</Th>
            <Th className="text-right">Retail</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>{row.receivedOn}</Td>
              <Td>{productName(row.productId)}</Td>
              <Td>{supplierName(row.supplierId)}</Td>
              <Td>{shops.find((s) => s.id === row.branchId)?.name}</Td>
              <Td className="text-right tabular-nums">
                {row.qtyLeft} / {row.qtyIn}
              </Td>
              <Td className="text-right tabular-nums">{money(row.cost)}</Td>
              <Td className="text-right tabular-nums">{money(row.min)}</Td>
              <Td className="text-right tabular-nums">{money(row.retail)}</Td>
              <Td>
                <RowActions
                  onEdit={() => setEdit(row)}
                  onDelete={() => {
                    if (row.qtyLeft !== row.qtyIn) setBlocked(true);
                    else setRemove(row);
                  }}
                />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Modal
        open={Boolean(edit)}
        title="Lot"
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit) return;
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product" className="col-span-2">
              <Select value={edit.productId} onChange={(e) => setEdit({ ...edit, productId: e.target.value })}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier">
              <Select value={edit.supplierId} onChange={(e) => setEdit({ ...edit, supplierId: e.target.value })}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={edit.branchId} onChange={(e) => setEdit({ ...edit, branchId: e.target.value })}>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Qty in">
              <Input value={String(edit.qtyIn)} onChange={(e) => setEdit({ ...edit, qtyIn: Number(e.target.value) || 0, qtyLeft: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Left">
              <Input value={String(edit.qtyLeft)} onChange={(e) => setEdit({ ...edit, qtyLeft: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Cost">
              <Input value={String(edit.cost)} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Min">
              <Input value={String(edit.min)} onChange={(e) => setEdit({ ...edit, min: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Wholesale">
              <Input value={String(edit.wholesale)} onChange={(e) => setEdit({ ...edit, wholesale: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Retail">
              <Input value={String(edit.retail)} onChange={(e) => setEdit({ ...edit, retail: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={blocked}
        title="Cannot delete lot"
        body="Sales already used this lot. Remaining stock must stay for history."
        danger={false}
        confirmLabel="OK"
        onCancel={() => setBlocked(false)}
        onConfirm={() => setBlocked(false)}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete lot?"
        body="Unused lot will be removed."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
