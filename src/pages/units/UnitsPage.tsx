import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  Field,
  Menu,
  MenuItem,
  PageHead,
  Table,
  Td,
  TextInput,
  THead,
  Th,
} from "@/components/common";
import { units as seed } from "@/shared/domain/mock";
import type { UnitRow } from "@/shared/domain/types";

const blank: UnitRow = { id: "", name: "", symbol: "" };

export function UnitsPage() {
  const [rows, setRows] = useState(seed);
  const [edit, setEdit] = useState<UnitRow | null>(null);
  const [remove, setRemove] = useState<UnitRow | null>(null);

  return (
    <div className="ui-stack">
      <PageHead title="Units">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ ...blank, id: crypto.randomUUID() })}>
          Add unit
        </Button>
      </PageHead>
      <p className="ui-note">
        Base unit sits on Product. Extra sell units (90m roll, pack of 12) live on ProductUnit with conversion_quantity. POS always stocks in the base unit.
      </p>
      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Symbol</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? <EmptyRow cols={3} /> : null}
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>{row.name}</Td>
              <Td>{row.symbol}</Td>
              <Td>
                <Menu>
                  <MenuItem icon={<Pencil size={14} />} onClick={() => setEdit(row)}>
                    Edit
                  </MenuItem>
                  <MenuItem danger icon={<Trash2 size={14} />} onClick={() => setRemove(row)}>
                    Delete
                  </MenuItem>
                </Menu>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(edit)}
        title={edit?.name ? "Edit unit" : "Add unit"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit?.name || !edit.symbol) return;
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
          <div className="ui-stack">
            <Field label="Name">
              <TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Meter" />
            </Field>
            <Field label="Symbol">
              <TextInput value={edit.symbol} onChange={(e) => setEdit({ ...edit, symbol: e.target.value })} placeholder="m" />
            </Field>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete unit?"
        body="Products still using this unit as base_unit_id cannot be saved in the live app."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) setRows((p) => p.filter((r) => r.id !== remove.id));
          setRemove(null);
        }}
      />
    </div>
  );
}
