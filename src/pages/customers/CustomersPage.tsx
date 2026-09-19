import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CircleDot,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Scale,
  ShoppingBag,
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
  MoneyDisplay,
  MoneyInput,
  PageHead,
  PhoneField,
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
  Toggle,
  toaster,
} from "@/components/common";
import type { DateRangeFilter } from "@/components/common/DateRangePeriodPicker";
import type { FilterChip } from "@/components/common/FilterPicker";
import { rangeForPeriod } from "@/components/common/DateRangePeriodPicker";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import type { DomainCustomer } from "@/shared/domain/types";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { useQueryTab } from "@/hooks/useQueryTab";
import { assignApiError, fieldMessage } from "@/utils/form";
import {
  adjustDelta,
  balanceInputDraft,
  cn,
  formatEntityRef,
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
import { adjustCustomerBalance } from "@/services/balances";
import {
  getCustomerLedger,
  listAllCustomerLedgers,
  listCustomerLedgers,
  mapCustomer,
  recordCustomerPayment,
  type CustomerLedgerEntry,
} from "@/services/credit";
import { DEFAULT_LEDGER_DATE_PERIOD } from "@/shared/constants/charts";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import { listEmptyMessage } from "@/shared/constants/empty";
import { createLoadGuard } from "@/utils/async";
import {
  CUSTOMER_BALANCE_ADVANCE,
  CUSTOMER_BALANCE_OWES,
  CUSTOMER_BALANCE_SETTLED,
  CUSTOMER_COPY,
  CUSTOMER_FILTER_FIELDS,
  CUSTOMER_LEDGER_COLUMNS,
  CUSTOMER_LEDGER_FILTER_FIELDS,
  CUSTOMER_LEDGER_SEARCH_PLACEHOLDER,
  CUSTOMER_OPENING_ADVANCE,
  CUSTOMER_OPENING_OWES,
  CUSTOMER_PAY_METHODS,
  CUSTOMER_PLACEHOLDERS,
  CUSTOMER_SEARCH_PLACEHOLDER,
  CUSTOMER_STATUS_ACTIVE,
  CUSTOMER_STATUS_INACTIVE,
  CUSTOMER_TAB_CUSTOMERS,
  CUSTOMER_TAB_LEDGER,
  CUSTOMER_TABLE_COLUMNS,
  CUSTOMER_TABS,
  customerCanAdjust,
  customerLedgerCreditClass,
  customerLedgerDebitClass,
  customerLedgerTypeLabel,
} from "@/shared/constants/customers";
import {
  validateAdjustBalanceNotes,
  validateCustomerName,
  validateCustomerPhone,
} from "@/validations/customer.validation";

const PAGE = DEFAULT_PAGE_SIZE;
const CUSTOMER_FORM_ID = "customer-form";
const CUSTOMER_ADJUST_FORM_ID = "customer-adjust-form";
const CUSTOMER_PAY_FORM_ID = "customer-pay-form";
const blank: DomainCustomer = {
  id: "",
  name: "",
  phone: "",
  address: "",
  currentBalance: 0,
  notes: "",
  isActive: true,
};

type CustomerFormValues = {
  name: string;
  phone: string;
  address: string;
  previousBalance: string;
  openingSide: typeof CUSTOMER_OPENING_OWES | typeof CUSTOMER_OPENING_ADVANCE;
  isActive: boolean;
};

function openingAmount(raw: string | undefined) {
  const cleaned = (raw ?? "").replace(/,/g, "").trim();
  const value = Math.abs(Number(cleaned));
  return Number.isFinite(value) ? value : 0;
}

function customerBalance(n: number) {
  if (n > 0) return { amount: money(n), label: CUSTOMER_BALANCE_OWES, tone: "warn" as const };
  if (n < 0) return { amount: money(-n), label: CUSTOMER_BALANCE_ADVANCE, tone: "ok" as const };
  return { amount: money(0), label: CUSTOMER_BALANCE_SETTLED, tone: "neutral" as const };
}

function customerTargetBalance(amount: string, side: "owe" | "advance") {
  const magnitude = openingAmount(amount);
  return side === "owe" ? magnitude : -magnitude;
}

function CustomerEditForm({
  customer,
  isNew,
  onValid,
}: {
  customer: DomainCustomer;
  isNew: boolean;
  onValid: (values: CustomerFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors },
  } = useAppForm<CustomerFormValues>({
    defaultValues: {
      name: customer.name,
      phone: formatPkMobile(customer.phone),
      address: customer.address,
      previousBalance: "",
      openingSide: CUSTOMER_OPENING_OWES,
      isActive: customer.isActive,
    },
  });
  const openingSide = watch("openingSide");
  const previousBalance = watch("previousBalance");

  return (
    <form
      id={CUSTOMER_FORM_ID}
      className="supplier-form"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, CUSTOMER_COPY.saveFailed), "name");
        }
      })}
    >
      <Field label="Name" error={fieldMessage(errors, "name")}>
        <TextInput
          autoFocus
          startIcon={<UserRound size={15} />}
          placeholder={CUSTOMER_PLACEHOLDERS.name}
          maxLength={FIELD_LIMITS.name}
          {...register("name", { validate: validateCustomerName })}
        />
      </Field>
      <Controller
        name="phone"
        control={control}
        rules={{ validate: validateCustomerPhone }}
        render={({ field }) => (
          <PhoneField
            error={fieldMessage(errors, "phone")}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <Field label="Address">
        <TextInput
          startIcon={<MapPin size={15} />}
          placeholder={CUSTOMER_PLACEHOLDERS.address}
          maxLength={FIELD_LIMITS.address}
          {...register("address")}
        />
      </Field>
      {isNew ? (
        <div
          className={cn(
            "supplier-opening",
            openingSide === CUSTOMER_OPENING_ADVANCE ? "is-advance" : "is-owe",
            !openingAmount(previousBalance) && "is-zero",
          )}
        >
          <p className="supplier-opening-label">{CUSTOMER_COPY.openingLabel}</p>
          <Controller
            name="openingSide"
            control={control}
            render={({ field }) => (
              <div className="supplier-opening-sides">
                <button
                  type="button"
                  className={cn(
                    "supplier-opening-side is-owe",
                    field.value === CUSTOMER_OPENING_OWES && "is-on",
                  )}
                  onClick={() => field.onChange(CUSTOMER_OPENING_OWES)}
                >
                  {CUSTOMER_COPY.owes}
                </button>
                <button
                  type="button"
                  className={cn(
                    "supplier-opening-side is-advance",
                    field.value === CUSTOMER_OPENING_ADVANCE && "is-on",
                  )}
                  onClick={() => field.onChange(CUSTOMER_OPENING_ADVANCE)}
                >
                  {CUSTOMER_COPY.advance}
                </button>
              </div>
            )}
          />
          <Field
            label="Amount"
            hint={
              openingSide === CUSTOMER_OPENING_ADVANCE
                ? CUSTOMER_COPY.advanceHint
                : CUSTOMER_COPY.owesHint
            }
          >
            <Controller
              name="previousBalance"
              control={control}
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
          <p className="supplier-opening-readout">
            {openingAmount(previousBalance)
              ? `${money(openingAmount(previousBalance))} — ${openingSide === CUSTOMER_OPENING_ADVANCE ? CUSTOMER_COPY.advanceSummary : CUSTOMER_COPY.owesSummary}`
              : CUSTOMER_COPY.openingNone}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "supplier-opening",
            customer.currentBalance < 0
              ? "is-advance"
              : customer.currentBalance > 0
                ? "is-owe"
                : "is-zero",
          )}
        >
          <Field
            label="Balance"
            hint={`${customer.currentBalance < 0 ? CUSTOMER_COPY.advance : customer.currentBalance > 0 ? CUSTOMER_COPY.owes : CUSTOMER_BALANCE_SETTLED} · ${CUSTOMER_COPY.ledgerBalanceHint}`}
          >
            <MoneyDisplay value={customer.currentBalance} />
          </Field>
        </div>
      )}
      <div className="supplier-active-card">
        <div>
          <strong>Active customer</strong>
          <span>Show when selling on name</span>
        </div>
        <Controller
          name="isActive"
          control={control}
          render={({ field }) => (
            <Toggle checked={field.value} onChange={field.onChange} label="" />
          )}
        />
      </div>
    </form>
  );
}

function CustomerAdjustForm({
  customer,
  onValid,
}: {
  customer: DomainCustomer;
  onValid: (values: { amount: string; side: "owe" | "advance"; notes: string }) => Promise<void>;
}) {
  const {
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors },
  } = useAppForm({
    defaultValues: {
      amount: balanceInputDraft(customer.currentBalance),
      side: (customer.currentBalance < 0 ? "advance" : "owe") as "owe" | "advance",
      notes: "",
    },
  });
  const side = watch("side");
  const amount = watch("amount");
  const current = customerBalance(customer.currentBalance);
  const balanceAfter = customerTargetBalance(amount, side);
  const delta = balanceAfter - customer.currentBalance;
  const after = customerBalance(balanceAfter);
  return (
    <form
      id={CUSTOMER_ADJUST_FORM_ID}
      className="supplier-form"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, CUSTOMER_COPY.adjustFailed), "notes");
        }
      })}
    >
      <Field
        label={CUSTOMER_COPY.adjustCurrentBalance}
        hint={`${current.label} · ${CUSTOMER_COPY.ledgerBalanceHint}`}
      >
        <div
          className={cn(
            "supplier-balance",
            customer.currentBalance > 0 && "is-owe",
            customer.currentBalance < 0 && "is-advance",
          )}
        >
          {current.amount}
          <small>{current.label}</small>
        </div>
      </Field>
      <Field
        label="Adjustment"
        hint={side === "advance" ? CUSTOMER_COPY.advanceHint : CUSTOMER_COPY.owesHint}
      >
        <Controller
          name="side"
          control={control}
          render={({ field }) => (
            <div className="supplier-opening-sides">
              <button
                type="button"
                className={cn("supplier-opening-side is-owe", field.value === "owe" && "is-on")}
                onClick={() => field.onChange("owe")}
              >
                {CUSTOMER_COPY.adjustOwes}
              </button>
              <button
                type="button"
                className={cn(
                  "supplier-opening-side is-advance",
                  field.value === "advance" && "is-on",
                )}
                onClick={() => field.onChange("advance")}
              >
                {CUSTOMER_COPY.adjustAdvance}
              </button>
            </div>
          )}
        />
      </Field>
      <Field label={CUSTOMER_COPY.adjustBalanceLabel} error={fieldMessage(errors, "amount")}>
        <Controller
          name="amount"
          control={control}
          rules={{
            validate: (value) => {
              const target = customerTargetBalance(value, side);
              return target !== customer.currentBalance || CUSTOMER_COPY.adjustUnchanged;
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
      <Field label={CUSTOMER_COPY.adjustBalanceAfter} hint={after.label}>
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
      <Field label={CUSTOMER_COPY.adjustNotes} error={fieldMessage(errors, "notes")}>
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
      <p className="ui-note [font-size:12px] [color:var(--muted)]">{CUSTOMER_COPY.adjustHint}</p>
    </form>
  );
}

function CustomerPayForm({
  customer,
  onValid,
}: {
  customer: DomainCustomer;
  onValid: (values: { amount: string; method: string; notes: string }) => Promise<void>;
}) {
  const collecting = customer.currentBalance >= 0;
  const {
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useAppForm({
    defaultValues: { amount: "", method: "CASH", notes: "" },
  });
  const balance = customerBalance(customer.currentBalance);
  return (
    <form
      id={CUSTOMER_PAY_FORM_ID}
      className="supplier-form"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, CUSTOMER_COPY.payFailed), "amount");
        }
      })}
    >
      <Field
        label="Current balance"
        hint={collecting ? CUSTOMER_COPY.collectHint : CUSTOMER_COPY.refundHint}
      >
        <div
          className={cn(
            "supplier-balance",
            customer.currentBalance > 0 && "is-owe",
            customer.currentBalance < 0 && "is-advance",
          )}
        >
          {balance.amount}
          <small>{balance.label}</small>
        </div>
      </Field>
      <Field
        label={collecting ? CUSTOMER_COPY.collectPayment : CUSTOMER_COPY.refundAdvance}
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
              {CUSTOMER_PAY_METHODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
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

function mapRow(record: MasterRecord): DomainCustomer {
  return mapCustomer(record, record.balance ?? 0);
}

function chipValue(chips: FilterChip[], field: string) {
  return chips.find((chip) => chip.field === field)?.value;
}

function customerQuery(
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
      status === CUSTOMER_STATUS_ACTIVE
        ? true
        : status === CUSTOMER_STATUS_INACTIVE
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

export function CustomersPage() {
  const [tab, setTab] = useQueryTab(CUSTOMER_TABS, CUSTOMER_TAB_CUSTOMERS);
  const [rows, setRows] = useState<DomainCustomer[]>([]);
  const [chartRows, setChartRows] = useState<DomainCustomer[]>([]);
  const [search, setSearch] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [counts, setCounts] = useState({ all: 0, active: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [edit, setEdit] = useState<DomainCustomer | null>(null);
  const [detail, setDetail] = useState<DomainCustomer | null>(null);
  const [detailStats, setDetailStats] = useState<{
    totalShopping: number;
    creditSales: number;
  } | null>(null);
  const [remove, setRemove] = useState<DomainCustomer | null>(null);
  const [adjust, setAdjust] = useState<DomainCustomer | null>(null);
  const [pay, setPay] = useState<DomainCustomer | null>(null);
  const [view, setView] = useState<HubView>("table");
  const [cols, setCols] = useState(CUSTOMER_TABLE_COLUMNS.map((col) => col.id));
  const [ledgerCols, setLedgerCols] = useState(CUSTOMER_LEDGER_COLUMNS.map((col) => col.id));
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerChips, setLedgerChips] = useState<FilterChip[]>([]);
  const [ledgerRows, setLedgerRows] = useState<CustomerLedgerEntry[]>([]);
  const [ledgerFiltered, setLedgerFiltered] = useState<CustomerLedgerEntry[]>([]);
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

  const filters = useMemo(() => customerQuery(search, chips), [chips, search]);
  const canAdjust = customerCanAdjust(viewerRole);
  const statusChip = chipValue(chips, "status");
  const balanceChip = chipValue(chips, "balance");
  const kpi =
    !statusChip && !balanceChip
      ? "all"
      : statusChip === CUSTOMER_STATUS_ACTIVE
        ? "active"
        : balanceChip === CUSTOMER_BALANCE_OWES
          ? "owes"
          : balanceChip === CUSTOMER_BALANCE_ADVANCE
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
    listMasterRecords("customers", { ...filters, page, perPage: pageSize }, controller.signal)
      .then((response) => {
        if (!guard.isActive()) return;
        setRows(response.data.map(mapRow));
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
      listMasterRecords("customers", { page: 1, perPage: 1 }, controller.signal),
      listMasterRecords("customers", { page: 1, perPage: 1, isActive: true }, controller.signal),
      listAllMasterRecords("customers", filters, controller.signal),
    ])
      .then(([all, active, matching]) => {
        setCounts({ all: all.meta.totalItems, active: active.meta.totalItems });
        setChartRows(matching.map(mapRow));
      })
      .catch(() => {
        setCounts({ all: 0, active: 0 });
        setChartRows([]);
      });
    return () => controller.abort();
  }, [filters, reloadKey]);

  useEffect(() => {
    if (tab !== CUSTOMER_TAB_LEDGER) return;
    const controller = new AbortController();
    const debit = Number(chipValue(ledgerChips, "debit"));
    const credit = Number(chipValue(ledgerChips, "credit"));
    const params = {
      search: ledgerSearch,
      customer: chipValue(ledgerChips, "customer"),
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
      listCustomerLedgers(
        { ...params, page: ledgerPage, perPage: ledgerPageSize },
        controller.signal,
      ),
      listAllCustomerLedgers(params, controller.signal),
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

  useEffect(() => {
    if (!detail) {
      setDetailStats(null);
      return;
    }
    const controller = new AbortController();
    getCustomerLedger(detail.id, controller.signal)
      .then((ledger) => {
        const sales = ledger.entries.filter((entry) => entry.entryType === "SALE");
        setDetailStats({
          totalShopping: sales.reduce((sum, entry) => sum + entry.debit, 0),
          creditSales: sales.length,
        });
      })
      .catch(() => setDetailStats(null));
    return () => controller.abort();
  }, [detail?.id]);

  const isNew = Boolean(
    edit && !rows.some((row) => row.id === edit.id) && !chartRows.some((row) => row.id === edit.id),
  );
  const show = (id: string) => cols.includes(id);
  const showLedger = (id: string) => ledgerCols.includes(id);
  const toCollect = chartRows
    .filter((row) => row.currentBalance > 0)
    .reduce((sum, row) => sum + row.currentBalance, 0);
  const advanceHeld = Math.abs(
    chartRows
      .filter((row) => row.currentBalance < 0)
      .reduce((sum, row) => sum + row.currentBalance, 0),
  );

  function applyKpi(next: "all" | "active" | "owes" | "advance") {
    setKpiPicked(true);
    setTab(CUSTOMER_TAB_CUSTOMERS);
    setPage(1);
    setChips((current) => {
      const kept = current.filter((chip) => chip.field !== "status" && chip.field !== "balance");
      if (next === "all" || next === kpi) return kept;
      if (next === "active")
        return [...kept, { field: "status", label: "Status", value: CUSTOMER_STATUS_ACTIVE }];
      if (next === "owes")
        return [...kept, { field: "balance", label: "Balance", value: CUSTOMER_BALANCE_OWES }];
      return [...kept, { field: "balance", label: "Balance", value: CUSTOMER_BALANCE_ADVANCE }];
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

  function openLedger(row: DomainCustomer) {
    setTab(CUSTOMER_TAB_LEDGER);
    setLedgerChips([{ field: "customer", label: "Customer", value: row.name }]);
    setLedgerPage(1);
  }

  async function saveCustomer(values: CustomerFormValues) {
    if (!edit) return;
    const phone = pkMobileDigits(values.phone);
    setLoading((current) => ({ ...current, saving: true }));
    try {
      const payload = {
        name: values.name.trim(),
        phone: phone || undefined,
        address: values.address.trim(),
        isActive: values.isActive,
        isWalkIn: false,
        ...(isNew && openingAmount(values.previousBalance)
          ? {
              previousBalance:
                (values.openingSide === CUSTOMER_OPENING_ADVANCE ? -1 : 1) *
                openingAmount(values.previousBalance),
            }
          : {}),
      };
      if (isNew) await createMasterRecord("customers", payload);
      else await updateMasterRecord("customers", edit.id, payload);
      setEdit(null);
      setPage(1);
      setReloadKey((key) => key + 1);
      toaster.success(isNew ? CUSTOMER_COPY.saved : CUSTOMER_COPY.updated);
    } catch (error) {
      toaster.error(shortError(error, CUSTOMER_COPY.saveFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, saving: false }));
    }
  }

  async function saveAdjust(values: { amount: string; side: "owe" | "advance"; notes: string }) {
    if (!adjust) return;
    const target = customerTargetBalance(values.amount, values.side);
    const delta = target - adjust.currentBalance;
    setLoading((current) => ({ ...current, adjusting: true }));
    try {
      await adjustCustomerBalance(adjust.id, delta, values.notes.trim());
      setAdjust(null);
      setReloadKey((key) => key + 1);
      toaster.success(CUSTOMER_COPY.adjustSaved);
    } catch (error) {
      toaster.error(shortError(error, CUSTOMER_COPY.adjustFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, adjusting: false }));
    }
  }

  async function savePayment(values: { amount: string; method: string; notes: string }) {
    if (!pay) return;
    setLoading((current) => ({ ...current, paying: true }));
    try {
      await recordCustomerPayment(pay.id, {
        amount: Number(values.amount),
        paymentMethod: values.method,
        notes: values.notes.trim() || undefined,
      });
      setPay(null);
      setReloadKey((key) => key + 1);
      toaster.success(CUSTOMER_COPY.paySaved);
    } catch (error) {
      toaster.error(shortError(error, CUSTOMER_COPY.payFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, paying: false }));
    }
  }

  const customerChart = chartRows
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
      label: CUSTOMER_STATUS_ACTIVE,
      value: chartRows.filter((row) => row.isActive).length,
    },
    {
      id: "inactive",
      label: CUSTOMER_STATUS_INACTIVE,
      value: chartRows.filter((row) => !row.isActive).length,
    },
  ].filter((point) => point.value > 0);
  const ledgerByCustomer = Object.values(
    ledgerFiltered.reduce<Record<string, { id: string; label: string; value: number }>>(
      (acc, row) => {
        const key = row.customerId;
        acc[key] ??= { id: key, label: row.customerName ?? key, value: 0 };
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
          label: customerLedgerTypeLabel(row.entryType),
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
        title={CUSTOMER_COPY.title}
        subtitle={CUSTOMER_COPY.pageSubtitle}
        icon={<UserRound size={17} />}
      >
        <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
          {CUSTOMER_COPY.add}
        </Button>
      </PageHead>
      <div className="ui-kpi-row grid shrink-0 grid-cols-4 gap-2.5">
        <KpiCard
          label="All customers"
          value={counts.all}
          hint="Saved contacts"
          tone="info"
          icon={<UserRound size={16} />}
          active={kpiPicked && kpi === "all"}
          onClick={() => applyKpi("all")}
        />
        <KpiCard
          label="Active"
          value={counts.active}
          hint="Can sell on name"
          tone="ok"
          active={kpi === "active"}
          onClick={() => applyKpi("active")}
        />
        <KpiCard
          label="To collect"
          value={money(toCollect)}
          hint={CUSTOMER_COPY.owesKpiHint}
          tone="warn"
          active={kpi === "owes"}
          onClick={() => applyKpi("owes")}
        />
        <KpiCard
          label="Advance held"
          value={money(advanceHeld)}
          hint={CUSTOMER_COPY.advanceKpiHint}
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
            items={[...CUSTOMER_TABS]}
          />
        }
      >
        {tab === CUSTOMER_TAB_CUSTOMERS ? (
          <Table
            toolbar={
              <HubToolbar
                columns={CUSTOMER_TABLE_COLUMNS}
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
                filterFields={CUSTOMER_FILTER_FIELDS}
                search={search}
                onSearch={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                searchPlaceholder={CUSTOMER_SEARCH_PLACEHOLDER}
                view={view}
                onView={setView}
              />
            }
            body={
              view === "insights" ? (
                <HubChartGrid>
                  <HubChart
                    type="bar"
                    title={CUSTOMER_COPY.largestBalances}
                    subtitle={CUSTOMER_COPY.largestBalancesSubtitle}
                    data={customerChart}
                    formatValue={money}
                    maxItems={8}
                  />
                  <HubChart type="donut" title="Customer status" data={statusChart} />
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
                    {show("balance") ? <Th>Balance</Th> : null}
                    {show("status") ? <Th>Status</Th> : null}
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
                        const balance = customerBalance(row.currentBalance);
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
                                  tone="blue"
                                />
                              </Td>
                            ) : null}
                            {show("phone") ? (
                              <Td>{row.phone ? formatPkMobile(row.phone) : "—"}</Td>
                            ) : null}
                            {show("address") ? <Td>{row.address || "—"}</Td> : null}
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
                            {show("status") ? (
                              <Td>
                                <Badge tone={row.isActive ? "ok" : "danger"}>
                                  {row.isActive ? CUSTOMER_STATUS_ACTIVE : CUSTOMER_STATUS_INACTIVE}
                                </Badge>
                              </Td>
                            ) : null}
                            <Td>
                              <div onClick={(event) => event.stopPropagation()}>
                                <Menu>
                                  <MenuItem icon={<Wallet size={14} />} onClick={() => setPay(row)}>
                                    {row.currentBalance < 0
                                      ? CUSTOMER_COPY.refundAdvance
                                      : CUSTOMER_COPY.collectPayment}
                                  </MenuItem>
                                  {canAdjust ? (
                                    <MenuItem
                                      icon={<Scale size={14} />}
                                      onClick={() => setAdjust(row)}
                                    >
                                      {CUSTOMER_COPY.adjustTitle}
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
                columns={CUSTOMER_LEDGER_COLUMNS}
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
                filterFields={CUSTOMER_LEDGER_FILTER_FIELDS}
                search={ledgerSearch}
                onSearch={(value) => {
                  setLedgerSearch(value);
                  setLedgerPage(1);
                }}
                searchPlaceholder={CUSTOMER_LEDGER_SEARCH_PLACEHOLDER}
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
                <p className="ui-ledger-hint">{CUSTOMER_COPY.ledgerColumnsHint}</p>
              ) : undefined
            }
            body={
              view === "insights" ? (
                <HubChartGrid>
                  <HubChart
                    type="bar"
                    title="Sales by customer"
                    subtitle="Debit adds owes"
                    data={ledgerByCustomer}
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
                      {showLedger("occurredAt") ? <Th>{CUSTOMER_COPY.ledgerTotals}</Th> : null}
                      {showLedger("customer") ? <Th /> : null}
                      {showLedger("type") ? <Th /> : null}
                      {showLedger("debit") ? (
                        <Th className="text-right">
                          <span className="ledger-amount is-owe">{money(ledgerTotals.debit)}</span>
                        </Th>
                      ) : null}
                      {showLedger("credit") ? (
                        <Th className="text-right">
                          <span className="ledger-amount is-in">{money(ledgerTotals.credit)}</span>
                        </Th>
                      ) : null}
                      {showLedger("balance") ? <Th /> : null}
                      {showLedger("notes") ? <Th /> : null}
                    </tr>
                  ) : null}
                  <tr>
                    {showLedger("occurredAt") ? <Th>When</Th> : null}
                    {showLedger("customer") ? <Th>Customer</Th> : null}
                    {showLedger("type") ? <Th>Type</Th> : null}
                    {showLedger("debit") ? (
                      <Th hint={CUSTOMER_COPY.ledgerDebitHint}>
                        {CUSTOMER_COPY.ledgerDebitColumn}
                      </Th>
                    ) : null}
                    {showLedger("credit") ? (
                      <Th hint={CUSTOMER_COPY.ledgerCreditHint}>
                        {CUSTOMER_COPY.ledgerCreditColumn}
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
                    <EmptyRow cols={ledgerCols.length} text={CUSTOMER_COPY.ledgerEmpty} />
                  ) : null}
                  {!loading.ledger
                    ? ledgerRows.map((row) => (
                        <tr key={row.id}>
                          {showLedger("occurredAt") ? <Td>{when(row.occurredAt)}</Td> : null}
                          {showLedger("customer") ? <Td>{row.customerName || "—"}</Td> : null}
                          {showLedger("type") ? (
                            <Td>{customerLedgerTypeLabel(row.entryType)}</Td>
                          ) : null}
                          {showLedger("debit") ? (
                            <Td numeric>
                              {row.debit ? (
                                <span
                                  className={customerLedgerDebitClass(row.entryType, row.debit)}
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
                                  className={customerLedgerCreditClass(row.entryType, row.credit)}
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
                                {customerBalance(row.balanceAfter).amount}
                                <small>{customerBalance(row.balanceAfter).label}</small>
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
        <EntityDetailDrawer
          open
          title={CUSTOMER_COPY.detailTitle}
          subtitle={CUSTOMER_COPY.detailSubtitle}
          onClose={() => setDetail(null)}
          identity={{
            name: detail.name,
            reference: formatEntityRef("CUS", detail.id),
            referenceLabel: CUSTOMER_COPY.detailReferenceLabel,
            badge: (
              <Badge tone={detail.isActive ? "ok" : "danger"}>
                {detail.isActive ? CUSTOMER_STATUS_ACTIVE : CUSTOMER_STATUS_INACTIVE}
              </Badge>
            ),
            icon: <UserRound size={18} />,
            tone: "blue",
          }}
          summaries={[
            {
              label: "Balance",
              value: customerBalance(detail.currentBalance).amount,
              hint: customerBalance(detail.currentBalance).label,
              tone:
                detail.currentBalance > 0
                  ? "owe"
                  : detail.currentBalance < 0
                    ? "advance"
                    : "neutral",
              icon: <Wallet size={15} />,
            },
            {
              label: "Status",
              value: detail.isActive ? CUSTOMER_STATUS_ACTIVE : CUSTOMER_STATUS_INACTIVE,
              hint: detail.isActive
                ? CUSTOMER_COPY.statusActiveHint
                : CUSTOMER_COPY.statusInactiveHint,
              tone: detail.isActive ? "ok" : "danger",
              icon: <CircleDot size={15} />,
            },
          ]}
          fieldsSectionTitle={CUSTOMER_COPY.contactSection}
          onEditFields={() => {
            setDetail(null);
            setEdit(detail);
          }}
          fields={[
            { label: "Name", value: detail.name, icon: <UserRound size={14} /> },
            {
              label: "Phone",
              value: detail.phone ? formatPkMobile(detail.phone) : "—",
              icon: <Phone size={14} />,
              emptyHint: CUSTOMER_COPY.noPhoneHint,
            },
            {
              label: "Address",
              value: detail.address || "—",
              icon: <MapPin size={14} />,
              emptyHint: CUSTOMER_COPY.noAddressHint,
            },
            {
              label: CUSTOMER_COPY.totalShopping,
              value: detailStats ? money(detailStats.totalShopping) : "—",
              icon: <ShoppingBag size={14} />,
            },
            {
              label: CUSTOMER_COPY.creditSales,
              value: detailStats ? String(detailStats.creditSales) : "—",
              icon: <Receipt size={14} />,
            },
          ]}
          actions={[
            {
              label:
                detail.currentBalance < 0
                  ? CUSTOMER_COPY.refundAdvance
                  : CUSTOMER_COPY.collectPayment,
              description: CUSTOMER_COPY.collectPaymentAction,
              icon: <Wallet size={15} />,
              tone: "accent" as const,
              onClick: () => {
                setDetail(null);
                setPay(detail);
              },
            },
            ...(canAdjust
              ? [
                  {
                    label: CUSTOMER_COPY.adjustTitle,
                    description: CUSTOMER_COPY.adjustBalanceAction,
                    icon: <Scale size={15} />,
                    tone: "warn",
                    onClick: () => {
                      setDetail(null);
                      setAdjust(detail);
                    },
                  } satisfies DetailAction,
                ]
              : []),
            {
              label: CUSTOMER_COPY.viewLedger,
              description: CUSTOMER_COPY.viewLedgerAction,
              icon: <BookOpen size={15} />,
              tone: "info" as const,
              onClick: () => {
                setDetail(null);
                openLedger(detail);
              },
            },
            {
              label: "Edit customer",
              description: CUSTOMER_COPY.editCustomerAction,
              icon: <Pencil size={15} />,
              tone: "edit" as const,
              onClick: () => {
                setDetail(null);
                setEdit(detail);
              },
            },
          ]}
          meta={{ createdAt: detail.createdAt, updatedAt: detail.updatedAt }}
        />
      ) : null}

      <Drawer
        open={Boolean(edit)}
        title={isNew ? "Add customer" : "Edit customer"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)} disabled={loading.saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={CUSTOMER_FORM_ID}
              disabled={loading.saving}
            >
              {loading.saving ? "Saving…" : isNew ? CUSTOMER_COPY.add : "Save changes"}
            </Button>
          </>
        }
      >
        {edit ? (
          <CustomerEditForm key={edit.id} customer={edit} isNew={isNew} onValid={saveCustomer} />
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(adjust)}
        title={CUSTOMER_COPY.adjustTitle}
        onClose={() => setAdjust(null)}
        footer={
          <>
            <Button onClick={() => setAdjust(null)} disabled={loading.adjusting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={CUSTOMER_ADJUST_FORM_ID}
              disabled={loading.adjusting}
            >
              {loading.adjusting ? "Saving…" : "Save adjustment"}
            </Button>
          </>
        }
      >
        {adjust ? (
          <CustomerAdjustForm key={adjust.id} customer={adjust} onValid={saveAdjust} />
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(pay)}
        title={CUSTOMER_COPY.payTitle}
        onClose={() => setPay(null)}
        footer={
          <>
            <Button onClick={() => setPay(null)} disabled={loading.paying}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={CUSTOMER_PAY_FORM_ID}
              disabled={loading.paying}
            >
              {loading.paying
                ? "Saving…"
                : pay && pay.currentBalance < 0
                  ? CUSTOMER_COPY.refundAdvance
                  : CUSTOMER_COPY.collectPayment}
            </Button>
          </>
        }
      >
        {pay ? <CustomerPayForm key={pay.id} customer={pay} onValid={savePayment} /> : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete customer?"
        body="Blocked if invoices or ledger lines still point here."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) return;
          setLoading((current) => ({ ...current, deleting: true }));
          void deleteMasterRecord("customers", remove.id)
            .then(() => {
              setReloadKey((key) => key + 1);
              toaster.success(CUSTOMER_COPY.deleted);
            })
            .catch((error) =>
              toaster.error(
                error instanceof Error && error.message.trim()
                  ? error.message.trim()
                  : CUSTOMER_COPY.deleteFailed,
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
