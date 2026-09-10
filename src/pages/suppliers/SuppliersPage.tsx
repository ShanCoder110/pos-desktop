import { useEffect, useState } from "react";
import { Building2, MapPin, Pencil, Phone, Plus, Trash2, Truck } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  Field,
  KpiCard,
  Menu,
  MenuItem,
  PageHead,
  Pagination,
  TableSearch,
  Table,
  TabSheet,
  Tabs,
  Td,
  TextInput,
  THead,
  Th,
  Toggle,
  toaster,
} from "@/components/common";
import type { SupplierRow } from "@/shared/domain/types";
import {
  createMasterRecord,
  deleteMasterRecord,
  listMasterRecords,
  type MasterRecord,
  updateMasterRecord,
} from "@/services/masters";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";

const PAGE = DEFAULT_PAGE_SIZE;
const blank: SupplierRow = { id: "", name: "", phone: "", email: "", address: "", notes: "", isActive: true };

function mapSupplier(record: MasterRecord): SupplierRow {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone ?? "",
    email: "",
    address: record.address ?? "",
    notes: "",
    isActive: record.isActive,
  };
}

export function SuppliersPage() {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [counts, setCounts] = useState({ all: 0, active: 0, inactive: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [edit, setEdit] = useState<SupplierRow | null>(null);
  const [remove, setRemove] = useState<SupplierRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const isActive = tab === "all" ? undefined : tab === "active";
    listMasterRecords("suppliers", { page, perPage: pageSize, search, isActive }, controller.signal)
      .then((response) => {
        setRows(response.data.map(mapSupplier));
        setTotal(response.meta.totalItems);
        setPages(Math.max(1, response.meta.totalPages));
      })
      .catch(() => setRows([]));
    return () => controller.abort();
  }, [page, pageSize, reloadKey, search, tab]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listMasterRecords("suppliers", { page: 1, perPage: 1 }, controller.signal),
      listMasterRecords("suppliers", { page: 1, perPage: 1, isActive: true }, controller.signal),
      listMasterRecords("suppliers", { page: 1, perPage: 1, isActive: false }, controller.signal),
    ]).then(([all, active, inactive]) => {
      setCounts({
        all: all.meta.totalItems,
        active: active.meta.totalItems,
        inactive: inactive.meta.totalItems,
      });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [reloadKey]);

  const isNew = Boolean(edit && !rows.some((row) => row.id === edit.id));

  function openCreate() {
    setFormError("");
    setEdit({ ...blank, id: crypto.randomUUID() });
  }

  async function saveSupplier() {
    if (!edit?.name.trim()) {
      setFormError("Enter the supplier name.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        name: edit.name.trim(),
        phone: edit.phone.trim(),
        address: edit.address.trim(),
        isActive: edit.isActive,
      };
      if (isNew) {
        await createMasterRecord("suppliers", payload);
      } else {
        await updateMasterRecord("suppliers", edit.id, payload);
      }
      setEdit(null);
      setPage(1);
      setReloadKey((key) => key + 1);
      toaster.success(isNew ? "Supplier added" : "Supplier updated");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save supplier.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Suppliers">
        <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
          Add supplier
        </Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        Keep supplier contact details ready for purchase orders, stock receipts, and product lots.
      </p>
      <div className="ui-kpi-row supplier-kpis [display:grid] [grid-template-columns:repeat(3,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
        <KpiCard label="All suppliers" value={counts.all} hint="Saved contacts" tone="phantom" icon={<Building2 size={16} />} />
        <KpiCard label="Active" value={counts.active} hint="Can receive lots" tone="ok" />
        <KpiCard label="Inactive" value={counts.inactive} hint="Hidden on receive" tone="stale" />
      </div>
      <TabSheet
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => {
              setTab(id);
              setPage(1);
            }}
            items={[
              { id: "all", label: "All" },
              { id: "active", label: "Active" },
              { id: "inactive", label: "Inactive" },
            ]}
          />
        }
      >
      <Table
        toolbar={
          <div className="supplier-table-tools">
            <TableSearch
              className="supplier-search"
              value={search}
              onSearch={(query) => {
                setSearch(query);
                setPage(1);
              }}
              placeholder="Search suppliers by name or phone"
            />
            <span className="supplier-result-count" aria-live="polite">
              {total} {total === 1 ? "supplier" : "suppliers"}
            </span>
          </div>
        }
        footer={
          <Pagination
            page={Math.min(page, pages)}
            pages={pages}
            total={total}
            pageSize={pageSize}
            onPageSize={setPageSize}
            onChange={setPage}
            showAll={false}
          />
        }
      >
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>Address</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="supplier-empty" colSpan={5}>
                <div className="supplier-empty-icon"><Truck size={22} /></div>
                <strong>{search ? "No matching suppliers" : "Add your first supplier"}</strong>
                <span>{search ? "Try another name or phone number." : "Supplier details will be available while receiving stock."}</span>
                {!search ? <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>Add supplier</Button> : null}
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>
                <div className="supplier-name-cell">
                  <span className="supplier-avatar">{row.name.trim().charAt(0).toUpperCase()}</span>
                  <strong>{row.name}</strong>
                </div>
              </Td>
              <Td>{row.phone || "—"}</Td>
              <Td>{row.address || "—"}</Td>
              <Td>
                <Badge tone={row.isActive ? "ok" : "danger"}>{row.isActive ? "Yes" : "No"}</Badge>
              </Td>
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
      </TabSheet>

      <Drawer
        open={Boolean(edit)}
        title={isNew ? "Add supplier" : "Edit supplier"}
        onClose={() => { setEdit(null); setFormError(""); }}
        footer={
          <>
            <Button onClick={() => setEdit(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={() => void saveSupplier()} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Add supplier" : "Save changes"}
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="supplier-form">
            <Field label="Name" error={formError && !edit.name.trim() ? formError : undefined}>
              <TextInput autoFocus startIcon={<Building2 size={15} />} placeholder="e.g. Lahore Electric Traders" value={edit.name} onChange={(e) => { setFormError(""); setEdit({ ...edit, name: e.target.value }); }} />
            </Field>
            <Field label="Phone">
              <TextInput startIcon={<Phone size={15} />} inputMode="tel" placeholder="e.g. 0300 1234567" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </Field>
            <Field label="Address">
              <TextInput startIcon={<MapPin size={15} />} placeholder="e.g. Hall Road, Lahore" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </Field>
            <div className="supplier-active-card">
              <div>
                <strong>Active supplier</strong>
                <span>Show when receiving stock</span>
              </div>
              <Toggle checked={edit.isActive} onChange={(isActive) => setEdit({ ...edit, isActive })} label="" />
            </div>
            {formError && edit.name.trim() ? <p className="supplier-form-error">{formError}</p> : null}
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete supplier?"
        body="Blocked if lots still point here."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) return;
          void deleteMasterRecord("suppliers", remove.id)
            .then(() => {
              setReloadKey((key) => key + 1);
              toaster.success("Supplier removed");
            })
            .catch((error) => toaster.error(error instanceof Error ? error.message : "Could not remove supplier."))
            .finally(() => setRemove(null));
        }}
      />
    </div>
  );
}
