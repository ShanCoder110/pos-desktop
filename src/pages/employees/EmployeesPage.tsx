import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Shield,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  EntityCell,
  EntityDetailDrawer,
  type DetailAction,
  Field,
  HubChart,
  HubChartGrid,
  KpiCard,
  Menu,
  MenuItem,
  MoneyInput,
  PageHead,
  Pagination,
  SelectInput,
  Table,
  TableRowsSkeleton,
  TabSheet,
  Tabs,
  Td,
  TextArea,
  TextInput,
  THead,
  Th,
  toaster,
} from "@/components/common";
import type { DateRangeFilter } from "@/components/common/DateRangePeriodPicker";
import type { FilterChip } from "@/components/common/FilterPicker";
import { rangeForPeriod } from "@/components/common/DateRangePeriodPicker";
import { DEFAULT_LEDGER_DATE_PERIOD } from "@/shared/constants/charts";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import {
  EmployeeForm,
  EMPLOYEE_FORM_ID,
  type EmployeeFormValues,
} from "@/pages/employees/EmployeeForm";
import type { Branch, StaffUser } from "@/shared/domain/types";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { useQueryTab } from "@/hooks/useQueryTab";
import { assignApiError, fieldMessage } from "@/utils/form";
import { formatEntityRef, limitMoneyDraft, money, shortError } from "@/utils/format";
import { formatPkMobile, pkMobileDigits } from "@/utils/phone";
import { createLoadGuard, isAbortError } from "@/utils/async";
import { ensureSession } from "@/services/auth";
import {
  createUser,
  deleteUser,
  listAllBranches,
  listAllUsers,
  listUsers,
  mapBranch,
  mapUser,
  updateUser,
} from "@/services/org";
import {
  getStaffLedger,
  listAllStaffLedgers,
  listStaffLedgers,
  recordStaffPayout,
  type StaffLedgerEntry,
} from "@/services/staff";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import { listEmptyMessage } from "@/shared/constants/empty";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { CUSTOMER_PAY_METHODS } from "@/shared/constants/customers";
import {
  DEFAULT_STAFF_PASSWORD,
  EMPLOYEE_COPY,
  EMPLOYEE_SEARCH_PLACEHOLDER,
  EMPLOYEE_TABLE_COLUMNS,
  EMPLOYEE_TABS,
  STAFF_EMPLOYEE_ROLES,
  STAFF_LEDGER_COLUMNS,
  STAFF_LEDGER_FILTER_FIELDS,
  STAFF_LEDGER_SEARCH_PLACEHOLDER,
  STAFF_LEDGER_TYPES,
  STAFF_STATUS_ACTIVE,
  STAFF_STATUS_INACTIVE,
  STAFF_TAB_EMPLOYEES,
  STAFF_TAB_LEDGER,
  employeeFilterFields,
  employeeRoleLabel,
  staffCanManage,
  staffLedgerTypeLabel,
} from "@/shared/constants/staff";

const PAGE = DEFAULT_PAGE_SIZE;
const PAY_FORM_ID = "employee-pay-form";

function chipValue(chips: FilterChip[], field: string) {
  return chips.find((chip) => chip.field === field)?.value ?? "";
}

function when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paginate<T>(rows: T[], page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), pages, total: rows.length, page: safePage };
}

function nameSlug(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return slug || "staff";
}

function staffEmailForCreate(id: string, name: string) {
  return `${nameSlug(name)}.${id.slice(0, 8)}@staff.local`;
}

function staffQuery(search: string, chips: FilterChip[]) {
  const status = chipValue(chips, "status");
  const role = chipValue(chips, "role");
  return {
    staffOnly: true as const,
    search: search.trim() || undefined,
    role: role || undefined,
    isActive:
      status === STAFF_STATUS_ACTIVE ? true : status === STAFF_STATUS_INACTIVE ? false : undefined,
  };
}

function branchIdFromChip(chips: FilterChip[], branches: Branch[]) {
  const name = chipValue(chips, "branch");
  if (!name) return null;
  return branches.find((branch) => branch.name === name)?.id ?? null;
}

const blankEmployee = (branches: Branch[]): StaffUser => ({
  id: crypto.randomUUID(),
  name: "",
  username: "",
  email: "",
  phone: "",
  role: "CASHIER",
  branchId: branches[0]?.id ?? "",
  totalPaid: 0,
  isActive: true,
});

function EmployeePayForm({
  employee,
  onValid,
}: {
  employee: StaffUser;
  onValid: (values: {
    amount: string;
    payoutType: "SALARY" | "COMMISSION";
    method: string;
    notes: string;
  }) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useAppForm({
    defaultValues: { amount: "", payoutType: "SALARY" as const, method: "CASH", notes: "" },
  });

  return (
    <form
      id={PAY_FORM_ID}
      className="drawer-form"
      onSubmit={handleSubmit(async (values) => {
        const amount = Number(values.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          setError("amount", { message: "Enter an amount" });
          return;
        }
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, EMPLOYEE_COPY.payFailed), "amount");
        }
      })}
    >
      <p className="settings-note">{EMPLOYEE_COPY.payHint}</p>
      <Field label="Employee">
        <TextInput value={employee.name} disabled />
      </Field>
      <Field label="Payout type">
        <Controller
          name="payoutType"
          control={control}
          render={({ field }) => (
            <SelectInput
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
            >
              {STAFF_LEDGER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {staffLedgerTypeLabel(type)}
                </option>
              ))}
            </SelectInput>
          )}
        />
      </Field>
      <Field label="Amount" error={fieldMessage(errors, "amount")}>
        <Controller
          name="amount"
          control={control}
          render={({ field }) => (
            <MoneyInput
              autoFocus
              placeholder="0"
              value={field.value}
              onChange={(event) => field.onChange(limitMoneyDraft(event.target.value))}
            />
          )}
        />
      </Field>
      <Field label="Payment method">
        <Controller
          name="method"
          control={control}
          render={({ field }) => (
            <SelectInput
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
            >
              {CUSTOMER_PAY_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </SelectInput>
          )}
        />
      </Field>
      <Field label="Notes">
        <TextArea rows={3} maxLength={FIELD_LIMITS.notes} {...register("notes")} />
      </Field>
    </form>
  );
}

export function EmployeesPage() {
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<StaffUser[]>([]);
  const [chartRows, setChartRows] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [counts, setCounts] = useState({ all: 0, active: 0, totalPaid: 0 });
  const canManage = staffCanManage(viewerRole);

  const [tab, setTab] = useQueryTab([...EMPLOYEE_TABS], STAFF_TAB_EMPLOYEES);
  const [cols, setCols] = useState(EMPLOYEE_TABLE_COLUMNS.map((col) => col.id));
  const [view, setView] = useState<HubView>("table");
  const [edit, setEdit] = useState<StaffUser | null>(null);
  const [detail, setDetail] = useState<StaffUser | null>(null);
  const [detailPaidThisMonth, setDetailPaidThisMonth] = useState(0);
  const [remove, setRemove] = useState<StaffUser | null>(null);
  const [pay, setPay] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState({
    fetching: true,
    saving: false,
    deleting: false,
    paying: false,
    ledger: false,
  });

  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerChips, setLedgerChips] = useState<FilterChip[]>([]);
  const [ledgerCols, setLedgerCols] = useState(STAFF_LEDGER_COLUMNS.map((col) => col.id));
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(PAGE);
  const [ledgerRows, setLedgerRows] = useState<StaffLedgerEntry[]>([]);
  const [ledgerFiltered, setLedgerFiltered] = useState<StaffLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPages, setLedgerPages] = useState(1);
  const [ledgerDateRange, setLedgerDateRange] = useState<DateRangeFilter>(() =>
    rangeForPeriod(DEFAULT_LEDGER_DATE_PERIOD),
  );

  const filters = useMemo(() => staffQuery(search, chips), [chips, search]);
  const branchFilterId = useMemo(() => branchIdFromChip(chips, branches), [branches, chips]);
  const filterFields = useMemo(
    () => employeeFilterFields(branches.map((branch) => branch.name)),
    [branches],
  );

  useEffect(() => {
    const controller = new AbortController();
    void ensureSession(controller.signal)
      .then((session) => setViewerRole(session?.user.role ?? null))
      .catch(() => setViewerRole(null));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listAllBranches(controller.signal)
      .then((response) => setBranches(response.map(mapBranch)))
      .catch((error) => {
        if (isAbortError(error)) return;
        setBranches([]);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const guard = createLoadGuard();
    setLoading((current) => ({ ...current, fetching: true }));

    const load = branchFilterId
      ? listAllUsers(filters, controller.signal).then((response) => {
          const mapped = response.map(mapUser).filter((row) => row.branchId === branchFilterId);
          const paged = paginate(mapped, page, pageSize);
          return { rows: paged.rows, total: paged.total, pages: paged.pages };
        })
      : listUsers({ ...filters, page, perPage: pageSize }, controller.signal).then((response) => ({
          rows: response.data.map(mapUser),
          total: response.meta.totalItems,
          pages: Math.max(1, response.meta.totalPages),
        }));

    load
      .then((response) => {
        if (!guard.isActive()) return;
        setRows(response.rows);
        setTotal(response.total);
        setPages(response.pages);
      })
      .catch((error) => {
        if (!guard.isActive() || isAbortError(error)) return;
        setRows([]);
        setTotal(0);
        setPages(1);
      })
      .finally(() => {
        if (!guard.isActive()) return;
        setLoading((current) => ({ ...current, fetching: false }));
      });

    return () => {
      guard.dispose();
      controller.abort();
    };
  }, [branchFilterId, filters, page, pageSize, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listUsers({ staffOnly: true, page: 1, perPage: 1 }, controller.signal),
      listUsers({ staffOnly: true, page: 1, perPage: 1, isActive: true }, controller.signal),
      listAllUsers(filters, controller.signal),
    ])
      .then(([all, active, matching]) => {
        const filtered = branchFilterId
          ? matching.map(mapUser).filter((row) => row.branchId === branchFilterId)
          : matching.map(mapUser);
        setCounts({
          all: branchFilterId ? filtered.length : all.meta.totalItems,
          active: branchFilterId
            ? filtered.filter((row) => row.isActive).length
            : active.meta.totalItems,
          totalPaid: filtered.reduce((sum, row) => sum + row.totalPaid, 0),
        });
        setChartRows(filtered);
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        setCounts({ all: 0, active: 0, totalPaid: 0 });
        setChartRows([]);
      });
    return () => controller.abort();
  }, [branchFilterId, filters, reloadKey]);

  useEffect(() => {
    if (tab !== STAFF_TAB_LEDGER) return;
    const controller = new AbortController();
    const debit = Number(chipValue(ledgerChips, "debit"));
    const params = {
      search: ledgerSearch.trim() || undefined,
      user: chipValue(ledgerChips, "user") || undefined,
      entryType: chipValue(ledgerChips, "entryType") || undefined,
      notes: chipValue(ledgerChips, "notes") || undefined,
      debit: Number.isFinite(debit) && debit > 0 ? debit : undefined,
      occurredFrom: ledgerDateRange.from || undefined,
      occurredTo: ledgerDateRange.to || undefined,
    };
    const guard = createLoadGuard();
    setLoading((current) => ({ ...current, ledger: true }));
    Promise.all([
      listStaffLedgers({ ...params, page: ledgerPage, perPage: ledgerPageSize }, controller.signal),
      listAllStaffLedgers(params, controller.signal),
    ])
      .then(([pageResponse, filteredRows]) => {
        if (!guard.isActive()) return;
        setLedgerRows(pageResponse.data);
        setLedgerTotal(pageResponse.meta.totalItems);
        setLedgerPages(Math.max(1, pageResponse.meta.totalPages));
        setLedgerFiltered(filteredRows);
      })
      .catch((error) => {
        if (!guard.isActive() || isAbortError(error)) return;
        setLedgerRows([]);
        setLedgerFiltered([]);
        setLedgerTotal(0);
        setLedgerPages(1);
      })
      .finally(() => {
        if (!guard.isActive()) return;
        setLoading((current) => ({ ...current, ledger: false }));
      });
    return () => {
      guard.dispose();
      controller.abort();
    };
  }, [
    ledgerChips,
    ledgerDateRange.from,
    ledgerDateRange.to,
    ledgerPage,
    ledgerPageSize,
    ledgerSearch,
    reloadKey,
    tab,
  ]);

  useEffect(() => {
    if (!detail) {
      setDetailPaidThisMonth(0);
      return;
    }
    const controller = new AbortController();
    getStaffLedger(detail.id, controller.signal)
      .then((ledger) => setDetailPaidThisMonth(ledger.paidThisMonth))
      .catch((error) => {
        if (isAbortError(error)) return;
        setDetailPaidThisMonth(0);
      });
    return () => controller.abort();
  }, [detail?.id]);

  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name ?? "—";
  const isNew = Boolean(
    edit && !rows.some((row) => row.id === edit.id) && !chartRows.some((row) => row.id === edit.id),
  );
  const show = (id: string) => cols.includes(id);
  const showLedger = (id: string) => ledgerCols.includes(id);
  const isListTab = tab === STAFF_TAB_EMPLOYEES;
  const hasFilters = Boolean(search || chips.length);

  function applyChip(next: FilterChip, ledgerMode = false) {
    if (ledgerMode) {
      setLedgerChips((current) => [...current.filter((chip) => chip.field !== next.field), next]);
      setLedgerPage(1);
      return;
    }
    setChips((current) => [...current.filter((chip) => chip.field !== next.field), next]);
    setPage(1);
  }

  function openCreate() {
    setEdit(blankEmployee(branches));
  }

  function openLedger(row: StaffUser) {
    setTab(STAFF_TAB_LEDGER);
    setLedgerChips([{ field: "user", label: "Staff", value: row.name }]);
    setLedgerPage(1);
  }

  async function saveEmployee(values: EmployeeFormValues) {
    if (!edit) return;
    const phone = pkMobileDigits(values.phone);
    if (!phone) {
      toaster.error("Enter a phone number");
      return;
    }
    setLoading((current) => ({ ...current, saving: true }));
    try {
      const payload = {
        name: values.name.trim(),
        phone,
        role: values.role,
        defaultBranchId: values.branchId,
        isActive: values.isActive,
      };
      if (isNew) {
        await createUser({
          ...payload,
          email: staffEmailForCreate(edit.id, values.name.trim()),
          password: DEFAULT_STAFF_PASSWORD,
        });
      } else {
        await updateUser(edit.id, {
          ...payload,
          email: edit.email,
        });
      }
      setEdit(null);
      setPage(1);
      setReloadKey((key) => key + 1);
      toaster.success(isNew ? EMPLOYEE_COPY.saved : EMPLOYEE_COPY.updated);
    } catch (error) {
      if (isAbortError(error)) return;
      toaster.error(shortError(error, EMPLOYEE_COPY.saveFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, saving: false }));
    }
  }

  async function savePayout(values: {
    amount: string;
    payoutType: "SALARY" | "COMMISSION";
    method: string;
    notes: string;
  }) {
    if (!pay) return;
    setLoading((current) => ({ ...current, paying: true }));
    try {
      await recordStaffPayout(pay.id, {
        amount: Number(values.amount),
        payoutType: values.payoutType,
        paymentMethod: values.method,
        notes: values.notes.trim() || undefined,
      });
      setPay(null);
      setReloadKey((key) => key + 1);
      toaster.success(EMPLOYEE_COPY.paySaved);
    } catch (error) {
      if (isAbortError(error)) return;
      toaster.error(shortError(error, EMPLOYEE_COPY.payFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, paying: false }));
    }
  }

  const roleChart = STAFF_EMPLOYEE_ROLES.map((role) => ({
    id: role,
    label: employeeRoleLabel(role),
    value: chartRows.filter((row) => row.role === role).length,
  })).filter((point) => point.value > 0);

  const paidChart = chartRows
    .filter((row) => row.totalPaid > 0)
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      label: row.name,
      value: row.totalPaid,
      details: [{ label: EMPLOYEE_COPY.totalPaid, value: money(row.totalPaid) }],
    }));

  const ledgerByStaff = Object.values(
    ledgerFiltered.reduce<Record<string, { id: string; label: string; value: number }>>(
      (acc, row) => {
        acc[row.userId] ??= { id: row.userId, label: row.userName ?? row.userId, value: 0 };
        acc[row.userId].value += row.debit;
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b.value - a.value);

  const ledgerTotals = ledgerFiltered.reduce((sum, row) => sum + row.debit, 0);
  const ledgerByType = Object.values(
    ledgerFiltered.reduce<Record<string, { id: string; label: string; value: number }>>(
      (acc, row) => {
        acc[row.entryType] ??= {
          id: row.entryType,
          label: staffLedgerTypeLabel(row.entryType),
          value: 0,
        };
        acc[row.entryType].value += row.debit;
        return acc;
      },
      {},
    ),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <PageHead
        title={EMPLOYEE_COPY.title}
        subtitle={EMPLOYEE_COPY.pageSubtitle}
        icon={<UserRound size={17} />}
      >
        {canManage || viewerRole === null ? (
          <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
            {EMPLOYEE_COPY.add}
          </Button>
        ) : null}
      </PageHead>

      <div className="ui-kpi-row grid shrink-0 grid-cols-4 gap-2.5">
        <KpiCard
          label="Employees"
          value={counts.all}
          hint="Matching filters"
          tone="info"
          icon={<UserRound size={16} />}
        />
        <KpiCard
          label="Active"
          value={counts.active}
          hint={EMPLOYEE_COPY.activeKpiHint}
          tone="ok"
        />
        <KpiCard
          label="Total paid"
          value={money(counts.totalPaid)}
          hint={EMPLOYEE_COPY.totalPaidKpiHint}
          tone="warn"
        />
        <KpiCard
          label="Inactive"
          value={counts.all - counts.active}
          hint="Off payroll"
          tone="stale"
        />
      </div>

      <TabSheet
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => {
              setTab(id);
              setView("table");
              setPage(1);
            }}
            items={[...EMPLOYEE_TABS]}
          />
        }
      >
        {isListTab ? (
          <Table
            toolbar={
              <HubToolbar
                columns={EMPLOYEE_TABLE_COLUMNS}
                cols={cols}
                onCols={setCols}
                chips={chips}
                onApply={(chip) => applyChip(chip)}
                onRemove={(field) => {
                  setChips((current) => current.filter((chip) => chip.field !== field));
                  setPage(1);
                }}
                onClear={() => {
                  setChips([]);
                  setPage(1);
                }}
                filterFields={filterFields}
                search={search}
                onSearch={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                searchPlaceholder={EMPLOYEE_SEARCH_PLACEHOLDER}
                view={view}
                onView={setView}
              />
            }
            body={
              view === "insights" ? (
                <HubChartGrid>
                  <HubChart
                    type="bar"
                    title="Top payouts"
                    subtitle="Total paid per employee"
                    data={paidChart}
                    formatValue={money}
                    maxItems={8}
                  />
                  <HubChart type="donut" title="Employee roles" data={roleChart} />
                </HubChartGrid>
              ) : undefined
            }
            footer={
              <Pagination
                page={Math.min(page, pages)}
                pages={pages}
                total={total}
                pageSize={pageSize}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                onChange={setPage}
              />
            }
          >
            {view === "table" ? (
              <>
                <THead>
                  <tr>
                    {show("name") ? <Th>Name</Th> : null}
                    {show("phone") ? <Th>Phone</Th> : null}
                    {show("role") ? <Th>Employee role</Th> : null}
                    {show("branch") ? <Th>Branch</Th> : null}
                    {show("paid") ? <Th>Total paid</Th> : null}
                    {show("status") ? <Th>Status</Th> : null}
                    <Th />
                  </tr>
                </THead>
                <tbody>
                  {loading.fetching ? (
                    <TableRowsSkeleton columnCount={cols.length} rows={6} hasActions />
                  ) : null}
                  {!loading.fetching && rows.length === 0 ? (
                    <EmptyRow cols={cols.length + 1} text={listEmptyMessage(hasFilters)} />
                  ) : null}
                  {!loading.fetching
                    ? rows.map((row) => (
                        <tr key={row.id} className="cursor-pointer" onClick={() => setDetail(row)}>
                          {show("name") ? (
                            <Td>
                              <EntityCell
                                title={row.name}
                                subtitle={employeeRoleLabel(row.role)}
                                tone="blue"
                              />
                            </Td>
                          ) : null}
                          {show("phone") ? (
                            <Td>{row.phone ? formatPkMobile(row.phone) : "—"}</Td>
                          ) : null}
                          {show("role") ? (
                            <Td>
                              <Badge tone="info">{employeeRoleLabel(row.role)}</Badge>
                            </Td>
                          ) : null}
                          {show("branch") ? <Td>{branchName(row.branchId)}</Td> : null}
                          {show("paid") ? <Td numeric>{money(row.totalPaid)}</Td> : null}
                          {show("status") ? (
                            <Td>
                              <Badge tone={row.isActive ? "ok" : "danger"}>
                                {row.isActive ? STAFF_STATUS_ACTIVE : STAFF_STATUS_INACTIVE}
                              </Badge>
                            </Td>
                          ) : null}
                          <Td>
                            <div onClick={(event) => event.stopPropagation()}>
                              {canManage ? (
                                <Menu>
                                  <MenuItem
                                    icon={<Pencil size={14} />}
                                    onClick={() => setEdit(row)}
                                  >
                                    Edit
                                  </MenuItem>
                                  <MenuItem
                                    danger
                                    icon={<Trash2 size={14} />}
                                    onClick={() => setRemove(row)}
                                  >
                                    Delete
                                  </MenuItem>
                                </Menu>
                              ) : null}
                            </div>
                          </Td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </>
            ) : null}
          </Table>
        ) : (
          <Table
            toolbar={
              <HubToolbar
                columns={STAFF_LEDGER_COLUMNS}
                cols={ledgerCols}
                onCols={setLedgerCols}
                chips={ledgerChips}
                onApply={(chip) => applyChip(chip, true)}
                onRemove={(field) => {
                  setLedgerChips((current) => current.filter((chip) => chip.field !== field));
                  setLedgerPage(1);
                }}
                onClear={() => {
                  setLedgerChips([]);
                  setLedgerPage(1);
                }}
                filterFields={STAFF_LEDGER_FILTER_FIELDS}
                search={ledgerSearch}
                onSearch={(value) => {
                  setLedgerSearch(value);
                  setLedgerPage(1);
                }}
                searchPlaceholder={STAFF_LEDGER_SEARCH_PLACEHOLDER}
                view={view}
                onView={setView}
                dateRange={ledgerDateRange}
                onDateRange={(range) => {
                  setLedgerDateRange(range);
                  setLedgerPage(1);
                }}
              />
            }
            body={
              view === "insights" ? (
                <HubChartGrid>
                  <HubChart
                    type="bar"
                    title="Payouts by staff"
                    data={ledgerByStaff}
                    formatValue={money}
                    maxItems={8}
                  />
                  <HubChart
                    type="donut"
                    title="Payout types"
                    data={ledgerByType}
                    formatValue={money}
                  />
                </HubChartGrid>
              ) : undefined
            }
            footer={
              <Pagination
                page={Math.min(ledgerPage, ledgerPages)}
                pages={ledgerPages}
                total={ledgerTotal}
                pageSize={ledgerPageSize}
                onPageSize={(size) => {
                  setLedgerPageSize(size);
                  setLedgerPage(1);
                }}
                onChange={setLedgerPage}
              />
            }
          >
            {view === "table" ? (
              <>
                <THead>
                  {ledgerRows.length > 0 ? (
                    <tr className="supplier-ledger-totals">
                      {showLedger("occurredAt") ? <Th>{EMPLOYEE_COPY.ledgerTotals}</Th> : null}
                      {showLedger("user") ? <Th /> : null}
                      {showLedger("type") ? <Th /> : null}
                      {showLedger("debit") ? (
                        <Th className="text-right">
                          <span className="ledger-amount is-owe">{money(ledgerTotals)}</span>
                        </Th>
                      ) : null}
                      {showLedger("balance") ? <Th /> : null}
                      {showLedger("notes") ? <Th /> : null}
                    </tr>
                  ) : null}
                  <tr>
                    {showLedger("occurredAt") ? <Th>When</Th> : null}
                    {showLedger("user") ? <Th>Staff</Th> : null}
                    {showLedger("type") ? <Th>Type</Th> : null}
                    {showLedger("debit") ? <Th>Paid</Th> : null}
                    {showLedger("balance") ? <Th>Total paid</Th> : null}
                    {showLedger("notes") ? <Th>Notes</Th> : null}
                  </tr>
                </THead>
                <tbody>
                  {loading.ledger ? (
                    <TableRowsSkeleton columnCount={ledgerCols.length} rows={6} />
                  ) : null}
                  {!loading.ledger && ledgerRows.length === 0 ? (
                    <EmptyRow cols={ledgerCols.length} text={EMPLOYEE_COPY.ledgerEmpty} />
                  ) : null}
                  {!loading.ledger
                    ? ledgerRows.map((row) => (
                        <tr key={row.id}>
                          {showLedger("occurredAt") ? <Td>{when(row.occurredAt)}</Td> : null}
                          {showLedger("user") ? <Td>{row.userName || "—"}</Td> : null}
                          {showLedger("type") ? (
                            <Td>{staffLedgerTypeLabel(row.entryType)}</Td>
                          ) : null}
                          {showLedger("debit") ? (
                            <Td numeric>
                              {row.debit ? (
                                <span className="ledger-amount is-owe">{money(row.debit)}</span>
                              ) : (
                                "—"
                              )}
                            </Td>
                          ) : null}
                          {showLedger("balance") ? (
                            <Td numeric>{money(row.balanceAfter)}</Td>
                          ) : null}
                          {showLedger("notes") ? <Td>{row.notes || "—"}</Td> : null}
                        </tr>
                      ))
                    : null}
                </tbody>
              </>
            ) : null}
          </Table>
        )}
      </TabSheet>

      {detail ? (
        <EntityDetailDrawer
          open
          title={EMPLOYEE_COPY.detailTitle}
          subtitle={EMPLOYEE_COPY.detailSubtitle}
          onClose={() => setDetail(null)}
          identity={{
            name: detail.name,
            reference: formatEntityRef("EMP", detail.id),
            referenceLabel: EMPLOYEE_COPY.detailReferenceLabel,
            badge: (
              <Badge tone={detail.isActive ? "ok" : "danger"}>
                {detail.isActive ? STAFF_STATUS_ACTIVE : STAFF_STATUS_INACTIVE}
              </Badge>
            ),
            icon: <UserRound size={18} />,
            tone: "amber",
          }}
          summaries={[
            {
              label: EMPLOYEE_COPY.totalPaid,
              value: money(detail.totalPaid),
              tone: detail.totalPaid > 0 ? "owe" : "neutral",
              icon: <Wallet size={15} />,
            },
            {
              label: EMPLOYEE_COPY.paidThisMonth,
              value: money(detailPaidThisMonth),
              tone: "warn",
              icon: <Wallet size={15} />,
            },
          ]}
          fieldsSectionTitle={EMPLOYEE_COPY.contactSection}
          onEditFields={
            canManage
              ? () => {
                  setDetail(null);
                  setEdit(detail);
                }
              : undefined
          }
          fields={[
            { label: "Name", value: detail.name, icon: <UserRound size={14} /> },
            {
              label: "Phone",
              value: detail.phone ? formatPkMobile(detail.phone) : "—",
              icon: <Phone size={14} />,
              emptyHint: EMPLOYEE_COPY.noPhoneHint,
            },
            {
              label: "Employee role",
              value: employeeRoleLabel(detail.role),
              icon: <Shield size={14} />,
            },
            { label: "Branch", value: branchName(detail.branchId), icon: <MapPin size={14} /> },
          ]}
          actions={[
            ...(canManage
              ? [
                  {
                    label: EMPLOYEE_COPY.payTitle,
                    description: EMPLOYEE_COPY.payEmployeeAction,
                    icon: <Wallet size={15} />,
                    tone: "accent",
                    onClick: () => {
                      setDetail(null);
                      setPay(detail);
                    },
                  } satisfies DetailAction,
                ]
              : []),
            {
              label: EMPLOYEE_COPY.viewLedger,
              description: EMPLOYEE_COPY.viewLedgerAction,
              icon: <BookOpen size={15} />,
              tone: "info" as const,
              onClick: () => {
                setDetail(null);
                openLedger(detail);
              },
            },
            ...(canManage
              ? [
                  {
                    label: "Edit employee",
                    description: EMPLOYEE_COPY.editEmployeeAction,
                    icon: <Pencil size={15} />,
                    tone: "edit",
                    onClick: () => {
                      setDetail(null);
                      setEdit(detail);
                    },
                  } satisfies DetailAction,
                ]
              : []),
          ]}
        />
      ) : null}

      <Drawer
        open={Boolean(edit)}
        title={isNew ? EMPLOYEE_COPY.add : "Edit employee"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)} disabled={loading.saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={EMPLOYEE_FORM_ID}
              disabled={loading.saving}
            >
              {loading.saving ? "Saving…" : isNew ? EMPLOYEE_COPY.add : "Save changes"}
            </Button>
          </>
        }
      >
        {edit ? (
          <EmployeeForm key={edit.id} employee={edit} branches={branches} onValid={saveEmployee} />
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(pay)}
        title={EMPLOYEE_COPY.payTitle}
        onClose={() => setPay(null)}
        footer={
          <>
            <Button onClick={() => setPay(null)} disabled={loading.paying}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={PAY_FORM_ID} disabled={loading.paying}>
              {loading.paying ? "Saving…" : EMPLOYEE_COPY.paySalary}
            </Button>
          </>
        }
      >
        {pay ? <EmployeePayForm key={pay.id} employee={pay} onValid={savePayout} /> : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete employee?"
        body="Removed from payroll but kept in records."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) return;
          setLoading((current) => ({ ...current, deleting: true }));
          void deleteUser(remove.id)
            .then(() => {
              setRemove(null);
              setDetail((current) => (current?.id === remove.id ? null : current));
              setReloadKey((key) => key + 1);
              toaster.success(EMPLOYEE_COPY.removed);
            })
            .catch((error) => {
              if (isAbortError(error)) return;
              toaster.error(shortError(error, EMPLOYEE_COPY.removeFailed));
            })
            .finally(() => {
              setLoading((current) => ({ ...current, deleting: false }));
            });
        }}
        confirmLabel="Delete"
      />
    </div>
  );
}
