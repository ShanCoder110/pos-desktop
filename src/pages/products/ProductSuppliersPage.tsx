import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import {
  BulkAction,
  BulkActions,
  Button,
  Checkbox,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  HubExportMenu,
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
import { applyFilterChip } from "@/utils/filterChips";
import { compareNameSearch } from "@/utils/salePricing";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { supplierProductCount } from "@/pages/products/hubSupplierFilters";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import {
  HUB_SUPPLIER_COPY,
  HUB_SUPPLIER_TABLE_COLUMNS,
  productsSupplierHref,
} from "@/shared/constants/products";
import { FORM_COPY } from "@/shared/constants/fields";
import { createMasterRecord, deleteMasterRecord, updateMasterRecord } from "@/services/masters";
import { useAppForm } from "@/hooks/useAppForm";
import { fieldMessage, requiredTrim } from "@/utils/form";
import { shortError } from "@/utils/format";

type SupplierRow = { id: string; name: string };

const SUPPLIER_FORM_ID = "hub-supplier-form";
const blank: SupplierRow = { id: "", name: "" };

function SupplierEditForm({
  row,
  onValid,
}: {
  row: SupplierRow;
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
    <form id={SUPPLIER_FORM_ID} onSubmit={handleSubmit(onValid)}>
      <Field label="Name" error={fieldMessage(errors, "name")}>
        <TextInput
          placeholder="Ali Traders"
          {...register("name", { validate: requiredTrim(FORM_COPY.nameRequired) })}
        />
      </Field>
    </form>
  );
}

export function ProductSuppliersPage() {
  const navigate = useNavigate();
  const {
    setActions,
    sectionKpi,
    products,
    lots,
    suppliers,
    refreshHub,
    loading: hubLoading,
  } = useProductsHub();
  const rows = suppliers;
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_ALL);
  const [cols, setCols] = useState(HUB_SUPPLIER_TABLE_COLUMNS.map((c) => c.id));
  const [view, setView] = useState<HubView>("table");
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<SupplierRow | null>(null);
  const [remove, setRemove] = useState<SupplierRow | null>(null);
  const [loading, setLoading] = useState({ saving: false, deleting: false });

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const nameChip = chips.find((c) => c.field === "name")?.value.toLowerCase();
    const list = rows.filter((r) => {
      const count = supplierProductCount(r.id, products, lots);
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      if (sectionKpi === "used") return count > 0;
      if (sectionKpi === "empty") return count === 0;
      if (nameChip && !r.name.toLowerCase().includes(nameChip)) return false;
      return true;
    });
    if (!needle) return list;
    return [...list].sort((a, b) => compareNameSearch(a.name, b.name, needle));
  }, [rows, q, chips, sectionKpi, products, lots]);

  useLayoutEffect(() => {
    setActions(
      <>
        <HubExportMenu
          filename="product-suppliers"
          sheetName="Suppliers"
          rows={filtered}
          columns={[
            { label: "Name", value: (row) => row.name },
            { label: "Products", value: (row) => supplierProductCount(row.id, products, lots) },
          ]}
        />
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ ...blank })}>
          {HUB_SUPPLIER_COPY.addAction}
        </Button>
      </>,
    );
    return () => setActions(null);
  }, [filtered, lots, products, setActions]);

  const pages = pageSize === PAGE_SIZE_ALL ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown =
    pageSize === PAGE_SIZE_ALL ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const chartData = filtered
    .map((row) => ({
      id: row.id,
      label: row.name,
      value: supplierProductCount(row.id, products, lots),
    }))
    .sort((a, b) => b.value - a.value);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));
  const isNew = Boolean(edit && !edit.id);

  async function saveSupplier(values: { name: string }) {
    if (!edit) return;
    setLoading((current) => ({ ...current, saving: true }));
    try {
      const payload = { name: values.name.trim(), isActive: true };
      if (isNew) await createMasterRecord("suppliers", payload);
      else await updateMasterRecord("suppliers", edit.id, payload);
      setEdit(null);
      await refreshHub(undefined, { quiet: true });
      toaster.success(isNew ? HUB_SUPPLIER_COPY.added : HUB_SUPPLIER_COPY.saved);
    } catch (error) {
      toaster.error(shortError(error, HUB_SUPPLIER_COPY.saveFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, saving: false }));
    }
  }

  function openSupplier(supplier: SupplierRow) {
    navigate(productsSupplierHref(supplier.id));
  }

  async function deleteSuppliers(ids: string[]) {
    if (ids.length === 0) return;
    setLoading((current) => ({ ...current, deleting: true }));
    try {
      await Promise.all(ids.map((id) => deleteMasterRecord("suppliers", id)));
      setSelected((current) => current.filter((id) => !ids.includes(id)));
      await refreshHub(undefined, { quiet: true });
      toaster.success(ids.length === 1 ? HUB_SUPPLIER_COPY.deleted : HUB_SUPPLIER_COPY.deletedMany);
    } catch (error) {
      toaster.error(shortError(error, HUB_SUPPLIER_COPY.deleteFailed));
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
            columns={HUB_SUPPLIER_TABLE_COLUMNS}
            cols={cols}
            onCols={setCols}
            chips={chips}
            onApply={(chip) => {
              setChips((prev) => applyFilterChip(prev, chip));
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
            searchPlaceholder={HUB_SUPPLIER_COPY.searchPlaceholder}
            view={view}
            onView={setView}
            trailing={
              selected.length > 0 ? (
                <BulkActions count={selected.length}>
                  <BulkAction
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() => {
                      if (!loading.deleting) void deleteSuppliers(selected);
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
            <HubChart type="donut" title="Products by supplier" data={chartData} />
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
                <tr key={row.id} className="cursor-pointer" onClick={() => openSupplier(row)}>
                  <Td className="ui-check-col">
                    <div onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selected.includes(row.id)}
                        onChange={(e) => {
                          setSelected((s) =>
                            e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id),
                          );
                        }}
                      />
                    </div>
                  </Td>
                  <Td>{row.name}</Td>
                  {cols.includes("products") ? (
                    <Td numeric className="text-accent">
                      {supplierProductCount(row.id, products, lots)}
                    </Td>
                  ) : null}
                  <Td>
                    <div onClick={(event) => event.stopPropagation()}>
                      <Menu>
                        <MenuItem icon={<Eye size={14} />} onClick={() => openSupplier(row)}>
                          {HUB_SUPPLIER_COPY.viewProducts}
                        </MenuItem>
                        <MenuItem icon={<Pencil size={14} />} onClick={() => setEdit(row)}>
                          Edit
                        </MenuItem>
                        <MenuItem danger icon={<Trash2 size={14} />} onClick={() => setRemove(row)}>
                          Delete
                        </MenuItem>
                      </Menu>
                    </div>
                  </Td>
                </tr>
              ))
            : null}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(edit)}
        title={edit?.name ? "Edit supplier" : "Add supplier"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)} disabled={loading.saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={SUPPLIER_FORM_ID}
              disabled={loading.saving}
            >
              {loading.saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {edit ? (
          <SupplierEditForm
            key={edit.id || "new"}
            row={edit}
            onValid={(values) => void saveSupplier(values)}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title={HUB_SUPPLIER_COPY.deleteTitle}
        body={HUB_SUPPLIER_COPY.deleteBody}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) void deleteSuppliers([remove.id]).then(() => setRemove(null));
          else setRemove(null);
        }}
      />
    </div>
  );
}
