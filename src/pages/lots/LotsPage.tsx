import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  BulkAction,
  BulkActions,
  Button,
  Checkbox,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  Field,
  Menu,
  MenuItem,
  PAGE_SIZE_ALL,
  Pagination,
  SelectInput,
  Table,
  Td,
  TextInput,
  THead,
  Th,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { HubToolbar } from "@/pages/products/HubToolbar";
import { LotCostField, UnitQtyFields } from "@/pages/products/LotFields";
import { setLotDamage, setLotQty, syncProductStock } from "@/pages/products/productLots";
import { formatMixedQty, formatStockQty, productSellUnits, unitLabel } from "@/pages/products/productQty";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { staffUsers, supplierName, userName, suppliers } from "@/shared/domain/mock";
import type { ProductLotRow } from "@/shared/domain/types";
import { money } from "@/utils/format";

const PAGE_SIZE = 10;
const COLUMNS = [
  { id: "lot", label: "Lot", locked: true },
  { id: "product", label: "Product" },
  { id: "supplier", label: "Supplier" },
  { id: "received", label: "Received" },
  { id: "cost", label: "Cost" },
  { id: "original", label: "Original" },
  { id: "left", label: "Left" },
  { id: "damaged", label: "Damaged" },
  { id: "by", label: "By" },
];
const blank: ProductLotRow = {
  id: "",
  productId: "p1",
  supplierId: "s1",
  lotNumber: "",
  purchasePrice: 0,
  originalQuantity: 0,
  remainingQuantity: 0,
  damagedQuantity: 0,
  receivedAt: "2026-08-25",
  expiryDate: null,
  createdBy: "u1",
};

export function LotsPage() {
  const { setActions, sectionKpi, lots: rows, setLots: setRows, products, setProducts } = useProductsHub();
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [cols, setCols] = useState(COLUMNS.map((c) => c.id));
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<ProductLotRow | null>(null);
  const [remove, setRemove] = useState<ProductLotRow | null>(null);

  function productOf(id: string) {
    return products.find((p) => p.id === id);
  }

  function mixedQty(productId: string, qty: number) {
    const p = productOf(productId);
    return p ? formatMixedQty(p, qty) : formatStockQty(qty);
  }

  function productLabel(id: string) {
    return productOf(id)?.name ?? id;
  }

  function writeLots(nextLots: ProductLotRow[], productIds: string[]) {
    setRows(nextLots);
    setProducts((prev) => productIds.reduce((acc, id) => syncProductStock(acc, nextLots, id), prev));
  }

  function removeRow(row: ProductLotRow) {
    if (row.remainingQuantity < row.originalQuantity) setRemove(row);
    else {
      writeLots(
        rows.filter((x) => x.id !== row.id),
        [row.productId],
      );
      setSelected((s) => s.filter((id) => id !== row.id));
    }
  }

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  useLayoutEffect(() => {
    setActions(
      <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ ...blank, id: crypto.randomUUID() })}>
        Add lot
      </Button>,
    );
    return () => setActions(null);
  }, [setActions]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const status = chips.find((c) => c.field === "status")?.value;
    return rows.filter((r) => {
      if (needle) {
        const text = `${r.lotNumber} ${productLabel(r.productId)} ${supplierName(r.supplierId)}`.toLowerCase();
        if (!text.includes(needle)) return false;
      }
      if (sectionKpi === "open") return r.remainingQuantity > 0;
      if (sectionKpi === "empty") return r.remainingQuantity <= 0;
      if (status === "Remaining") return r.remainingQuantity > 0;
      if (status === "Empty") return r.remainingQuantity <= 0;
      return true;
    });
  }, [rows, q, chips, sectionKpi, products]);

  const pages = pageSize === PAGE_SIZE_ALL ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = pageSize === PAGE_SIZE_ALL ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const show = (id: string) => cols.includes(id);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  return (
    <div className="products-hub-panel">
      <Table
        toolbar={
          <HubToolbar
            columns={COLUMNS}
            cols={cols}
            onCols={setCols}
            chips={chips}
            onApply={(chip) => {
              setChips((prev) => [...prev.filter((c) => c.field !== chip.field), chip]);
              setPage(1);
            }}
            onRemove={(field) => {
              setChips((c) => c.filter((x) => x.field !== field));
              setPage(1);
            }}
            onClear={() => {
              setChips([]);
              setPage(1);
            }}
            filterFields={[{ id: "status", label: "Status", options: ["Remaining", "Empty"] }]}
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search lots"
            trailing={
              selected.length > 0 ? (
                <BulkActions count={selected.length}>
                  <BulkAction
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() => {
                      const blocked = rows.find((r) => selected.includes(r.id) && r.remainingQuantity < r.originalQuantity);
                      if (blocked) {
                        setRemove(blocked);
                        return;
                      }
                      const ids = [...new Set(rows.filter((r) => selected.includes(r.id)).map((r) => r.productId))];
                      writeLots(
                        rows.filter((r) => !selected.includes(r.id)),
                        ids,
                      );
                      setSelected([]);
                    }}
                  >
                    Delete
                  </BulkAction>
                </BulkActions>
              ) : null
            }
          />
        }
        footer={
          <Pagination
            page={Math.min(page, pages)}
            pages={pages}
            total={filtered.length}
            pageSize={pageSize}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            onChange={setPage}
          />
        }
      >
        <THead>
          <tr>
            <Th className="ui-check-col">
              <Checkbox
                checked={allShownSelected}
                onChange={(e) => {
                  if (e.target.checked) setSelected((s) => [...new Set([...s, ...shown.map((r) => r.id)])]);
                  else setSelected((s) => s.filter((id) => !shown.some((r) => r.id === id)));
                }}
              />
            </Th>
            <Th>Lot</Th>
            {show("product") ? <Th>Product</Th> : null}
            {show("supplier") ? <Th>Supplier</Th> : null}
            {show("received") ? <Th>Received</Th> : null}
            {show("cost") ? <Th>Cost</Th> : null}
            {show("original") ? <Th>Original</Th> : null}
            {show("left") ? <Th>Left</Th> : null}
            {show("damaged") ? <Th>Damaged</Th> : null}
            {show("by") ? <Th>By</Th> : null}
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={cols.length + 2} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td className="ui-check-col">
                <Checkbox
                  checked={selected.includes(row.id)}
                  onChange={(e) => {
                    setSelected((s) => (e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id)));
                  }}
                />
              </Td>
              <Td>{row.lotNumber}</Td>
              {show("product") ? <Td>{productLabel(row.productId)}</Td> : null}
              {show("supplier") ? <Td>{supplierName(row.supplierId)}</Td> : null}
              {show("received") ? <Td>{row.receivedAt}</Td> : null}
              {show("cost") ? (
                <Td numeric>
                  {money(row.purchasePrice)}/{unitLabel(productOf(row.productId)?.unit ?? "")}
                </Td>
              ) : null}
              {show("original") ? <Td numeric>{mixedQty(row.productId, row.originalQuantity)}</Td> : null}
              {show("left") ? (
                <Td numeric>
                  <Badge tone={row.remainingQuantity <= 0 ? "danger" : "ok"}>{mixedQty(row.productId, row.remainingQuantity)}</Badge>
                </Td>
              ) : null}
              {show("damaged") ? <Td numeric>{mixedQty(row.productId, row.damagedQuantity)}</Td> : null}
              {show("by") ? <Td>{userName(row.createdBy)}</Td> : null}
              <Td>
                <Menu>
                  <MenuItem icon={<Pencil size={14} />} onClick={() => setEdit(row)}>
                    Edit
                  </MenuItem>
                  <MenuItem danger icon={<Trash2 size={14} />} onClick={() => removeRow(row)}>
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
        title={edit?.lotNumber ? "Edit lot" : "Add lot"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!edit?.lotNumber || !edit.originalQuantity) return;
                const damaged = edit.damagedQuantity ?? 0;
                const exists = rows.some((r) => r.id === edit.id);
                const next = {
                  ...edit,
                  damagedQuantity: damaged,
                  remainingQuantity: exists
                    ? Math.max(0, edit.remainingQuantity)
                    : Math.max(0, edit.originalQuantity - damaged),
                };
                const prev = rows.find((r) => r.id === next.id);
                const list = exists ? rows.map((r) => (r.id === next.id ? next : r)) : [...rows, next];
                writeLots(list, [...new Set([next.productId, prev?.productId].filter(Boolean) as string[])]);
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
            <Field label="Lot number">
              <TextInput value={edit.lotNumber} onChange={(e) => setEdit({ ...edit, lotNumber: e.target.value })} />
            </Field>
            <Field label="Product">
              <SelectInput
                value={edit.productId}
                onChange={(e) => {
                  const id = e.target.value;
                  const p = productOf(id);
                  setEdit({ ...edit, productId: id, purchasePrice: p?.cost ?? edit.purchasePrice });
                }}
              >
                {products.map((p) => (
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
            {(() => {
              const item = productOf(edit.productId);
              const units = item ? productSellUnits(item) : [];
              const stockSymbol = item?.unit ?? "pc";
              const exists = rows.some((r) => r.id === edit.id);
              if (!item || !units.length) return null;
              return (
                <>
                  <LotCostField
                    units={units}
                    stockSymbol={stockSymbol}
                    value={edit.purchasePrice}
                    onChange={(n) => setEdit({ ...edit, purchasePrice: n })}
                  />
                  <UnitQtyFields
                    label="Quantity in"
                    units={units}
                    stockSymbol={stockSymbol}
                    value={edit.originalQuantity}
                    onChange={(n) =>
                      setEdit({
                        ...edit,
                        originalQuantity: n,
                        remainingQuantity: exists ? edit.remainingQuantity : Math.max(0, n - (edit.damagedQuantity ?? 0)),
                      })
                    }
                  />
                  {exists ? (
                    <UnitQtyFields
                      label="Qty left"
                      units={units}
                      stockSymbol={stockSymbol}
                      value={edit.remainingQuantity}
                      onChange={(n) => setEdit(setLotQty(edit, n))}
                    />
                  ) : null}
                  <UnitQtyFields
                    label="Damaged"
                    units={units}
                    stockSymbol={stockSymbol}
                    value={edit.damagedQuantity ?? 0}
                    onChange={(n) => {
                      if (exists) setEdit(setLotDamage(edit, n));
                      else setEdit({ ...edit, damagedQuantity: n, remainingQuantity: Math.max(0, edit.originalQuantity - n) });
                    }}
                  />
                </>
              );
            })()}
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
