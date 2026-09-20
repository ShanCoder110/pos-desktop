import { useEffect, useMemo, useState } from "react";
import { BookOpen, Building2, Pencil, Plus, Scale, Trash2, Wallet } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  EntityCell,
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
  THead,
  Th,
  toaster,
} from "@/components/common";
import type { DateRangeFilter } from "@/components/common/DateRangePeriodPicker";
import type { FilterChip } from "@/components/common/FilterPicker";
import { rangeForPeriod } from "@/components/common/DateRangePeriodPicker";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import {
  SUPPLIER_FORM_ID,
  SupplierEditForm,
  type SupplierFormValues,
} from "@/pages/suppliers/SupplierEditForm";
import { SupplierDetailDrawer } from "@/pages/suppliers/SupplierDetailDrawer";
import type { SupplierRow } from "@/shared/domain/types";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { useQueryTab } from "@/hooks/useQueryTab";
import { assignApiError, fieldMessage } from "@/utils/form";
import {
  adjustDelta,
  balanceInputDraft,
  cn,
  limitMoneyDraft,
  money,
  shortError,
} from "@/utils/format";
import { formatPkMobile, pkMobileDigits } from "@/utils/phone";
import {
  createMasterRecord,
  deleteMasterRecord,
  listAllMasterRecords,
  listMasterRecords,
  type MasterListParams,
  type MasterRecord,
  updateMasterRecord,
} from "@/services/masters";
import { ensureSession } from "@/services/auth";
import { adjustSupplierBalance } from "@/services/balances";
import {
  listAllSupplierLedgers,
  listSupplierLedgers,
  recordSupplierPayment,
  type SupplierLedgerEntry,
} from "@/services/purchasing";
import { validateAdjustBalanceNotes } from "@/validations/supplier.validation";
import { DEFAULT_LEDGER_DATE_PERIOD } from "@/shared/constants/charts";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import { listEmptyMessage } from "@/shared/constants/empty";
import { createLoadGuard } from "@/utils/async";
import {
  SUPPLIER_BALANCE_ADVANCE,
  SUPPLIER_BALANCE_PAYABLE,
  SUPPLIER_BALANCE_SETTLED,
  SUPPLIER_COPY,
  SUPPLIER_FILTER_FIELDS,
  SUPPLIER_LEDGER_COLUMNS,
  SUPPLIER_LEDGER_FILTER_FIELDS,
  SUPPLIER_LEDGER_SEARCH_PLACEHOLDER,
  supplierCanAdjust,
  supplierLedgerCreditClass,
  supplierLedgerDebitClass,
  supplierLedgerTypeLabel,
  SUPPLIER_OPENING_THEY_OWE,
  SUPPLIER_OPENING_WE_OWE,
  SUPPLIER_SEARCH_PLACEHOLDER,
  SUPPLIER_STATUS_ACTIVE,
  SUPPLIER_STATUS_INACTIVE,
  SUPPLIER_TAB_LEDGER,
  SUPPLIER_TAB_SUPPLIERS,
  SUPPLIER_TABLE_COLUMNS,
  SUPPLIER_TABS,
} from "@/shared/constants/suppliers";

const PAGE = DEFAULT_PAGE_SIZE;
const SUPPLIER_ADJUST_FORM_ID = "supplier-adjust-form";
const SUPPLIER_PAY_FORM_ID = "supplier-pay-form";
const blank: SupplierRow = {
  id: "",
  name: "",
  phone: "",
  email: "",
  cityId: "",
  address: "",
  notes: "",
  currentBalance: 0,
  previousBalance: "",
  openingSide: SUPPLIER_OPENING_WE_OWE,
  isActive: true,
};

function supplierBalance(n: number) {
  if (n > 0) return { amount: money(n), label: SUPPLIER_BALANCE_PAYABLE, tone: "warn" as const };
  if (n < 0) return { amount: money(-n), label: SUPPLIER_BALANCE_ADVANCE, tone: "ok" as const };
  return { amount: money(0), label: SUPPLIER_BALANCE_SETTLED, tone: "neutral" as const };
}

function supplierTargetBalance(amount: string, side: "payable" | "advance") {
  const magnitude = openingAmount(amount);
  return side === "payable" ? magnitude : -magnitude;
}

function openingAmount(raw: string | undefined) {
  const cleaned = (raw ?? "").replace(/,/g, "").trim();
  const value = Math.abs(Number(cleaned));
  return Number.isFinite(value) ? value : 0;
}

function SupplierAdjustForm({
  row,
  onValid,
}: {
  row: SupplierRow;
  onValid: (values: {
    amount: string;
    side: "payable" | "advance";
    notes: string;
  }) => Promise<void>;
}) {
  const {
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors },
  } = useAppForm({
    defaultValues: {
      amount: balanceInputDraft(row.currentBalance),
      side: (row.currentBalance < 0 ? "advance" : "payable") as "payable" | "advance",
      notes: "",
    },
  });
  const side = watch("side");
  const amount = watch("amount");
  const current = supplierBalance(row.currentBalance);
  const balanceAfter = supplierTargetBalance(amount, side);
  const delta = balanceAfter - row.currentBalance;
  const after = supplierBalance(balanceAfter);
  return (
    <form
      id={SUPPLIER_ADJUST_FORM_ID}
      className="supplier-form"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, SUPPLIER_COPY.adjustFailed), "notes");
        }
      })}
    >
      <Field
        label={SUPPLIER_COPY.adjustCurrentBalance}
        hint={`${current.label} · ${SUPPLIER_COPY.ledgerBalanceHint}`}
      >
        <div
          className={cn(
            "supplier-balance",
            row.currentBalance > 0 && "is-owe",
            row.currentBalance < 0 && "is-advance",
          )}
        >
          {current.amount}
          <small>{current.label}</small>
        </div>
      </Field>
      <Field
        label="Adjustment"
        hint={side === "advance" ? SUPPLIER_COPY.advanceHint : SUPPLIER_COPY.payableHint}
      >
        <Controller
          name="side"
          control={control}
          render={({ field }) => (
            <div className="supplier-opening-sides">
              <button
                type="button"
                className={cn("supplier-opening-side is-owe", field.value === "payable" && "is-on")}
                onClick={() => field.onChange("payable")}
              >
                {SUPPLIER_COPY.adjustPayable}
              </button>
              <button
                type="button"
                className={cn(
                  "supplier-opening-side is-advance",
                  field.value === "advance" && "is-on",
                )}
                onClick={() => field.onChange("advance")}
              >
                {SUPPLIER_COPY.adjustAdvance}
              </button>
            </div>
          )}
        />
      </Field>
      <Field label={SUPPLIER_COPY.adjustBalanceLabel} error={fieldMessage(errors, "amount")}>
        <Controller
          name="amount"
          control={control}
          rules={{
            validate: (value) => {
              const target = supplierTargetBalance(value, side);
              return target !== row.currentBalance || SUPPLIER_COPY.adjustUnchanged;
            },
          }}
          render={({ field }) => (
            <MoneyInput
              placeholder="0"
              value={field.value}
              onChange={(event) =>
                field.onChange(limitMoneyDraft(event.target.value.replace(/^\s*-/, "")))
              }
            />
          )}
        />
      </Field>
      <Field label={SUPPLIER_COPY.adjustBalanceAfter} hint={after.label}>
        {delta !== 0 ? (
          <p className={cn("balance-adjust-delta", delta > 0 ? "is-up" : "is-down")}>
            {adjustDelta(delta)}
          </p>
        ) : null}
        <div
          className={cn(
            "supplier-balance",
            balanceAfter > 0 && "is-owe",
            balanceAfter < 0 && "is-advance",
          )}
        >
          {after.amount}
          <small>{after.label}</small>
        </div>
      </Field>
      <Field label={SUPPLIER_COPY.adjustNotes} error={fieldMessage(errors, "notes")}>
        <Controller
          name="notes"
          control={control}
          rules={{ validate: validateAdjustBalanceNotes }}
          render={({ field }) => (
            <TextArea
              rows={3}
              placeholder="Why is this adjustment needed?"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </Field>
      <p className="ui-note [font-size:12px] [color:var(--muted)]">{SUPPLIER_COPY.adjustHint}</p>
    </form>
  );
}

function SupplierPayForm({
  row,
  onValid,
}: {
  row: SupplierRow;
  onValid: (values: { amount: string; method: string; notes: string }) => Promise<void>;
}) {
  const payingOut = row.currentBalance >= 0;
  const {
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useAppForm({
    defaultValues: { amount: "", method: "CASH", notes: "" },
  });
  const balance = supplierBalance(row.currentBalance);
  return (
    <form
      id={SUPPLIER_PAY_FORM_ID}
      className="supplier-form"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, SUPPLIER_COPY.payFailed), "amount");
        }
      })}
    >
      <Field
        label="Current balance"
        hint={payingOut ? SUPPLIER_COPY.payOutHint : SUPPLIER_COPY.payInHint}
      >
        <div
          className={cn(
            "supplier-balance",
            row.currentBalance > 0 && "is-owe",
            row.currentBalance < 0 && "is-advance",
          )}
        >
          {balance.amount}
          <small>{balance.label}</small>
        </div>
      </Field>
      <Field
        label={payingOut ? SUPPLIER_COPY.paySupplier : SUPPLIER_COPY.receiveFromSupplier}
        error={fieldMessage(errors, "amount")}
      >
        <Controller
          name="amount"
          control={control}
          rules={{
            validate: (value) => {
              const amount = Number(value);
              return (Number.isFinite(amount) && amount > 0) || "Enter an amount";
            },
          }}
          render={({ field }) => (
            <MoneyInput
              placeholder="0"
              value={field.value}
              onChange={(event) => field.onChange(limitMoneyDraft(event.target.value))}
            />
          )}
        />
      </Field>
      <Field label="Method">
        <Controller
          name="method"
          control={control}
          render={({ field }) => (
            <SelectInput
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
            >
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="BANK">Bank</option>
            </SelectInput>
          )}
        />
      </Field>
      <Field label="Notes">
        <Controller
          name="notes"
          control={control}
          render={({ field }) => (
            <TextArea
              rows={2}
              placeholder="Optional note"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </Field>
    </form>
  );
}

function mapSupplier(record: MasterRecord): SupplierRow {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone ?? "",
    email: record.email ?? "",
    cityId: record.cityId ?? "",
    cityName: record.cityName ?? "",
    address: record.address ?? "",
    notes: record.notes ?? "",
    currentBalance: record.balance ?? 0,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function chipValue(chips: FilterChip[], field: string) {
  return chips.find((chip) => chip.field === field)?.value;
}

function supplierQuery(
  search: string,
  chips: FilterChip[],
): Omit<MasterListParams, "page" | "perPage"> {
  const status = chipValue(chips, "status");
  return {
    search,
    name: chipValue(chips, "name"),
    phone: chipValue(chips, "phone"),
    address: chipValue(chips, "address"),
    balance: chipValue(chips, "balance"),
    isActive:
      status === SUPPLIER_STATUS_ACTIVE
        ? true
        : status === SUPPLIER_STATUS_INACTIVE
          ? false
          : undefined,
  };
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

export function SuppliersPage() {
  const [tab, setTab] = useQueryTab(SUPPLIER_TABS, SUPPLIER_TAB_SUPPLIERS);
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [chartRows, setChartRows] = useState<SupplierRow[]>([]);
  const [search, setSearch] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [counts, setCounts] = useState({ all: 0, active: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [edit, setEdit] = useState<SupplierRow | null>(null);
  const [detail, setDetail] = useState<SupplierRow | null>(null);
  const [remove, setRemove] = useState<SupplierRow | null>(null);
  const [adjust, setAdjust] = useState<SupplierRow | null>(null);
  const [pay, setPay] = useState<SupplierRow | null>(null);
  const [view, setView] = useState<HubView>("table");
  const [cols, setCols] = useState(SUPPLIER_TABLE_COLUMNS.map((col) => col.id));
  const [ledgerCols, setLedgerCols] = useState(SUPPLIER_LEDGER_COLUMNS.map((col) => col.id));
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerChips, setLedgerChips] = useState<FilterChip[]>([]);
  const [ledgerRows, setLedgerRows] = useState<SupplierLedgerEntry[]>([]);
  const [ledgerFiltered, setLedgerFiltered] = useState<SupplierLedgerEntry[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(PAGE);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPages, setLedgerPages] = useState(1);
  const [dateRange, setDateRange] = useState<DateRangeFilter>(() =>
    rangeForPeriod(DEFAULT_LEDGER_DATE_PERIOD),
  );
  const [loading, setLoading] = useState({
    fetching: true,
    saving: false,
    deleting: false,
    ledger: false,
    adjusting: false,
    paying: false,
  });
  const [kpiPicked, setKpiPicked] = useState(false);

  const filters = useMemo(() => supplierQuery(search, chips), [chips, search]);
  const canAdjust = supplierCanAdjust(viewerRole);
  const statusChip = chipValue(chips, "status");
  const balanceChip = chipValue(chips, "balance");
  const kpi =
    !statusChip && !balanceChip
      ? "all"
      : statusChip === SUPPLIER_STATUS_ACTIVE
        ? "active"
        : balanceChip === SUPPLIER_BALANCE_PAYABLE
          ? "payable"
          : balanceChip === SUPPLIER_BALANCE_ADVANCE
            ? "advance"
            : "";

  useEffect(() => {
    const controller = new AbortController();
    void ensureSession(controller.signal)
      .then((session) => setViewerRole(session?.user.role ?? null))
      .catch(() => setViewerRole(null));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const guard = createLoadGuard();
    setLoading((current) => ({ ...current, fetching: true }));
    listMasterRecords("suppliers", { ...filters, page, perPage: pageSize }, controller.signal)
      .then((response) => {
        if (!guard.isActive()) return;
        setRows(response.data.map(mapSupplier));
        setTotal(response.meta.totalItems);
        setPages(Math.max(1, response.meta.totalPages));
      })
      .catch(() => {
        if (!guard.isActive()) return;
        setRows([]);
      })
      .finally(() => {
        if (!guard.isActive()) return;
        setLoading((current) => ({ ...current, fetching: false }));
      });
    return () => {
      guard.dispose();
      controller.abort();
    };
  }, [filters, page, pageSize, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listMasterRecords("suppliers", { page: 1, perPage: 1 }, controller.signal),
      listMasterRecords("suppliers", { page: 1, perPage: 1, isActive: true }, controller.signal),
      listAllMasterRecords("suppliers", filters, controller.signal),
    ])
      .then(([all, active, matching]) => {
        setCounts({ all: all.meta.totalItems, active: active.meta.totalItems });
        setChartRows(matching.map(mapSupplier));
      })
      .catch(() => {
        setCounts({ all: 0, active: 0 });
        setChartRows([]);
      });
    return () => controller.abort();
  }, [filters, reloadKey]);

  useEffect(() => {
    if (tab !== SUPPLIER_TAB_LEDGER) return;
    const controller = new AbortController();
    const debit = Number(chipValue(ledgerChips, "debit"));
    const credit = Number(chipValue(ledgerChips, "credit"));
    const params = {
      search: ledgerSearch,
      supplier: chipValue(ledgerChips, "supplier"),
      entryType: chipValue(ledgerChips, "entryType"),
      notes: chipValue(ledgerChips, "notes"),
      balance: chipValue(ledgerChips, "balance"),
      debit: Number.isFinite(debit) && debit > 0 ? debit : undefined,
      credit: Number.isFinite(credit) && credit > 0 ? credit : undefined,
      occurredFrom: dateRange.from || undefined,
      occurredTo: dateRange.to || undefined,
    };
    const guard = createLoadGuard();
    setLoading((current) => ({ ...current, ledger: true }));
    Promise.all([
      listSupplierLedgers(
        { ...params, page: ledgerPage, perPage: ledgerPageSize },
        controller.signal,
      ),
      listAllSupplierLedgers(params, controller.signal),
    ])
      .then(([pageResponse, filteredRows]) => {
        if (!guard.isActive()) return;
        setLedgerRows(pageResponse.data);
        setLedgerTotal(pageResponse.meta.totalItems);
        setLedgerPages(Math.max(1, pageResponse.meta.totalPages));
        setLedgerFiltered(filteredRows);
      })
      .catch(() => {
        if (!guard.isActive()) return;
        setLedgerRows([]);
        setLedgerFiltered([]);
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
    dateRange.from,
    dateRange.to,
    ledgerChips,
    ledgerPage,
    ledgerPageSize,
    ledgerSearch,
    reloadKey,
    tab,
  ]);

  const isNew = Boolean(
    edit && !rows.some((row) => row.id === edit.id) && !chartRows.some((row) => row.id === edit.id),
  );
  const show = (id: string) => cols.includes(id);
  const showLedger = (id: string) => ledgerCols.includes(id);
  const payable = chartRows
    .filter((row) => row.currentBalance > 0)
    .reduce((sum, row) => sum + row.currentBalance, 0);
  const advance = Math.abs(
    chartRows
      .filter((row) => row.currentBalance < 0)
      .reduce((sum, row) => sum + row.currentBalance, 0),
  );

  function applyKpi(next: "all" | "active" | "payable" | "advance") {
    setKpiPicked(true);
    setTab(SUPPLIER_TAB_SUPPLIERS);
    setPage(1);
    setChips((current) => {
      const kept = current.filter((chip) => chip.field !== "status" && chip.field !== "balance");
      if (next === "all" || next === kpi) return kept;
      if (next === "active")
        return [...kept, { field: "status", label: "Status", value: SUPPLIER_STATUS_ACTIVE }];
      if (next === "payable")
        return [...kept, { field: "balance", label: "Balance", value: SUPPLIER_BALANCE_PAYABLE }];
      return [...kept, { field: "balance", label: "Balance", value: SUPPLIER_BALANCE_ADVANCE }];
    });
  }

  function applyChip(next: FilterChip, ledger = false) {
    const set = ledger ? setLedgerChips : setChips;
    set((current) => [...current.filter((chip) => chip.field !== next.field), next]);
    if (ledger) setLedgerPage(1);
    else setPage(1);
  }

  function openCreate() {
    setEdit({ ...blank, id: crypto.randomUUID() });
  }

  function openLedger(row: SupplierRow) {
    setTab(SUPPLIER_TAB_LEDGER);
    setLedgerChips([{ field: "supplier", label: "Supplier", value: row.name }]);
    setLedgerPage(1);
  }

  async function saveSupplier(values: SupplierFormValues) {
    if (!edit) return;
    const phone = pkMobileDigits(values.phone);
    setLoading((current) => ({ ...current, saving: true }));
    try {
      const payload = {
        name: values.name.trim(),
        phone: phone || undefined,
        cityId: values.cityId || undefined,
        address: values.address.trim(),
        isActive: isNew ? true : values.isActive,
        ...(isNew && openingAmount(values.previousBalance)
          ? {
              previousBalance:
                (values.openingSide === SUPPLIER_OPENING_THEY_OWE ? -1 : 1) *
                openingAmount(values.previousBalance),
            }
          : {}),
      };
      if (isNew) await createMasterRecord("suppliers", payload);
      else await updateMasterRecord("suppliers", edit.id, payload);
      setEdit(null);
      setPage(1);
      setReloadKey((key) => key + 1);
      toaster.success(isNew ? SUPPLIER_COPY.added : SUPPLIER_COPY.updated);
    } catch (error) {
      toaster.error(shortError(error, SUPPLIER_COPY.saveFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, saving: false }));
    }
  }

  async function saveAdjust(values: {
    amount: string;
    side: "payable" | "advance";
    notes: string;
  }) {
    if (!adjust) return;
    const target = supplierTargetBalance(values.amount, values.side);
    const delta = target - adjust.currentBalance;
    setLoading((current) => ({ ...current, adjusting: true }));
    try {
      await adjustSupplierBalance(adjust.id, delta, values.notes.trim());
      setAdjust(null);
      setReloadKey((key) => key + 1);
      toaster.success(SUPPLIER_COPY.adjustSaved);
    } catch (error) {
      toaster.error(shortError(error, SUPPLIER_COPY.adjustFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, adjusting: false }));
    }
  }

  async function savePayment(values: { amount: string; method: string; notes: string }) {
    if (!pay) return;
    setLoading((current) => ({ ...current, paying: true }));
    try {
      await recordSupplierPayment(pay.id, {
        amount: Number(values.amount),
        paymentMethod: values.method,
        notes: values.notes.trim() || undefined,
      });
      setPay(null);
      setReloadKey((key) => key + 1);
      toaster.success(SUPPLIER_COPY.paySaved);
    } catch (error) {
      toaster.error(shortError(error, SUPPLIER_COPY.payFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, paying: false }));
    }
  }

  const supplierChart = chartRows
    .filter((row) => row.currentBalance > 0)
    .sort((a, b) => b.currentBalance - a.currentBalance)
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      label: row.name,
      value: row.currentBalance,
      details: [{ label: "Balance", value: money(row.currentBalance) }],
    }));
  const statusChart = [
    {
      id: "active",
      label: SUPPLIER_STATUS_ACTIVE,
      value: chartRows.filter((row) => row.isActive).length,
    },
    {
      id: "inactive",
      label: SUPPLIER_STATUS_INACTIVE,
      value: chartRows.filter((row) => !row.isActive).length,
    },
  ].filter((point) => point.value > 0);
  const ledgerBySupplier = Object.values(
    ledgerFiltered.reduce<Record<string, { id: string; label: string; value: number }>>(
      (acc, row) => {
        const key = row.supplierId;
        acc[key] ??= { id: key, label: row.supplierName ?? key, value: 0 };
        acc[key].value += row.debit;
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b.value - a.value);
  const ledgerTotals = ledgerFiltered.reduce(
    (acc, row) => ({ debit: acc.debit + row.debit, credit: acc.credit + row.credit }),
    { debit: 0, credit: 0 },
  );
  const ledgerByType = Object.values(
    ledgerFiltered.reduce<Record<string, { id: string; label: string; value: number }>>(
      (acc, row) => {
        acc[row.entryType] ??= {
          id: row.entryType,
          label: supplierLedgerTypeLabel(row.entryType),
          value: 0,
        };
        acc[row.entryType].value += 1;
        return acc;
      },
      {},
    ),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <PageHead
        title={SUPPLIER_COPY.title}
        subtitle="Purchasing contacts"
        icon={<Building2 size={17} />}
      >
        <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
          Add supplier
        </Button>
      </PageHead>
      <div className="ui-kpi-row grid shrink-0 grid-cols-4 gap-2.5">
        <KpiCard
          label="All suppliers"
          value={counts.all}
          hint="Saved contacts"
          tone="info"
          icon={<Building2 size={16} />}
          active={kpiPicked && kpi === "all"}
          onClick={() => applyKpi("all")}
        />
        <KpiCard
          label="Active"
          value={counts.active}
          hint="Can receive lots"
          tone="ok"
          active={kpi === "active"}
          onClick={() => applyKpi("active")}
        />
        <KpiCard
          label={SUPPLIER_COPY.payable}
          value={money(payable)}
          hint={SUPPLIER_COPY.payableKpiHint}
          tone="warn"
          active={kpi === "payable"}
          onClick={() => applyKpi("payable")}
        />
        <KpiCard
          label={SUPPLIER_COPY.advance}
          value={money(advance)}
          hint={SUPPLIER_COPY.advanceKpiHint}
          tone="phantom"
          active={kpi === "advance"}
          onClick={() => applyKpi("advance")}
        />
      </div>

      <TabSheet
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => {
              setTab(id);
              setView("table");
            }}
            items={[...SUPPLIER_TABS]}
          />
        }
      >
        {tab === SUPPLIER_TAB_SUPPLIERS ? (
          <Table
            toolbar={
              <HubToolbar
                columns={SUPPLIER_TABLE_COLUMNS}
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
                filterFields={SUPPLIER_FILTER_FIELDS}
                search={search}
                onSearch={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                searchPlaceholder={SUPPLIER_SEARCH_PLACEHOLDER}
                view={view}
                onView={setView}
              />
            }
            body={
              view === "insights" ? (
                <HubChartGrid>
                  <HubChart
                    type="bar"
                    title="Largest payables"
                    subtitle="What the shop owes"
                    data={supplierChart}
                    formatValue={money}
                    maxItems={8}
                  />
                  <HubChart type="donut" title="Supplier status" data={statusChart} />
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
                    {show("address") ? <Th>Address</Th> : null}
                    {show("city") ? <Th>City</Th> : null}
                    {show("balance") ? <Th>Balance</Th> : null}
                    <Th />
                  </tr>
                </THead>
                <tbody>
                  {loading.fetching ? (
                    <TableRowsSkeleton columnCount={cols.length} rows={6} hasActions />
                  ) : null}
                  {!loading.fetching && rows.length === 0 ? (
                    <EmptyRow
                      cols={cols.length + 1}
                      text={listEmptyMessage(Boolean(search || chips.length))}
                    />
                  ) : null}
                  {!loading.fetching
                    ? rows.map((row) => {
                        const balance = supplierBalance(row.currentBalance);
                        return (
                          <tr
                            key={row.id}
                            className="cursor-pointer"
                            onClick={() => setDetail(row)}
                          >
                            {show("name") ? (
                              <Td>
                                <EntityCell
                                  title={row.name}
                                  subtitle={row.phone ? formatPkMobile(row.phone) : "No phone"}
                                  tone="teal"
                                />
                              </Td>
                            ) : null}
                            {show("phone") ? (
                              <Td>{row.phone ? formatPkMobile(row.phone) : "—"}</Td>
                            ) : null}
                            {show("address") ? <Td>{row.address || "—"}</Td> : null}
                            {show("city") ? <Td>{row.cityName || "—"}</Td> : null}
                            {show("balance") ? (
                              <Td numeric>
                                <span
                                  className={cn(
                                    "supplier-balance",
                                    row.currentBalance > 0 && "is-owe",
                                    row.currentBalance < 0 && "is-advance",
                                  )}
                                >
                                  {balance.amount}
                                  <small>{balance.label}</small>
                                </span>
                              </Td>
                            ) : null}
                            <Td>
                              <div onClick={(event) => event.stopPropagation()}>
                                <Menu>
                                  <MenuItem icon={<Wallet size={14} />} onClick={() => setPay(row)}>
                                    {row.currentBalance < 0
                                      ? SUPPLIER_COPY.receiveFromSupplier
                                      : SUPPLIER_COPY.paySupplier}
                                  </MenuItem>
                                  {canAdjust ? (
                                    <MenuItem
                                      icon={<Scale size={14} />}
                                      onClick={() => setAdjust(row)}
                                    >
                                      {SUPPLIER_COPY.adjustTitle}
                                    </MenuItem>
                                  ) : null}
                                  <MenuItem
                                    icon={<BookOpen size={14} />}
                                    onClick={() => openLedger(row)}
                                  >
                                    Ledger
                                  </MenuItem>
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
                              </div>
                            </Td>
                          </tr>
                        );
                      })
                    : null}
                </tbody>
              </>
            ) : null}
          </Table>
        ) : (
          <Table
            toolbar={
              <HubToolbar
                columns={SUPPLIER_LEDGER_COLUMNS}
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
                filterFields={SUPPLIER_LEDGER_FILTER_FIELDS}
                search={ledgerSearch}
                onSearch={(value) => {
                  setLedgerSearch(value);
                  setLedgerPage(1);
                }}
                searchPlaceholder={SUPPLIER_LEDGER_SEARCH_PLACEHOLDER}
                view={view}
                onView={setView}
                dateRange={dateRange}
                onDateRange={(range) => {
                  setDateRange(range);
                  setLedgerPage(1);
                }}
              />
            }
            note={
              view === "table" ? (
                <p className="ui-ledger-hint">{SUPPLIER_COPY.ledgerColumnsHint}</p>
              ) : undefined
            }
            body={
              view === "insights" ? (
                <HubChartGrid>
                  <HubChart
                    type="bar"
                    title="Purchases by supplier"
                    subtitle="Debit adds payable"
                    data={ledgerBySupplier}
                    formatValue={money}
                    maxItems={8}
                  />
                  <HubChart type="donut" title="Ledger types" data={ledgerByType} />
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
                  {!loading.ledger && ledgerRows.length > 0 ? (
                    <tr className="supplier-ledger-totals">
                      {showLedger("occurredAt") ? <Th>{SUPPLIER_COPY.ledgerTotals}</Th> : null}
                      {showLedger("supplier") ? <Th /> : null}
                      {showLedger("type") ? <Th /> : null}
                      {showLedger("debit") ? (
                        <Th className="text-right">
                          <span className="ledger-amount is-owe">{money(ledgerTotals.debit)}</span>
                        </Th>
                      ) : null}
                      {showLedger("credit") ? (
                        <Th className="text-right">
                          <span className="ledger-amount is-out">{money(ledgerTotals.credit)}</span>
                        </Th>
                      ) : null}
                      {showLedger("balance") ? <Th /> : null}
                      {showLedger("notes") ? <Th /> : null}
                    </tr>
                  ) : null}
                  <tr>
                    {showLedger("occurredAt") ? <Th>When</Th> : null}
                    {showLedger("supplier") ? <Th>Supplier</Th> : null}
                    {showLedger("type") ? <Th>Type</Th> : null}
                    {showLedger("debit") ? (
                      <Th hint={SUPPLIER_COPY.ledgerDebitHint}>
                        {SUPPLIER_COPY.ledgerDebitColumn}
                      </Th>
                    ) : null}
                    {showLedger("credit") ? (
                      <Th hint={SUPPLIER_COPY.ledgerCreditHint}>
                        {SUPPLIER_COPY.ledgerCreditColumn}
                      </Th>
                    ) : null}
                    {showLedger("balance") ? <Th>Balance after</Th> : null}
                    {showLedger("notes") ? <Th>Notes</Th> : null}
                  </tr>
                </THead>
                <tbody>
                  {loading.ledger ? (
                    <TableRowsSkeleton columnCount={ledgerCols.length} rows={6} />
                  ) : null}
                  {!loading.ledger && ledgerRows.length === 0 ? (
                    <EmptyRow cols={ledgerCols.length} text={SUPPLIER_COPY.ledgerEmpty} />
                  ) : null}
                  {!loading.ledger
                    ? ledgerRows.map((row) => (
                        <tr key={row.id}>
                          {showLedger("occurredAt") ? <Td>{when(row.occurredAt)}</Td> : null}
                          {showLedger("supplier") ? <Td>{row.supplierName || "—"}</Td> : null}
                          {showLedger("type") ? (
                            <Td>{supplierLedgerTypeLabel(row.entryType)}</Td>
                          ) : null}
                          {showLedger("debit") ? (
                            <Td numeric>
                              {row.debit ? (
                                <span
                                  className={supplierLedgerDebitClass(row.entryType, row.debit)}
                                >
                                  {money(row.debit)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </Td>
                          ) : null}
                          {showLedger("credit") ? (
                            <Td numeric>
                              {row.credit ? (
                                <span
                                  className={supplierLedgerCreditClass(row.entryType, row.credit)}
                                >
                                  {money(row.credit)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </Td>
                          ) : null}
                          {showLedger("balance") ? (
                            <Td numeric>
                              <div
                                className={cn(
                                  "supplier-balance",
                                  row.balanceAfter > 0 && "is-owe",
                                  row.balanceAfter < 0 && "is-advance",
                                )}
                              >
                                {supplierBalance(row.balanceAfter).amount}
                                <small>{supplierBalance(row.balanceAfter).label}</small>
                              </div>
                            </Td>
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
        <SupplierDetailDrawer
          supplier={detail}
          canAdjust={canAdjust}
          onClose={() => setDetail(null)}
          onEdit={setEdit}
          onPay={setPay}
          onAdjust={setAdjust}
          onLedger={openLedger}
        />
      ) : null}

      <Drawer
        open={Boolean(edit)}
        title={isNew ? "Add supplier" : "Edit supplier"}
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
              {loading.saving ? "Saving…" : isNew ? "Add supplier" : "Save changes"}
            </Button>
          </>
        }
      >
        {edit ? (
          <SupplierEditForm key={edit.id} row={edit} isNew={isNew} onValid={saveSupplier} />
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(adjust)}
        title={SUPPLIER_COPY.adjustTitle}
        onClose={() => setAdjust(null)}
        footer={
          <>
            <Button onClick={() => setAdjust(null)} disabled={loading.adjusting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={SUPPLIER_ADJUST_FORM_ID}
              disabled={loading.adjusting}
            >
              {loading.adjusting ? "Saving…" : "Save adjustment"}
            </Button>
          </>
        }
      >
        {adjust ? <SupplierAdjustForm key={adjust.id} row={adjust} onValid={saveAdjust} /> : null}
      </Drawer>

      <Drawer
        open={Boolean(pay)}
        title={SUPPLIER_COPY.payTitle}
        onClose={() => setPay(null)}
        footer={
          <>
            <Button onClick={() => setPay(null)} disabled={loading.paying}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={SUPPLIER_PAY_FORM_ID}
              disabled={loading.paying}
            >
              {loading.paying
                ? "Saving…"
                : pay && pay.currentBalance < 0
                  ? SUPPLIER_COPY.receiveFromSupplier
                  : SUPPLIER_COPY.paySupplier}
            </Button>
          </>
        }
      >
        {pay ? <SupplierPayForm key={pay.id} row={pay} onValid={savePayment} /> : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete supplier?"
        body="Blocked if lots still point here."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) return;
          setLoading((current) => ({ ...current, deleting: true }));
          void deleteMasterRecord("suppliers", remove.id)
            .then(() => {
              setReloadKey((key) => key + 1);
              toaster.success(SUPPLIER_COPY.removed);
            })
            .catch((error) =>
              toaster.error(
                error instanceof Error && error.message.trim()
                  ? error.message.trim()
                  : SUPPLIER_COPY.removeFailed,
              ),
            )
            .finally(() => {
              setLoading((current) => ({ ...current, deleting: false }));
              setRemove(null);
            });
        }}
      />
    </div>
  );
}
