import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, PageHeader, RowActions } from "@/components/ui/Chrome";
import { Field, Input, Select } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { customerName, customers, productName, products, returns as seed, supplierName, suppliers } from "@/shared/mock";
import type { ReturnKind, ReturnTicket } from "@/shared/types";

const kinds: { id: ReturnKind; label: string; restock: boolean }[] = [
  { id: "refund", label: "Refund", restock: true },
  { id: "exchange", label: "Exchange", restock: true },
  { id: "claim", label: "Claim", restock: false },
  { id: "damage", label: "Damage", restock: false },
];

export function ReturnsPage() {
  const [rows, setRows] = useState(seed);
  const [edit, setEdit] = useState<ReturnTicket | null>(null);
  const [remove, setRemove] = useState<ReturnTicket | null>(null);

  return (
    <div>
      <PageHeader
        title="Returns"
        hint="Refund / exchange put stock back in the old lot. Claim / damage do not. Tag a supplier if you need to track it."
        actions={
          <Button
            variant="primary"
            onClick={() =>
              setEdit({
                id: crypto.randomUUID(),
                date: "2026-08-13",
                customerId: customers[1].id,
                productId: products[0].id,
                qty: 1,
                kind: "refund",
                supplierId: "",
              })
            }
          >
            Add
          </Button>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>Date</Th>
            <Th>Customer</Th>
            <Th>Product</Th>
            <Th>Qty</Th>
            <Th>Kind</Th>
            <Th>Supplier</Th>
            <Th>Stock</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {rows.map((row) => {
            const restock = row.kind === "refund" || row.kind === "exchange";
            return (
              <tr key={row.id}>
                <Td>{row.date}</Td>
                <Td>{customerName(row.customerId)}</Td>
                <Td>{productName(row.productId)}</Td>
                <Td>{row.qty}</Td>
                <Td>
                  <Badge tone={restock ? "teal" : "amber"}>{row.kind}</Badge>
                </Td>
                <Td>{row.supplierId ? supplierName(row.supplierId) : "—"}</Td>
                <Td className="text-[12px] text-slate-500">{restock ? "Back to lot" : "Not sellable"}</Td>
                <Td>
                  <RowActions onEdit={() => setEdit(row)} onDelete={() => setRemove(row)} />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Modal
        open={Boolean(edit)}
        title="Return"
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit) return;
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
            <Field label="Customer">
              <Select value={edit.customerId} onChange={(e) => setEdit({ ...edit, customerId: e.target.value })}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Product">
              <Select value={edit.productId} onChange={(e) => setEdit({ ...edit, productId: e.target.value })}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Qty">
              <Input value={String(edit.qty)} onChange={(e) => setEdit({ ...edit, qty: Number(e.target.value) || 1 })} />
            </Field>
            <Field label="Kind">
              <Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as ReturnKind })}>
                {kinds.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                    {k.restock ? " — back to stock" : " — not sellable"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier (optional)">
              <Select value={edit.supplierId} onChange={(e) => setEdit({ ...edit, supplierId: e.target.value })}>
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete return?"
        body="This ticket will be removed."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
