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
  TableRowsSkeleton,
  Td,
  TextInput,
  THead,
  Th,
  toaster,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import { CATEGORY_COPY, CATEGORY_TABLE_COLUMNS } from "@/shared/constants/products";
import { FORM_COPY } from "@/shared/constants/fields";
import { createMasterRecord, deleteMasterRecord, updateMasterRecord } from "@/services/masters";
import { useAppForm } from "@/hooks/useAppForm";
import { fieldMessage, requiredTrim } from "@/utils/form";
import { shortError } from "@/utils/format";

type CategoryRow = { id: string; name: string };

const CATEGORY_FORM_ID = "category-form";
const blank: CategoryRow = { id: "", name: "" };

function categoryProductCount(
  category: CategoryRow,
  products: { category: string; categoryId?: string }[],
) {
  return products.filter(
    (product) => product.categoryId === category.id || product.category === category.name,
  ).length;
}

function CategoryEditForm({
  row,
  onValid,
}: {
  row: CategoryRow;
  onValid: (values: { name: string }) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useAppForm({
    defaultValues: { name: row.name },
  });
  return (
    <form id={CATEGORY_FORM_ID} onSubmit={handleSubmit(onValid)}>
      <Field label="Name" error={fieldMessage(errors, "name")}>
        <TextInput
          placeholder="Wire"
          {...register("name", { validate: requiredTrim(FORM_COPY.nameRequired) })}
        />
      </Field>
    </form>
  );
}

export function CategoriesPage() {
  const {
    setActions,
    sectionKpi,
    products,
    categories,
    refreshHub,
    loading: hubLoading,
  } = useProductsHub();
  const rows = categories;
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cols, setCols] = useState(CATEGORY_TABLE_COLUMNS.map((c) => c.id));
  const [view, setView] = useState<HubView>("table");
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<CategoryRow | null>(null);
  const [remove, setRemove] = useState<CategoryRow | null>(null);
  const [loading, setLoading] = useState({ saving: false, deleting: false });

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  useLayoutEffect(() => {
    setActions(
      <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ ...blank })}>
        Add category
      </Button>,
    );
    return () => setActions(null);
  }, [setActions]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const nameChip = chips.find((c) => c.field === "name")?.value.toLowerCase();
    return rows.filter((r) => {
      const count = categoryProductCount(r, products);
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      if (sectionKpi === "used") return count > 0;
      if (sectionKpi === "empty") return count === 0;
      if (nameChip && !r.name.toLowerCase().includes(nameChip)) return false;
      return true;
    });
  }, [rows, q, chips, sectionKpi, products]);

  const pages = pageSize === PAGE_SIZE_ALL ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown =
    pageSize === PAGE_SIZE_ALL ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const chartData = filtered
    .map((row) => ({
      id: row.id,
      label: row.name,
      value: categoryProductCount(row, products),
    }))
    .sort((a, b) => b.value - a.value);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));
  const isNew = Boolean(edit && !edit.id);

  async function saveCategory(values: { name: string }) {
    if (!edit) return;
    setLoading((current) => ({ ...current, saving: true }));
    try {
      const payload = { name: values.name.trim(), isActive: true };
      if (isNew) await createMasterRecord("categories", payload);
      else await updateMasterRecord("categories", edit.id, payload);
      setEdit(null);
      await refreshHub();
      toaster.success(isNew ? CATEGORY_COPY.added : CATEGORY_COPY.saved);
    } catch (error) {
      toaster.error(shortError(error, CATEGORY_COPY.saveFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, saving: false }));
    }
  }

  async function deleteCategories(ids: string[]) {
    if (ids.length === 0) return;
    setLoading((current) => ({ ...current, deleting: true }));
    try {
      await Promise.all(ids.map((id) => deleteMasterRecord("categories", id)));
      setSelected((current) => current.filter((id) => !ids.includes(id)));
      await refreshHub();
      toaster.success(ids.length === 1 ? CATEGORY_COPY.deleted : CATEGORY_COPY.deletedMany);
    } catch (error) {
      toaster.error(shortError(error, CATEGORY_COPY.deleteFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, deleting: false }));
    }
  }

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      <Table
        toolbar={
          <HubToolbar
            columns={CATEGORY_TABLE_COLUMNS}
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
                      if (!loading.deleting) void deleteCategories(selected);
                    }}
                  >
                    Delete
                  </BulkAction>
                </BulkActions>
              ) : null
            }
          />
        }
        body={
          view === "insights" ? (
            <HubChart type="donut" title="Products by category" data={chartData} />
          ) : undefined
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
                  if (e.target.checked)
                    setSelected((s) => [...new Set([...s, ...shown.map((r) => r.id)])]);
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
          {hubLoading.hub ? (
            <TableRowsSkeleton columnCount={cols.length} rows={6} selectable hasActions />
          ) : null}
          {!hubLoading.hub && shown.length === 0 ? <EmptyRow cols={cols.length + 2} /> : null}
          {!hubLoading.hub
            ? shown.map((row) => (
                <tr key={row.id}>
                  <Td className="ui-check-col">
                    <Checkbox
                      checked={selected.includes(row.id)}
                      onChange={(e) => {
                        setSelected((s) =>
                          e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id),
                        );
                      }}
                    />
                  </Td>
                  <Td>{row.name}</Td>
                  {cols.includes("products") ? (
                    <Td numeric>{categoryProductCount(row, products)}</Td>
                  ) : null}
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
              ))
            : null}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(edit)}
        title={edit?.name ? "Edit category" : "Add category"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)} disabled={loading.saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={CATEGORY_FORM_ID}
              disabled={loading.saving}
            >
              {loading.saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {edit ? (
          <CategoryEditForm
            key={edit.id || "new"}
            row={edit}
            onValid={(values) => void saveCategory(values)}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete category?"
        body="Products still using this category will need a new group before save in the live app."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) void deleteCategories([remove.id]).then(() => setRemove(null));
          else setRemove(null);
        }}
      />
    </div>
  );
}
