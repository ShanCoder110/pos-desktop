import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookPlus, CreditCard, LayoutGrid, Pencil, Trash2, UserRound } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  CustomerSearch,
  Drawer,
  EmptyRow,
  Field,
  HubChart,
  HubChartGrid,
  KpiCard,
  Menu,
  MenuItem,
  PageHead,
  Pagination,
  SelectInput,
  Skeleton,
  Table,
  TableRowsSkeleton,
  TabSheet,
  Tabs,
  Td,
  TextInput,
  THead,
  Th,
  toaster,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import type { DomainCustomer } from "@/shared/domain/types";
import {
  cn,
  creditState,
  formatTableDateTime,
  limitMoneyDraft,
  money,
  shortError,
} from "@/utils/format";
import { formatPkMobile } from "@/utils/phone";
import {
  CREDIT_COPY,
  CREDIT_DEFAULT_COLUMNS,
  CREDIT_TAB_BOOKS,
  CREDIT_TAB_LEDGER,
  CREDIT_TABLE_COLUMNS,
  CREDIT_TABS,
  CUSTOMER_BALANCE_ADVANCE,
  CUSTOMER_BALANCE_OWES,
  CUSTOMER_BALANCE_SETTLED,
  CUSTOMER_COPY,
  CUSTOMER_FILTER_FIELDS,
  CUSTOMER_LEDGER_COLUMNS,
  CUSTOMER_LEDGER_FILTER_FIELDS,
  CUSTOMER_LEDGER_SEARCH_PLACEHOLDER,
  CUSTOMER_PAY_METHODS,
  creditCustomerHref,
  customerLedgerCreditClass,
  customerLedgerDebitClass,
  customerLedgerTypeLabel,
} from "@/shared/constants/customers";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import { FIELD_LIMITS, FORM_COPY } from "@/shared/constants/fields";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { useQueryTab } from "@/hooks/useQueryTab";
import { assignApiError, fieldMessage } from "@/utils/form";
import { applyFilterChip } from "@/utils/filterChips";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import {
  adjustCustomerBalance,
  listCustomerLedgers,
  mapCustomer,
  recordCustomerPayment,
  type CustomerLedgerEntry,
} from "@/services/credit";
import {
  CREDIT_CUSTOMER_EDIT_FORM_ID,
  CreditCustomerEditForm,
  creditBalanceAdjustNote,
  type CreditCustomerEditValues,
} from "@/pages/credit/CreditCustomerEditForm";
import {
  deleteMasterRecord,
  getMasterRecord,
  listAllMasterRecords,
  listMasterRecords,
  updateMasterRecord,
  type MasterRecord,
} from "@/services/masters";
import { createLoadGuard } from "@/utils/async";
import { chipCsv } from "@/utils/filterQuery";

const PAGE = DEFAULT_PAGE_SIZE;
const CREDIT_PAY_FORM_ID = "credit-book-pay-form";

type CreditTab = (typeof CREDIT_TABS)[number]["id"];
type BalanceKpi = "owe" | "advance" | "settled";

function mapRow(record: MasterRecord): DomainCustomer {
  return mapCustomer(record, record.balance ?? 0);
}

function balanceKpiValue(next: BalanceKpi) {
  if (next === "owe") return CUSTOMER_BALANCE_OWES;
  if (next === "advance") return CUSTOMER_BALANCE_ADVANCE;
  return CUSTOMER_BALANCE_SETTLED;
}

function CreditPayForm({
  customer,
  onValid,
}: {
  customer: DomainCustomer;
  onValid: (values: { amount: string; method: string }) => Promise<void>;
}) {
  const {
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useAppForm({
    defaultValues: { amount: "", method: "CASH" },
  });
  const balance = creditState(customer.currentBalance);

  return (
    <form
      id={CREDIT_PAY_FORM_ID}
      className="grid gap-3"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, CUSTOMER_COPY.payFailed), "amount");
        }
      })}
    >
      <p className="text-[12px] text-muted">
        Current balance: <strong className="text-ink">{balance.text}</strong>
      </p>
      <Field label="Amount received" error={fieldMessage(errors, "amount")}>
        <Controller
          name="amount"
          control={control}
          rules={{
            validate: (value) => {
              const amount = Number(value);
              return (Number.isFinite(amount) && amount > 0) || FORM_COPY.amountRequired;
            },
          }}
          render={({ field }) => (
            <TextInput
              inputMode="decimal"
              maxLength={FIELD_LIMITS.moneyChars}
              value={field.value}
              onChange={(event) => field.onChange(limitMoneyDraft(event.target.value))}
              placeholder="0"
              autoFocus
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
              {CUSTOMER_PAY_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </SelectInput>
          )}
        />
      </Field>
    </form>
  );
}

function AddCreditBookForm({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  onSubmit,
}: {
  customers: DomainCustomer[];
  selectedCustomerId: string;
  onSelectCustomer: (id: string) => void;
  onSubmit: (values: { customerId: string; openingBalance: number }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const [openingBalance, setOpeningBalance] = useState("");

  useEffect(() => {
    setOpeningBalance(selectedCustomer ? String(selectedCustomer.currentBalance) : "");
  }, [selectedCustomer]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId) {
      setError("Please select a customer.");
      return;
    }
    const nextBalance = Number(openingBalance);
    if (!Number.isFinite(nextBalance)) {
      setError("Enter a valid opening balance.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        customerId: selectedCustomerId,
        openingBalance: nextBalance,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="ui-stack grid gap-4" onSubmit={handleSubmit}>
      <Field label="Find customer">
        <CustomerSearch
          customers={customers}
          value={selectedCustomerId}
          onChange={(customer) => {
            setError("");
            onSelectCustomer(customer?.id ?? "");
          }}
          placeholder="Type name or phone"
          emptyMessage="No available customer found"
          autoFocus
        />
      </Field>

      {selectedCustomer ? (
        <Field
          label="Opening balance"
          hint="Positive means the customer owes the shop; negative means advance."
        >
          <TextInput
            inputMode="decimal"
            value={openingBalance}
            onChange={(event) => {
              const raw = event.target.value;
              const negative = raw.trimStart().startsWith("-");
              const amount = limitMoneyDraft(raw);
              setOpeningBalance(negative ? `-${amount}` : amount);
              setError("");
            }}
            placeholder="0"
          />
        </Field>
      ) : null}

      {error ? <p className="text-[12px] text-[var(--danger)]">{error}</p> : null}

      <Button type="submit" variant="primary" disabled={saving || !selectedCustomerId}>
        {saving ? "Adding…" : CREDIT_COPY.addBook}
      </Button>
    </form>
  );
}

function creditBookQuery(search: string, chips: FilterChip[]) {
  return {
    search: search.trim() || undefined,
    name: chipCsv(chips, "name"),
    phone: chipCsv(chips, "phone"),
    address: chipCsv(chips, "address"),
    balance: chipCsv(chips, "balance"),
    inCreditBook: true as const,
    isActive: true as const,
  };
}

export function CreditSalesPage() {
  const navigate = useNavigate();
  const [allMasterCustomers, setAllMasterCustomers] = useState<DomainCustomer[]>([]);
  const [creditCustomers, setCreditCustomers] = useState<DomainCustomer[]>([]);
  const [search, setSearch] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [tab, setTab] = useQueryTab(CREDIT_TABS, CREDIT_TAB_BOOKS);
  const [view, setView] = useState<HubView>("table");
  const [cardView, setCardView] = useState(false);
  const [cols, setCols] = useState<string[]>([...CREDIT_DEFAULT_COLUMNS]);
  const [ledgerCols, setLedgerCols] = useState(CUSTOMER_LEDGER_COLUMNS.map((col) => col.id));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerChips, setLedgerChips] = useState<FilterChip[]>([]);
  const [ledgerRows, setLedgerRows] = useState<CustomerLedgerEntry[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(PAGE);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPages, setLedgerPages] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState({ fetching: true, ledger: false });
  const [bookDrawerOpen, setBookDrawerOpen] = useState(false);
  const [selectedCustomerIdForBook, setSelectedCustomerIdForBook] = useState("");
  const [addedCustomerId, setAddedCustomerId] = useState("");
  const [editCustomer, setEditCustomer] = useState<DomainCustomer | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<DomainCustomer | null>(null);
  const [payCustomer, setPayCustomer] = useState<DomainCustomer | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [paying, setPaying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isBooksTab = tab === CREDIT_TAB_BOOKS;
  const isLedgerTab = tab === CREDIT_TAB_LEDGER;
  const show = (id: string) => cols.includes(id);
  const showLedger = (id: string) => ledgerCols.includes(id);
  const tableColumnCount = cols.length + 1;
  const balanceChip = chipCsv(chips, "balance");

  const bookFilters = useMemo(() => creditBookQuery(search, chips), [chips, search]);

  // Load all customers for the book picker and accurate shop-wide summary cards.
  useEffect(() => {
    const controller = new AbortController();
    async function loadSupportData() {
      const allCustomersData = await listAllMasterRecords(
        "customers",
        { isActive: true },
        controller.signal,
      );
      setAllMasterCustomers(allCustomersData.map(mapRow));
    }
    void loadSupportData().catch(() => {
      setAllMasterCustomers([]);
    });
    return () => controller.abort();
  }, [reloadKey]);

  // Credit book table: server-filtered enrolled customers
  useEffect(() => {
    if (!isBooksTab) return;
    const controller = new AbortController();
    const guard = createLoadGuard();
    setLoading((current) => ({ ...current, fetching: true }));
    listMasterRecords(
      "customers",
      {
        ...bookFilters,
        page,
        perPage: pageSize,
        sortBy: "updatedAt",
        sortDirection: "desc",
      },
      controller.signal,
    )
      .then((response) => {
        if (!guard.isActive()) return;
        setCreditCustomers(response.data.map(mapRow).filter((row) => !row.isWalkIn));
        setTotalItems(response.meta.totalItems);
        setTotalPages(Math.max(1, response.meta.totalPages));
        if (page > Math.max(1, response.meta.totalPages))
          setPage(Math.max(1, response.meta.totalPages));
      })
      .catch(() => {
        if (!guard.isActive()) return;
        setCreditCustomers([]);
        setTotalItems(0);
        setTotalPages(1);
      })
      .finally(() => {
        if (!guard.isActive()) return;
        setLoading((current) => ({ ...current, fetching: false }));
      });
    return () => {
      guard.dispose();
      controller.abort();
    };
  }, [bookFilters, isBooksTab, page, pageSize, reloadKey]);

  // Shop ledger for credit book customers
  useEffect(() => {
    if (!isLedgerTab) return;
    const controller = new AbortController();
    const guard = createLoadGuard();
    setLoading((current) => ({ ...current, ledger: true }));
    listCustomerLedgers(
      {
        search: ledgerSearch.trim() || undefined,
        customer: chipCsv(ledgerChips, "customer"),
        entryType: chipCsv(ledgerChips, "entryType"),
        notes: chipCsv(ledgerChips, "notes"),
        balance: chipCsv(ledgerChips, "balance"),
        page: ledgerPage,
        perPage: ledgerPageSize,
      },
      controller.signal,
    )
      .then((response) => {
        if (!guard.isActive()) return;
        setLedgerRows(response.data);
        setLedgerTotal(response.meta.totalItems);
        setLedgerPages(Math.max(1, response.meta.totalPages));
        if (ledgerPage > Math.max(1, response.meta.totalPages)) {
          setLedgerPage(Math.max(1, response.meta.totalPages));
        }
      })
      .catch(() => {
        if (!guard.isActive()) return;
        setLedgerRows([]);
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
  }, [isLedgerTab, ledgerChips, ledgerPage, ledgerPageSize, ledgerSearch, reloadKey]);

  const enrolledCustomers = allMasterCustomers.filter(
    (customer) => customer.inCreditBook && !customer.isWalkIn,
  );

  // KPI calculations use every enrolled customer, not only the current table page.
  const owingCustomers = enrolledCustomers.filter((c) => c.currentBalance > 0);
  const toCollect = owingCustomers.reduce((sum, row) => sum + row.currentBalance, 0);
  const advanceHeld = Math.abs(
    enrolledCustomers
      .filter((c) => c.currentBalance < 0)
      .reduce((sum, c) => sum + c.currentBalance, 0),
  );
  const settledCount = enrolledCustomers.filter((c) => c.currentBalance === 0).length;
  const totalProfitHold = enrolledCustomers.reduce(
    (sum, customer) => sum + (customer.profitOnHold ?? 0),
    0,
  );

  const paginatedRows = creditCustomers;

  // Insights charts data
  const customerChart = enrolledCustomers
    .filter((row) => row.currentBalance > 0)
    .sort((a, b) => b.currentBalance - a.currentBalance)
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      label: row.name,
      value: row.currentBalance,
      details: [{ label: "Balance", value: money(row.currentBalance) }],
    }));

  const balanceChart = [
    {
      id: "owe",
      label: CUSTOMER_BALANCE_OWES,
      value: enrolledCustomers.filter((row) => row.currentBalance > 0).length,
    },
    {
      id: "advance",
      label: CUSTOMER_BALANCE_ADVANCE,
      value: enrolledCustomers.filter((row) => row.currentBalance < 0).length,
    },
    {
      id: "settled",
      label: CUSTOMER_BALANCE_SETTLED,
      value: enrolledCustomers.filter((row) => row.currentBalance === 0).length,
    },
  ].filter((point) => point.value > 0);

  // Unbooked customer options for the Add Credit Sale Book drawer
  const unbookedCustomers = useMemo(() => {
    return allMasterCustomers.filter(
      (customer) => !customer.isWalkIn && customer.isActive && !customer.inCreditBook,
    );
  }, [allMasterCustomers]);

  function applyTab(next: CreditTab) {
    setTab(next);
    setView("table");
    setCardView(false);
    if (next === CREDIT_TAB_BOOKS) setPage(1);
    else setLedgerPage(1);
  }

  function applyChip(next: FilterChip) {
    setChips((current) => applyFilterChip(current, next));
    setPage(1);
  }

  function applyLedgerChip(next: FilterChip) {
    setLedgerChips((current) => applyFilterChip(current, next));
    setLedgerPage(1);
  }

  function applyKpi(next: BalanceKpi) {
    const value = balanceKpiValue(next);
    setTab(CREDIT_TAB_BOOKS);
    setPage(1);
    setCardView(false);
    setChips((current) => {
      const kept = current.filter((chip) => chip.field !== "balance");
      if (chipCsv(current, "balance") === value) return kept;
      return [...kept, { field: "balance", label: "Balance", value }];
    });
  }

  function openCustomer(row: DomainCustomer) {
    navigate(creditCustomerHref(row.id));
  }

  function openCreateBookDrawer() {
    setSelectedCustomerIdForBook("");
    setBookDrawerOpen(true);
  }

  async function handleCreateCreditBook(values: { customerId: string; openingBalance: number }) {
    const targetCustomer = allMasterCustomers.find((c) => c.id === values.customerId);
    if (!targetCustomer) return;
    try {
      const record = await getMasterRecord("customers", targetCustomer.id);
      await updateMasterRecord("customers", targetCustomer.id, {
        name: record.name,
        phone: record.phone,
        email: record.email,
        address: record.address,
        notes: record.notes,
        cityId: record.cityId ?? undefined,
        isActive: record.isActive,
        isWalkIn: Boolean(record.isWalkIn),
        inCreditBook: true,
      });
      const adjustment = values.openingBalance - targetCustomer.currentBalance;
      if (Math.abs(adjustment) > 0.005) {
        await adjustCustomerBalance(targetCustomer.id, {
          amount: adjustment,
          notes: "Opening balance set when added to credit book",
        });
      }
      toaster.success(CREDIT_COPY.addBookSaved);
      setBookDrawerOpen(false);
      setSelectedCustomerIdForBook("");
      setAddedCustomerId(targetCustomer.id);
      setTab(CREDIT_TAB_BOOKS);
      setSearch("");
      setChips([]);
      setPage(1);
      setReloadKey((k) => k + 1);
      window.setTimeout(() => setAddedCustomerId(""), 3000);
    } catch (error) {
      toaster.error(shortError(error, CREDIT_COPY.addBookFailed));
      throw error;
    }
  }

  async function saveCustomerEdit(values: CreditCustomerEditValues) {
    if (!editCustomer || savingCustomer) return;
    const magnitude = Math.abs(Number(String(values.amount).replace(/,/g, "").trim()) || 0);
    const nextBalance = values.side === "owe" ? magnitude : -magnitude;
    setSavingCustomer(true);
    try {
      const record = await getMasterRecord("customers", editCustomer.id);
      await updateMasterRecord("customers", editCustomer.id, {
        name: values.name.trim(),
        phone: values.phone,
        email: record.email,
        address: values.address.trim(),
        notes: record.notes,
        cityId: record.cityId ?? undefined,
        isActive: record.isActive,
        isWalkIn: Boolean(record.isWalkIn),
        inCreditBook: Boolean(record.inCreditBook),
      });
      const adjustment = nextBalance - editCustomer.currentBalance;
      if (Math.abs(adjustment) > 0.005) {
        await adjustCustomerBalance(editCustomer.id, {
          amount: adjustment,
          notes: creditBalanceAdjustNote(editCustomer.currentBalance, nextBalance),
        });
      }
      toaster.success(
        Math.abs(adjustment) > 0.005 ? CUSTOMER_COPY.adjustSaved : CREDIT_COPY.customerUpdated,
      );
      setEditCustomer(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      toaster.error(shortError(error, CREDIT_COPY.customerUpdateFailed));
      throw error;
    } finally {
      setSavingCustomer(false);
    }
  }

  async function deleteCreditCustomer() {
    if (!deleteCustomer || deleting) return;
    setDeleting(true);
    try {
      await deleteMasterRecord("customers", deleteCustomer.id);
      toaster.success(`${deleteCustomer.name} ${CREDIT_COPY.trashMoved}`);
      setDeleteCustomer(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      toaster.error(shortError(error, CREDIT_COPY.trashFailed));
    } finally {
      setDeleting(false);
    }
  }

  async function savePayment(values: { amount: string; method: string }) {
    if (!payCustomer || paying) return;
    setPaying(true);
    try {
      await recordCustomerPayment(payCustomer.id, {
        amount: Number(values.amount),
        paymentMethod: values.method,
      });
      toaster.success(CUSTOMER_COPY.paySaved);
      setPayCustomer(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      toaster.error(shortError(error, CUSTOMER_COPY.payFailed));
      throw error;
    } finally {
      setPaying(false);
    }
  }

  function customerActions(row: DomainCustomer) {
    return (
      <Menu>
        <MenuItem icon={<CreditCard size={14} />} onClick={() => setPayCustomer(row)}>
          Record payment
        </MenuItem>
        <MenuItem icon={<Pencil size={14} />} onClick={() => setEditCustomer(row)}>
          {CREDIT_COPY.editCustomer}
        </MenuItem>
        <MenuItem danger icon={<Trash2 size={14} />} onClick={() => setDeleteCustomer(row)}>
          {CREDIT_COPY.moveToTrash}
        </MenuItem>
      </Menu>
    );
  }

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title={CREDIT_COPY.title}>
        <Button variant="primary" icon={<BookPlus size={14} />} onClick={openCreateBookDrawer}>
          {CREDIT_COPY.addBook}
        </Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        {CREDIT_COPY.hint}
      </p>

      {/* Overview KPI Cards */}
      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
        <KpiCard
          label={CREDIT_COPY.owedToShop}
          value={money(toCollect)}
          hint={CREDIT_COPY.collectHint}
          tone="danger"
          active={balanceChip === CUSTOMER_BALANCE_OWES}
          onClick={() => applyKpi("owe")}
        />
        <KpiCard
          label="Owing Accounts"
          value={owingCustomers.length}
          hint={CREDIT_COPY.customersHint}
          tone="warn"
          active={balanceChip === CUSTOMER_BALANCE_OWES}
          onClick={() => applyKpi("owe")}
        />
        <KpiCard
          label="Profit on Hold"
          value={money(totalProfitHold)}
          hint="Locked in unpaid credit"
          tone={totalProfitHold > 0 ? "warn" : "info"}
        />
        <KpiCard
          label={CREDIT_COPY.advanceHeld}
          value={money(advanceHeld)}
          hint={CREDIT_COPY.advanceHint}
          tone="info"
          active={balanceChip === CUSTOMER_BALANCE_ADVANCE}
          onClick={() => applyKpi("advance")}
        />
        <KpiCard
          label={CREDIT_COPY.settled}
          value={settledCount}
          hint={CREDIT_COPY.zeroBalanceHint}
          tone="ok"
          active={balanceChip === CUSTOMER_BALANCE_SETTLED}
          onClick={() => applyKpi("settled")}
        />
      </div>

      <TabSheet
        tabs={
          <Tabs value={tab} onChange={(id) => applyTab(id as CreditTab)} items={[...CREDIT_TABS]} />
        }
      >
        {isBooksTab ? (
          <Table
            toolbar={
              <HubToolbar
                columns={CREDIT_TABLE_COLUMNS}
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
                searchPlaceholder="Search credit records by customer name or phone"
                view={view}
                tableActive={view === "table" && !cardView}
                onView={(nextView) => {
                  setCardView(false);
                  setView(nextView);
                }}
                viewExtra={
                  <Button
                    size="icon"
                    className={cardView ? "is-on" : undefined}
                    aria-label="Card view"
                    aria-pressed={cardView}
                    onClick={() => {
                      setView("table");
                      setCardView(true);
                    }}
                  >
                    <LayoutGrid size={15} />
                  </Button>
                }
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
                  <HubChart type="donut" title="Balance status" data={balanceChart} />
                </HubChartGrid>
              ) : cardView ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="grid flex-1 content-start gap-2.5 overflow-auto p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {loading.fetching
                      ? Array.from({ length: 8 }, (_, index) => (
                          <div
                            key={index}
                            className="overflow-hidden rounded-xl border border-line bg-paper"
                          >
                            <div className="h-1 bg-line" />
                            <div className="p-3.5">
                              <Skeleton className="mb-2 h-4 w-2/3" />
                              <Skeleton className="mb-4 h-3 w-1/3" />
                              <Skeleton className="h-7 w-1/2" />
                            </div>
                          </div>
                        ))
                      : null}
                    {!loading.fetching && paginatedRows.length === 0 ? (
                      <div className="col-span-full">
                        <Table>
                          <THead>
                            <tr>
                              <Th>Customer</Th>
                              <Th>Phone</Th>
                              <Th>Balance</Th>
                              <Th>Actions</Th>
                            </tr>
                          </THead>
                          <tbody>
                            <EmptyRow
                              cols={4}
                              text={
                                search || chips.length
                                  ? CREDIT_COPY.noBookMatch
                                  : CREDIT_COPY.noBookCustomers
                              }
                            />
                          </tbody>
                        </Table>
                      </div>
                    ) : null}
                    {!loading.fetching
                      ? paginatedRows.map((row) => {
                          const balance = creditState(row.currentBalance);
                          const openSales = row.openCreditSaleCount ?? 0;
                          const toneBar =
                            row.currentBalance > 0
                              ? "bg-[var(--danger)]"
                              : row.currentBalance < 0
                                ? "bg-[var(--ok)]"
                                : "bg-line";
                          const balanceClass =
                            row.currentBalance > 0
                              ? "text-[var(--danger)]"
                              : row.currentBalance < 0
                                ? "text-[var(--ok)]"
                                : "text-ink";
                          return (
                            <article
                              key={row.id}
                              role="button"
                              tabIndex={0}
                              className={cn(
                                "credit-book-card group cursor-pointer overflow-hidden rounded-xl border bg-paper outline-none transition-[border-color,background-color] duration-150",
                                addedCustomerId === row.id
                                  ? "border-accent bg-[var(--accent-bg)]"
                                  : "border-line hover:border-accent/45 focus-visible:border-accent",
                              )}
                              onClick={() => openCustomer(row)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openCustomer(row);
                                }
                              }}
                            >
                              <div className={cn("h-1 w-full", toneBar)} />
                              <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
                                <div className="min-w-0">
                                  <strong className="block truncate text-[14px] font-semibold tracking-tight text-ink">
                                    {row.name}
                                  </strong>
                                  <span className="mt-0.5 block truncate text-[11px] text-muted">
                                    {row.phone ? formatPkMobile(row.phone) : "No phone"}
                                    {row.cityName ? ` · ${row.cityName}` : ""}
                                  </span>
                                </div>
                                <div
                                  className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {customerActions(row)}
                                </div>
                              </div>
                              <div className="px-3.5 pb-2 pt-3">
                                <span className="block text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                                  Balance
                                </span>
                                <div className="mt-1 flex items-baseline justify-between gap-2">
                                  <strong
                                    className={cn(
                                      "text-[20px] font-bold tracking-tight",
                                      balanceClass,
                                    )}
                                  >
                                    {balance.text}
                                  </strong>
                                  <Badge tone={balance.tone === "neutral" ? "info" : balance.tone}>
                                    {row.currentBalance > 0
                                      ? "Owes"
                                      : row.currentBalance < 0
                                        ? "Advance"
                                        : "Settled"}
                                  </Badge>
                                </div>
                              </div>
                              <div className="mx-3.5 mb-3.5 grid grid-cols-2 gap-x-3 border-t border-line pt-2.5">
                                <div>
                                  <span className="block text-[10px] text-muted">Open sales</span>
                                  <strong className="text-[12px] text-ink">
                                    {openSales > 0 ? openSales : "—"}
                                  </strong>
                                </div>
                                <div className="text-right">
                                  <span className="block text-[10px] text-muted">Credit total</span>
                                  <strong className="text-[12px] text-ink">
                                    {money(row.creditSaleTotal ?? 0)}
                                  </strong>
                                </div>
                              </div>
                            </article>
                          );
                        })
                      : null}
                  </div>
                  <Pagination
                    page={Math.min(page, totalPages)}
                    pages={totalPages}
                    total={totalItems}
                    pageSize={pageSize}
                    onPageSize={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                    onChange={setPage}
                    showAll={false}
                  />
                </div>
              ) : undefined
            }
            footer={
              <Pagination
                page={Math.min(page, totalPages)}
                pages={totalPages}
                total={totalItems}
                pageSize={pageSize}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                onChange={setPage}
                showAll={false}
              />
            }
          >
            {view === "table" && !cardView ? (
              <>
                <THead>
                  <tr>
                    {show("name") ? <Th>Customer</Th> : null}
                    {show("phone") ? <Th>Phone</Th> : null}
                    {show("openSales") ? <Th>Open sales</Th> : null}
                    {show("balance") ? <Th>Current Balance</Th> : null}
                    {show("profitHold") ? <Th>Profit on hold</Th> : null}
                    {show("creditTotal") ? <Th>Credit total</Th> : null}
                    {show("collected") ? <Th>Collected</Th> : null}
                    {show("lastSale") ? <Th>Last credit sale</Th> : null}
                    {show("address") ? <Th>Address</Th> : null}
                    <Th>Actions</Th>
                  </tr>
                </THead>
                <tbody>
                  {loading.fetching ? (
                    <TableRowsSkeleton columnCount={cols.length} rows={6} hasActions />
                  ) : null}
                  {!loading.fetching && paginatedRows.length === 0 ? (
                    <EmptyRow
                      cols={tableColumnCount}
                      text={
                        search || chips.length
                          ? CREDIT_COPY.noBookMatch
                          : CREDIT_COPY.noBookCustomers
                      }
                    />
                  ) : null}
                  {!loading.fetching
                    ? paginatedRows.map((row) => {
                        const st = creditState(row.currentBalance);
                        const openSales = row.openCreditSaleCount ?? 0;
                        const custProfitHold = row.profitOnHold ?? 0;

                        return (
                          <tr
                            key={row.id}
                            className={
                              addedCustomerId === row.id
                                ? "cursor-pointer bg-[var(--accent-bg)] transition-colors duration-500"
                                : "cursor-pointer hover:bg-[var(--surface-hover)]"
                            }
                            onClick={() => openCustomer(row)}
                          >
                            {show("name") ? (
                              <Td>
                                <div className="font-medium text-ink">{row.name}</div>
                                {row.address ? (
                                  <div className="text-[11px] text-muted">{row.address}</div>
                                ) : null}
                              </Td>
                            ) : null}
                            {show("phone") ? <Td>{row.phone || "—"}</Td> : null}
                            {show("openSales") ? (
                              <Td>
                                {openSales > 0 ? (
                                  <span className="text-[12px] font-medium text-[var(--danger)]">
                                    {openSales} open {openSales === 1 ? "sale" : "sales"}
                                  </span>
                                ) : (
                                  <span className="text-[12px] text-muted">Settled</span>
                                )}
                              </Td>
                            ) : null}
                            {show("balance") ? (
                              <Td>
                                <Badge tone={st.tone === "neutral" ? "info" : st.tone}>
                                  {st.text}
                                </Badge>
                              </Td>
                            ) : null}
                            {show("profitHold") ? (
                              <Td>
                                {custProfitHold > 0 ? (
                                  <span className="rounded bg-[var(--warn-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--warn-text)]">
                                    {money(custProfitHold)}
                                  </span>
                                ) : (
                                  <span className="text-[12px] text-muted">—</span>
                                )}
                              </Td>
                            ) : null}
                            {show("creditTotal") ? (
                              <Td numeric>{money(row.creditSaleTotal ?? 0)}</Td>
                            ) : null}
                            {show("collected") ? (
                              <Td numeric>{money(row.collectedTotal ?? 0)}</Td>
                            ) : null}
                            {show("lastSale") ? (
                              <Td>
                                {row.lastCreditSaleAt
                                  ? formatTableDateTime(row.lastCreditSaleAt)
                                  : "—"}
                              </Td>
                            ) : null}
                            {show("address") ? <Td>{row.address || "—"}</Td> : null}
                            <Td>
                              <div
                                className="flex justify-end"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {customerActions(row)}
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
                onApply={applyLedgerChip}
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
              />
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
                showAll={false}
              />
            }
          >
            {view === "table" ? (
              <>
                <THead>
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
                    ? ledgerRows.map((row) => {
                        const after = creditState(row.balanceAfter);
                        return (
                          <tr key={row.id}>
                            {showLedger("occurredAt") ? (
                              <Td>{formatTableDateTime(row.occurredAt || row.createdAt)}</Td>
                            ) : null}
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
                                <Badge tone={after.tone === "neutral" ? "info" : after.tone}>
                                  {after.text}
                                </Badge>
                              </Td>
                            ) : null}
                            {showLedger("notes") ? <Td>{row.notes || "—"}</Td> : null}
                          </tr>
                        );
                      })
                    : null}
                </tbody>
              </>
            ) : null}
          </Table>
        )}
      </TabSheet>

      <Drawer
        open={Boolean(payCustomer)}
        size="sm"
        title={CUSTOMER_COPY.payTitle}
        subtitle={
          payCustomer
            ? `${payCustomer.name} · ${creditState(payCustomer.currentBalance).text}`
            : undefined
        }
        onClose={() => {
          if (!paying) setPayCustomer(null);
        }}
        footer={
          <>
            <Button disabled={paying} onClick={() => setPayCustomer(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={CREDIT_PAY_FORM_ID} disabled={paying}>
              {paying ? "Saving…" : "Save payment"}
            </Button>
          </>
        }
      >
        {payCustomer ? (
          <CreditPayForm key={payCustomer.id} customer={payCustomer} onValid={savePayment} />
        ) : null}
      </Drawer>

      {/* Add customer to credit book */}
      <Drawer
        open={bookDrawerOpen}
        size="sm"
        title={CREDIT_COPY.addBook}
        subtitle={<span className="text-[11px] text-muted">Search by name or phone</span>}
        onClose={() => setBookDrawerOpen(false)}
      >
        <AddCreditBookForm
          customers={unbookedCustomers}
          selectedCustomerId={selectedCustomerIdForBook}
          onSelectCustomer={setSelectedCustomerIdForBook}
          onSubmit={handleCreateCreditBook}
        />
      </Drawer>

      <Drawer
        open={Boolean(editCustomer)}
        size="sm"
        title={CREDIT_COPY.editCustomer}
        subtitle={editCustomer ? `Update ${editCustomer.name}` : undefined}
        onClose={() => {
          if (!savingCustomer) setEditCustomer(null);
        }}
        footer={
          <>
            <Button disabled={savingCustomer} onClick={() => setEditCustomer(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={CREDIT_CUSTOMER_EDIT_FORM_ID}
              disabled={savingCustomer}
            >
              {savingCustomer ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        {editCustomer ? (
          <CreditCustomerEditForm
            key={editCustomer.id}
            customer={editCustomer}
            onValid={saveCustomerEdit}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteCustomer)}
        title={CREDIT_COPY.trashConfirmTitle}
        body={
          deleteCustomer
            ? `${deleteCustomer.name} (${creditState(deleteCustomer.currentBalance).text}) will be removed from active customers. Their records can be restored from Trash.`
            : ""
        }
        confirmLabel={deleting ? "Moving…" : CREDIT_COPY.moveToTrash}
        onCancel={() => {
          if (!deleting) setDeleteCustomer(null);
        }}
        onConfirm={() => void deleteCreditCustomer()}
      />
    </div>
  );
}
