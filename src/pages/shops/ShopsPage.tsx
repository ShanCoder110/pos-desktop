import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, PageHeader, RowActions } from "@/components/ui/Chrome";
import { Field, Input, Select } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { shops as seed } from "@/shared/mock";
import type { BranchKind, Shop } from "@/shared/types";

export function ShopsPage() {
  const [rows, setRows] = useState(seed);
  const [edit, setEdit] = useState<Shop | null>(null);
  const [remove, setRemove] = useState<Shop | null>(null);

  return (
    <div>
      <PageHeader
        title="Branches"
        hint="Retail counter and repair bench share stock lots. Main branch receives purchases."
        actions={
          <Button
            variant="primary"
            onClick={() =>
              setEdit({ id: crypto.randomUUID(), name: "", kind: "retail", city: "Lahore", isMain: false })
            }
          >
            Add
          </Button>
        }
      />
      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Kind</Th>
            <Th>City</Th>
            <Th>Role</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>{row.name}</Td>
              <Td className="capitalize">{row.kind}</Td>
              <Td>{row.city}</Td>
              <Td>{row.isMain ? <Badge tone="teal">Main</Badge> : <Badge>Till</Badge>}</Td>
              <Td>
                <RowActions onEdit={() => setEdit(row)} onDelete={() => setRemove(row)} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Modal
        open={Boolean(edit)}
        title="Branch"
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit?.name) return;
                setRows((p) => (p.some((r) => r.id === edit.id) ? p.map((r) => (r.id === edit.id ? edit : r)) : [...p, edit]));
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
            <Field label="Kind">
              <Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as BranchKind })}>
                <option value="retail">Retail</option>
                <option value="repair">Repair</option>
              </Select>
            </Field>
            <Field label="City">
              <Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete branch?"
        body={remove?.isMain ? "Main branch cannot be deleted." : `${remove?.name} will be removed.`}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove && !remove.isMain) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
