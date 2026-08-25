import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  Field,
  KpiCard,
  PageHead,
  Pagination,
  SearchInput,
  SelectInput,
  Table,
  Tabs,
  Td,
  TextInput,
  THead,
  Th,
} from "@/components/common";
import { productLots as seed, catalog, productName, staffUsers, supplierName, userName, suppliers } from "@/shared/domain/mock";
import type { ProductLotRow } from "@/shared/domain/types";
import { money } from "@/utils/format";

const PAGE = 10;
const blank: ProductLotRow = {
  id: "",
  productId: "p1",
  supplierId: "s1",
  lotNumber: "",
  purchasePrice: 0,
  originalQuantity: 0,
  remainingQuantity: 0,
  receivedAt: "2026-08-25",
  expiryDate: null,
  createdBy: "u1",
};

export function LotsPage() {
  const [rows, setRows] = useState(seed);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<ProductLotRow | null>(null);
  const [remove, setRemove] = useState<ProductLotRow | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const text = `${r.lotNumber} ${productName(r.productId)} ${supplierName(r.supplierId)}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (tab === "open") return r.remainingQuantity > 0;
      if (tab === "empty") return r.remainingQuantity <= 0;
      return true;
    });
  }, [rows, q, tab]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="ui-stack">
      <PageHead title="Lots">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ ...blank, id: crypto.randomUUID() })}>
          Receive lot
        </Button>
      </PageHead>
      <p className="ui-note">
        Each supplier delivery is a new ProductLot. POS sells remaining_quantity oldest-first. This is also how you restock — there is no separate reorder document in V1.
      </p>
      <div className="ui-kpi-row">
        <KpiCard label="Open lots" value={rows.filter((r) => r.remainingQuantity > 0).length} hint="Still on shelf" tone="ok" />
        <KpiCard label="Empty" value={rows.filter((r) => r.remainingQuantity <= 0).length} hint="Fully sold" tone="stale" />
        <KpiCard label="Value left" value={money(rows.reduce((s, r) => s + r.remainingQuantity * r.purchasePrice, 0))} hint="At purchase price" tone="ok" />
      </div>
      <Tabs
        value={tab}
        onChange={(id) => {
          setTab(id);
          setPage(1);
        }}
        items={[
          { id: "all", label: "All" },
          { id: "open", label: "Remaining" },
          { id: "empty", label: "Empty" },
        ]}
      />
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Lot, product, supplier" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={filtered.length} onChange={setPage} />}
      >
        <THead>
          <tr>
            <Th>Lot</Th>
            <Th>Product</Th>
            <Th>Supplier</Th>
            <Th>Received</Th>
            <Th>Cost</Th>
            <Th>Original</Th>
            <Th>Left</Th>
            <Th>By</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={9} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{row.lotNumber}</Td>
              <Td>{productName(row.productId)}</Td>
              <Td>{supplierName(row.supplierId)}</Td>
              <Td>{row.receivedAt}</Td>
              <Td numeric>{money(row.purchasePrice)}</Td>
              <Td numeric>{row.originalQuantity}</Td>
              <Td numeric>
                <Badge tone={row.remainingQuantity <= 0 ? "danger" : "ok"}>{row.remainingQuantity}</Badge>
              </Td>
              <Td>{userName(row.createdBy)}</Td>
              <Td>
                <Button
                  size="sm"
                  onClick={() => {
                    if (row.remainingQuantity < row.originalQuantity) setRemove(row);
                    else setRows((p) => p.filter((x) => x.id !== row.id));
                  }}
                >
                  Delete
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(edit)}
        title="Receive lot"
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit?.lotNumber || !edit.originalQuantity) return;
                setRows((p) => [...p, { ...edit, remainingQuantity: edit.originalQuantity }]);
                setEdit(null);
              }}
            >
              Save — writes PURCHASE movement
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="ui-stack">
            <p className="ui-note">Saving adds remaining_quantity to stock and a StockMovement PURCHASE.</p>
            <Field label="Lot number">
              <TextInput value={edit.lotNumber} onChange={(e) => setEdit({ ...edit, lotNumber: e.target.value })} />
            </Field>
            <Field label="Product">
              <SelectInput value={edit.productId} onChange={(e) => setEdit({ ...edit, productId: e.target.value })}>
                {catalog.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Supplier">
              <SelectInput value={edit.supplierId} onChange={(e) => setEdit({ ...edit, supplierId: e.target.value })}>
                {suppliers.filter((s) => s.isActive).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Purchase price (per base unit)">
              <TextInput value={String(edit.purchasePrice)} onChange={(e) => setEdit({ ...edit, purchasePrice: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Quantity in">
              <TextInput value={String(edit.originalQuantity)} onChange={(e) => setEdit({ ...edit, originalQuantity: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Received by">
              <SelectInput value={edit.createdBy} onChange={(e) => setEdit({ ...edit, createdBy: e.target.value })}>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Cannot delete lot"
        body="Sales already used this lot. Remaining stock must stay for history."
        danger={false}
        confirmLabel="OK"
        onCancel={() => setRemove(null)}
        onConfirm={() => setRemove(null)}
      />
    </div>
  );
}
