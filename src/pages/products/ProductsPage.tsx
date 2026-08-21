import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, PageHeader, RowActions, SearchBox } from "@/components/ui/Chrome";
import { Field, Input, Select, Toggle } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { products as seed } from "@/shared/mock";
import type { Product } from "@/shared/types";
import { money } from "@/utils/format";

const blank: Product = {
  id: "",
  sku: "",
  name: "",
  unit: "pc",
  isLinear: false,
  packQty: null,
  cost: 0,
  min: 0,
  wholesale: 0,
  retail: 0,
  warrantyDays: 0,
  claims: 0,
  damaged: 0,
  stock: 0,
};

export function ProductsPage() {
  const [rows, setRows] = useState(seed);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Product | null>(null);
  const [remove, setRemove] = useState<Product | null>(null);
  const [blocked, setBlocked] = useState(false);
  const shown = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Products"
        hint="Four prices only. Linear items can sell by meter or by pack. Stock is remaining in the shop."
        actions={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Search product" />
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
            <Th>Sold as</Th>
            <Th className="text-right">Cost</Th>
            <Th className="text-right">Min</Th>
            <Th className="text-right">Wholesale</Th>
            <Th className="text-right">Retail</Th>
            <Th className="text-right">Stock</Th>
            <Th>Claims</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>
                {row.name}
                {row.warrantyDays ? (
                  <span className="ml-2 text-[11px] text-slate-400">{row.warrantyDays}d</span>
                ) : null}
              </Td>
              <Td>
                {row.isLinear ? (
                  <Badge tone="teal">
                    {row.unit} / {row.packQty}
                    {row.unit} pack
                  </Badge>
                ) : (
                  row.unit
                )}
              </Td>
              <Td className="text-right tabular-nums">{money(row.cost)}</Td>
              <Td className="text-right tabular-nums">{money(row.min)}</Td>
              <Td className="text-right tabular-nums">{money(row.wholesale)}</Td>
              <Td className="text-right tabular-nums">{money(row.retail)}</Td>
              <Td className="text-right tabular-nums">
                {row.stock} {row.unit}
              </Td>
              <Td>
                {row.claims || row.damaged ? (
                  <span className="text-[12px] text-amber-700">
                    {row.claims} claim · {row.damaged} dmg
                  </span>
                ) : (
                  "—"
                )}
              </Td>
              <Td>
                <RowActions
                  onEdit={() => setEdit(row)}
                  onDelete={() => {
                    if (row.stock > 0 || row.claims > 0) setBlocked(true);
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
        title="Product"
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" className="col-span-2">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Toggle
              checked={edit.isLinear}
              onChange={(v) => setEdit({ ...edit, isLinear: v, unit: v ? "m" : "pc" })}
              label="Sold by length (wire, pipe)"
            />
            <Field label="Unit">
              <Select
                value={edit.unit}
                onChange={(e) => setEdit({ ...edit, unit: e.target.value as Product["unit"] })}
              >
                <option value="pc">Piece</option>
                <option value="m">Meter</option>
              </Select>
            </Field>
            {edit.isLinear ? (
              <Field label="Pack size">
                <Input
                  value={String(edit.packQty ?? "")}
                  onChange={(e) => setEdit({ ...edit, packQty: Number(e.target.value) || null })}
                />
              </Field>
            ) : null}
            <Field label="Cost">
              <Input value={String(edit.cost)} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Minimum">
              <Input value={String(edit.min)} onChange={(e) => setEdit({ ...edit, min: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Wholesale">
              <Input value={String(edit.wholesale)} onChange={(e) => setEdit({ ...edit, wholesale: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Retail">
              <Input value={String(edit.retail)} onChange={(e) => setEdit({ ...edit, retail: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Warranty days">
              <Input value={String(edit.warrantyDays)} onChange={(e) => setEdit({ ...edit, warrantyDays: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={blocked}
        title="Cannot delete"
        body="This product still has lots or sales history. Clear those first."
        danger={false}
        confirmLabel="OK"
        onCancel={() => setBlocked(false)}
        onConfirm={() => setBlocked(false)}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete product?"
        body={`${remove?.name} has no history in this demo and can be removed.`}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
