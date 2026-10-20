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
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import type { UnitRow } from "@/shared/domain/types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/constants/config";
import { UNIT_TABLE_COLUMNS } from "@/shared/constants/products";
import { FIELD_LIMITS, FORM_COPY } from "@/shared/constants/fields";
import {
  createMasterRecord,
  deleteMasterRecord,
  listMasterRecords,
  updateMasterRecord,
} from "@/services/masters";
import { useAppForm } from "@/hooks/useAppForm";
import { fieldMessage, requiredTrim } from "@/utils/form";
import { shortError } from "@/utils/format";

const UNIT_FORM_ID = "unit-form";
const blank: UnitRow = { id: "", name: "", symbol: "" };

function UnitEditForm({
  row,
  onValid,
}: {
  row: UnitRow;
  onValid: (values: { name: string; symbol: string }) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useAppForm({
    defaultValues: { name: row.name, symbol: row.symbol },
  });
  return (
    <form
      id={UNIT_FORM_ID}
      className="ui-stack [display:grid] [gap:12px]"
      onSubmit={handleSubmit(onValid)}
    >
      <Field label="Name" error={fieldMessage(errors, "name")}>
        <TextInput
          placeholder="Meter"
          {...register("name", { validate: requiredTrim(FORM_COPY.nameRequired) })}
        />
      </Field>
      <Field label="Symbol" error={fieldMessage(errors, "symbol")}>
        <TextInput
          maxLength={FIELD_LIMITS.symbol}
          placeholder="m"
          {...register("symbol", { validate: requiredTrim(FORM_COPY.symbolRequired) })}
        />
      </Field>
    </form>
  );
}

export function UnitsPage() {
  const { setActions, sectionKpi, products, refreshHub } = useProductsHub();
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cols, setCols] = useState(UNIT_TABLE_COLUMNS.map((c) => c.id));
  const [view, setView] = useState<HubView>("table");
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<UnitRow | null>(null);
  const [remove, setRemove] = useState<UnitRow | null>(null);
  const [loading, setLoading] = useState({ page: true, saving: false, deleting: false });

  async function reloadUnits() {
    const response = await listMasterRecords("units", {
      perPage: MAX_PAGE_SIZE,
      isActive: true,
    });
    setRows(response.data.map(({ id, name, symbol }) => ({ id, name, symbol: symbol ?? "" })));
  }

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  useEffect(() => {
    const controller = new AbortController();
    listMasterRecords("units", { perPage: MAX_PAGE_SIZE, isActive: true }, controller.signal)
      .then((response) => {
        setRows(response.data.map(({ id, name, symbol }) => ({ id, name, symbol: symbol ?? "" })));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading((current) => ({ ...current, page: false })));
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const nameChip = chips.find((c) => c.field === "name")?.value.toLowerCase();
    const symbolChip = chips.find((c) => c.field === "symbol")?.value.toLowerCase();
    return rows.filter((r) => {
      if (needle && !`${r.name} ${r.symbol}`.toLowerCase().includes(needle)) return false;
      if (sectionKpi === "pack") return r.symbol === "pk" || r.symbol === "box";
      if (nameChip && !r.name.toLowerCase().includes(nameChip)) return false;
      if (symbolChip && !r.symbol.toLowerCase().includes(symbolChip)) return false;
      return true;
    });
  }, [rows, q, chips, sectionKpi]);

  useLayoutEffect(() => {
    setActions(
      <>
        <HubExportMenu
          filename="units"
          sheetName="Units"
          rows={filtered}
          columns={[
            { label: "Name", value: (row) => row.name },
            { label: "Symbol", value: (row) => row.symbol },
          ]}
        />
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ ...blank })}>
          Add unit
        </Button>
      </>,
    );
    return () => setActions(null);
  }, [filtered, setActions]);

  const pages = pageSize === PAGE_SIZE_ALL ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown =
    pageSize === PAGE_SIZE_ALL ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const chartData = filtered
    .map((row) => ({
      id: row.id,
      label: row.name,
      value: products.filter((product) => product.unit === row.symbol).length,
    }))
    .sort((a, b) => b.value - a.value);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  async function saveUnit(values: { name: string; symbol: string }) {
    if (!edit) return;
    const isNew = !edit.id;
    setLoading((current) => ({ ...current, saving: true }));
    try {
      const payload = {
        name: values.name.trim(),
        symbol: values.symbol.trim(),
        precision: 3,
        isActive: true,
      };
      if (isNew) await createMasterRecord("units", payload);
      else await updateMasterRecord("units", edit.id, payload);
      await reloadUnits();
      await refreshHub(undefined, { quiet: true });
      setEdit(null);
      toaster.success(isNew ? "Unit added" : "Unit saved");
    } catch (error) {
      toaster.error(shortError(error, "Could not save unit"));
    } finally {
      setLoading((current) => ({ ...current, saving: false }));
    }
  }

  async function deleteUnits(ids: string[]) {
    if (ids.length === 0) return;
    setLoading((current) => ({ ...current, deleting: true }));
    try {
      await Promise.all(ids.map((id) => deleteMasterRecord("units", id)));
      setRows((current) => current.filter((row) => !ids.includes(row.id)));
      setSelected((current) => current.filter((id) => !ids.includes(id)));
      await refreshHub(undefined, { quiet: true });
      toaster.success(ids.length === 1 ? "Unit deleted" : "Units deleted");
    } catch (error) {
      toaster.error(shortError(error, "Could not delete unit"));
    } finally {
      setLoading((current) => ({ ...current, deleting: false }));
    }
  }

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      <Table
        toolbar={
          <HubToolbar
            columns={UNIT_TABLE_COLUMNS}
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
            filterFields={[
              { id: "name", label: "Name" },
              { id: "symbol", label: "Symbol" },
            ]}
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search units"
            view={view}
            onView={setView}
            trailing={
              selected.length > 0 ? (
                <BulkActions count={selected.length}>
                  <BulkAction
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() => {
                      if (!loading.deleting) void deleteUnits(selected);
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
            <HubChart type="donut" title="Products by base unit" data={chartData} />
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
            {cols.includes("symbol") ? <Th>Symbol</Th> : null}
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {loading.page ? (
            <TableRowsSkeleton columnCount={cols.length} rows={6} selectable hasActions />
          ) : null}
          {!loading.page && shown.length === 0 ? <EmptyRow cols={cols.length + 2} /> : null}
          {!loading.page
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
                  {cols.includes("symbol") ? <Td>{row.symbol}</Td> : null}
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
        title={edit?.name ? "Edit unit" : "Add unit"}
        onClose={() => {
          if (!loading.saving) setEdit(null);
        }}
        footer={
          <>
            <Button onClick={() => setEdit(null)} disabled={loading.saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={UNIT_FORM_ID} disabled={loading.saving}>
              {loading.saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {edit ? (
          <UnitEditForm key={edit.id} row={edit} onValid={(values) => void saveUnit(values)} />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete unit?"
        body="This removes the unit from future selection. Existing product history stays safe."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove && !loading.deleting)
            void deleteUnits([remove.id]).then(() => setRemove(null));
        }}
      />
    </div>
  );
}
