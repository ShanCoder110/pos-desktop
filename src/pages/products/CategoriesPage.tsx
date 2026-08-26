import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  BulkAction,
  BulkActions,
  Button,
  Checkbox,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  HubChart,
  Field,
  Menu,
  MenuItem,
  PAGE_SIZE_ALL,
  Pagination,
  Table,
  Td,
  TextInput,
  THead,
  Th,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { productCategories, products as catalog } from "@/shared/mock";

type CategoryRow = { id: string; name: string };

const PAGE_SIZE = 10;
const COLUMNS = [
  { id: "name", label: "Name", locked: true },
  { id: "products", label: "Products" },
];
const blank: CategoryRow = { id: "", name: "" };

function seedRows(): CategoryRow[] {
  return productCategories.map((name, i) => ({ id: `cat${i + 1}`, name }));
}

export function CategoriesPage() {
  const { setActions, sectionKpi } = useProductsHub();
  const [rows, setRows] = useState(seedRows);
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [cols, setCols] = useState(COLUMNS.map((c) => c.id));
  const [view, setView] = useState<HubView>("table");
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<CategoryRow | null>(null);
  const [remove, setRemove] = useState<CategoryRow | null>(null);

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  useLayoutEffect(() => {
    setActions(
      <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ ...blank, id: crypto.randomUUID() })}>
        Add category
      </Button>,
    );
    return () => setActions(null);
  }, [setActions]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const nameChip = chips.find((c) => c.field === "name")?.value.toLowerCase();
    return rows.filter((r) => {
      const count = catalog.filter((p) => p.category === r.name).length;
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      if (sectionKpi === "used") return count > 0;
      if (sectionKpi === "empty") return count === 0;
      if (nameChip && !r.name.toLowerCase().includes(nameChip)) return false;
      return true;
    });
  }, [rows, q, chips, sectionKpi]);

  const pages = pageSize === PAGE_SIZE_ALL ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = pageSize === PAGE_SIZE_ALL ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const chartData = filtered
    .map((row) => ({ id: row.id, label: row.name, value: catalog.filter((product) => product.category === row.name).length }))
    .sort((a, b) => b.value - a.value);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
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
            filterFields={[{ id: "name", label: "Name" }]}
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search categories"
            view={view}
            onView={setView}
            trailing={
              selected.length > 0 ? (
                <BulkActions count={selected.length}>
                  <BulkAction
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() => {
                      setRows((p) => p.filter((r) => !selected.includes(r.id)));
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
        body={view !== "table" ? <HubChart type={view} title="Products by category" data={chartData} /> : undefined}
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
            <Th>Name</Th>
            {cols.includes("products") ? <Th>Products</Th> : null}
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
              <Td>{row.name}</Td>
              {cols.includes("products") ? <Td numeric>{catalog.filter((p) => p.category === row.name).length}</Td> : null}
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
        title={edit?.name ? "Edit category" : "Add category"}
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
          <Field label="Name">
            <TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Wire" />
          </Field>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete category?"
        body="Products still using this category will need a new group before save in the live app."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) {
            setRows((p) => p.filter((r) => r.id !== remove.id));
            setSelected((s) => s.filter((id) => id !== remove.id));
          }
          setRemove(null);
        }}
      />
    </div>
  );
}
