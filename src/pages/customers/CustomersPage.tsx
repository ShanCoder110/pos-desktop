import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Eye, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  Field,
  HubChart,
  KpiCard,
  Menu,
  MenuItem,
  PageHead,
  Pagination,
  SearchInput,
  SelectInput,
  Skeleton,
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
import {
  CUSTOMER_COPY,
  CUSTOMER_CREDIT_ROUTE,
  CUSTOMER_PAY_METHODS,
  CUSTOMER_PLACEHOLDERS,
  CUSTOMER_TABS,
} from "@/shared/constants/customers";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import type { DomainCustomer, LedgerRow } from "@/shared/domain/types";
import { creditState, money } from "@/utils/format";
import { ensureSession } from "@/services/auth";
import {
  getCustomerLedger,
  listCustomersWithBalances,
  mapLedgerEntry,
  recordCustomerPayment,
} from "@/services/credit";
import { createMasterRecord, deleteMasterRecord, updateMasterRecord } from "@/services/masters";

const blank: DomainCustomer = {
  id: "",
  name: "",
  phone: "",
  address: "",
  currentBalance: 0,
  creditLimit: null,
  notes: "",
  isActive: true,
};

function overLimit(row: DomainCustomer) {
  return row.creditLimit != null && row.currentBalance > row.creditLimit;
}

function when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function CustomersPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DomainCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<DomainCustomer | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<DomainCustomer | null>(null);
  const [ledgerLines, setLedgerLines] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [pay, setPay] = useState("");
  const [method, setMethod] = useState("CASH");
  const [paying, setPaying] = useState(false);
  const [remove, setRemove] = useState<DomainCustomer | null>(null);

  async function reload(signal?: AbortSignal) {
    await ensureSession(signal);
    const customers = await listCustomersWithBalances(signal).catch(() => [] as DomainCustomer[]);
    setRows(customers);
    return customers;
  }

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open) {
      setLedgerLines([]);
      setPay("");
      return;
    }
    const controller = new AbortController();
    setLedgerLoading(true);
    getCustomerLedger(open.id, controller.signal)
      .then((ledger) => setLedgerLines(ledger.entries.map(mapLedgerEntry)))
      .catch(() => setLedgerLines([]))
      .finally(() => setLedgerLoading(false));
    return () => controller.abort();
  }, [open]);

  const active = rows.filter((row) => row.isActive);
  const owing = rows.filter((row) => row.currentBalance > 0);
  const advance = rows.filter((row) => row.currentBalance < 0);
  const over = rows.filter(overLimit);
  const toCollect = owing.reduce((sum, row) => sum + row.currentBalance, 0);
  const advanceHeld = Math.abs(advance.reduce((sum, row) => sum + row.currentBalance, 0));

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (q && !`${row.name} ${row.phone} ${row.address}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (tab === "owe") return row.currentBalance > 0;
      if (tab === "advance") return row.currentBalance < 0;
      if (tab === "over") return overLimit(row);
      if (tab === "inactive") return !row.isActive;
      return true;
    });
  }, [rows, q, tab]);

  const pages = Math.max(1, Math.ceil(filtered.length / DEFAULT_PAGE_SIZE));
  const shown = filtered.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);
  const chart = owing
    .slice()
    .sort((a, b) => b.currentBalance - a.currentBalance)
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      label: row.name,
      value: row.currentBalance,
      details: [
        { label: "Khata", value: money(row.currentBalance) },
        { label: "Limit", value: row.creditLimit == null ? "None" : money(row.creditLimit) },
      ],
    }));

  function setFilter(id: string) {
    setTab((current) => (current === id ? "all" : id));
    setPage(1);
  }

  async function saveCustomer(customer: DomainCustomer) {
    if (!customer.name.trim()) {
      toaster.error(CUSTOMER_COPY.nameRequired);
      return;
    }
    const payload = {
      name: customer.name.trim(),
      phone: customer.phone.trim() || undefined,
      address: customer.address.trim() || undefined,
      creditLimit: customer.creditLimit ?? undefined,
      isActive: customer.isActive,
      isWalkIn: false,
    };
    setSaving(true);
    try {
      await ensureSession();
      const exists = Boolean(customer.id) && rows.some((row) => row.id === customer.id);
      if (exists) {
        const updated = await updateMasterRecord("customers", customer.id, payload);
        setRows((current) =>
          current.map((row) =>
            row.id === customer.id
              ? {
                  ...row,
                  name: updated.name,
                  phone: updated.phone ?? "",
                  address: updated.address ?? "",
                  notes: "",
                  creditLimit: updated.creditLimit ?? null,
                  isActive: updated.isActive,
                }
              : row,
          ),
        );
      } else {
        const created = await createMasterRecord("customers", payload);
        setRows((current) => [
          ...current,
          {
            id: created.id,
            name: created.name,
            phone: created.phone ?? "",
            address: created.address ?? "",
            currentBalance: 0,
            creditLimit: created.creditLimit ?? null,
            notes: "",
            isActive: created.isActive,
          },
        ]);
      }
      toaster.success(CUSTOMER_COPY.saved);
      setEdit(null);
    } catch (error) {
      toaster.error(error instanceof Error ? error.message : CUSTOMER_COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function removeCustomer(customer: DomainCustomer) {
    try {
      await deleteMasterRecord("customers", customer.id);
      setRows((current) => current.filter((row) => row.id !== customer.id));
      toaster.success(CUSTOMER_COPY.deleted);
    } catch {
      toaster.error(CUSTOMER_COPY.deleteFailed);
    }
    setRemove(null);
  }

  async function savePayment() {
    if (!open) return;
    const amount = Number(pay);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setPaying(true);
    try {
      await recordCustomerPayment(open.id, { amount, paymentMethod: method });
      const customers = await reload();
      setOpen(customers.find((row) => row.id === open.id) ?? null);
      setPay("");
      toaster.success(CUSTOMER_COPY.paid);
    } catch {
      toaster.error(CUSTOMER_COPY.payFailed);
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <PageHead title={CUSTOMER_COPY.title}>
        <Button onClick={() => navigate(CUSTOMER_CREDIT_ROUTE)} icon={<BookOpen size={14} />}>
          {CUSTOMER_COPY.credit}
        </Button>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ ...blank })}>
          {CUSTOMER_COPY.add}
        </Button>
      </PageHead>
      <p className="ui-note text-[12px] leading-snug text-muted">{CUSTOMER_COPY.hint}</p>

      <div className="grid shrink-0 grid-cols-5 gap-2.5">
        {loading ? (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[92px] rounded-[10px]" />)
        ) : (
          <>
            <KpiCard label="Active" value={active.length} hint="Can sell on name" tone="ok" active={tab === "all"} onClick={() => setFilter("all")} />
            <KpiCard label="Owing" value={owing.length} hint="Open udhaar" tone="warn" active={tab === "owe"} onClick={() => setFilter("owe")} />
            <KpiCard label="To collect" value={money(toCollect)} hint="Sum of khata" tone={toCollect ? "danger" : "ok"} active={tab === "owe"} onClick={() => setFilter("owe")} />
            <KpiCard label="Advance" value={money(advanceHeld)} hint="Held for next bill" tone="phantom" active={tab === "advance"} onClick={() => setFilter("advance")} />
            <KpiCard label="Over limit" value={over.length} hint="Above credit cap" tone={over.length ? "danger" : "ok"} active={tab === "over"} onClick={() => setFilter("over")} />
          </>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-48 rounded-[10px]" />
      ) : chart.length ? (
        <section className="min-h-[220px] shrink-0 overflow-hidden rounded-[10px] border border-line bg-paper">
          <HubChart
            type="bar"
            title="Largest khata"
            subtitle="Customers who owe the shop"
            data={chart}
            formatValue={money}
            maxItems={8}
            onPointClick={(point) => {
              const row = rows.find((item) => item.id === point.id);
              if (row) setOpen(row);
            }}
          />
        </section>
      ) : null}

      <TabSheet
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => {
              setTab(id);
              setPage(1);
            }}
            items={[...CUSTOMER_TABS]}
          />
        }
      >
        <Table
          toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={CUSTOMER_PLACEHOLDERS.search} />}
          footer={<Pagination page={Math.min(page, pages)} pages={pages} total={filtered.length} onChange={setPage} />}
        >
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Limit</Th>
              <Th>Khata</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </THead>
          <tbody>
            {shown.length === 0 ? <EmptyRow cols={6} text={CUSTOMER_COPY.empty} /> : null}
            {shown.map((row) => {
              const st = creditState(row.currentBalance);
              const capped = overLimit(row);
              return (
                <tr key={row.id} className="cursor-pointer" onClick={() => setOpen(row)}>
                  <Td>
                    {row.name}
                    {row.address ? <span className="sub">{row.address}</span> : null}
                  </Td>
                  <Td>{row.phone || "—"}</Td>
                  <Td numeric>{row.creditLimit == null ? "None" : money(row.creditLimit)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge tone={st.tone === "neutral" ? "info" : st.tone}>{st.text}</Badge>
                      {capped ? <Badge tone="danger">Over limit</Badge> : null}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={row.isActive ? "ok" : "danger"}>{row.isActive ? "Active" : "Inactive"}</Badge>
                  </Td>
                  <Td>
                    <div onClick={(event) => event.stopPropagation()}>
                    <Menu>
                      <MenuItem icon={<Eye size={14} />} onClick={() => setOpen(row)}>
                        Ledger
                      </MenuItem>
                      <MenuItem icon={<Wallet size={14} />} onClick={() => setOpen(row)}>
                        Collect
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
              );
            })}
          </tbody>
        </Table>
      </TabSheet>

      <Drawer
        open={Boolean(edit)}
        title={edit && edit.id && rows.some((row) => row.id === edit.id) ? "Edit customer" : "Add customer"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" disabled={saving} onClick={() => edit && void saveCustomer(edit)}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="ui-stack grid gap-3">
            <Field label="Name">
              <TextInput
                value={edit.name}
                placeholder={CUSTOMER_PLACEHOLDERS.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <TextInput
                value={edit.phone}
                placeholder={CUSTOMER_PLACEHOLDERS.phone}
                onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
              />
            </Field>
            <Field label="Address">
              <TextInput
                value={edit.address}
                placeholder={CUSTOMER_PLACEHOLDERS.address}
                onChange={(e) => setEdit({ ...edit, address: e.target.value })}
              />
            </Field>
            <Field label="Credit limit">
              <TextInput
                value={edit.creditLimit == null ? "" : String(edit.creditLimit)}
                placeholder={CUSTOMER_PLACEHOLDERS.creditLimit}
                onChange={(e) => setEdit({ ...edit, creditLimit: e.target.value === "" ? null : Number(e.target.value) || 0 })}
              />
            </Field>
            <Toggle checked={edit.isActive} onChange={(value) => setEdit({ ...edit, isActive: value })} label="Active customer" />
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(open)}
        size="lg"
        title={open ? open.name : "Ledger"}
        onClose={() => setOpen(null)}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Close</Button>
            <Button variant="primary" disabled={paying} onClick={() => void savePayment()}>
              {paying ? "Saving…" : "Save payment"}
            </Button>
          </>
        }
      >
        {open ? (
          <div className="ui-stack grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-line bg-bg px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Khata</p>
                <p className="mt-1 text-[13px] font-bold text-ink">{creditState(open.currentBalance).text}</p>
              </div>
              <div className="rounded-lg border border-line bg-bg px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Limit</p>
                <p className="mt-1 text-[13px] font-bold text-ink">{open.creditLimit == null ? "None" : money(open.creditLimit)}</p>
              </div>
              <div className="rounded-lg border border-line bg-bg px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Phone</p>
                <p className="mt-1 text-[13px] font-bold text-ink">{open.phone || "—"}</p>
              </div>
            </div>
            {open.address ? <p className="text-[12px] text-muted">{open.address}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Amount received">
                <TextInput value={pay} onChange={(e) => setPay(e.target.value)} placeholder={CUSTOMER_PLACEHOLDERS.amount} />
              </Field>
              <Field label="Method">
                <SelectInput value={method} onChange={(e) => setMethod(e.target.value)}>
                  {CUSTOMER_PAY_METHODS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Table>
              <THead>
                <tr>
                  <Th>When</Th>
                  <Th>Type</Th>
                  <Th>Debit</Th>
                  <Th>Credit</Th>
                  <Th>After</Th>
                </tr>
              </THead>
              <tbody>
                {ledgerLoading ? <EmptyRow cols={5} text="Loading…" /> : null}
                {!ledgerLoading && ledgerLines.length === 0 ? <EmptyRow cols={5} text="No ledger lines yet" /> : null}
                {ledgerLines.map((line) => (
                  <tr key={line.id}>
                    <Td>{when(line.createdAt)}</Td>
                    <Td>
                      {line.type.replace("_", " ")}
                      {line.notes ? <span className="sub">{line.notes}</span> : null}
                    </Td>
                    <Td numeric>{line.debit ? money(line.debit) : "—"}</Td>
                    <Td numeric>{line.credit ? money(line.credit) : "—"}</Td>
                    <Td numeric>{creditState(line.balanceAfter).text}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete customer?"
        body="Blocked if invoices or ledger lines still point here."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) void removeCustomer(remove);
          else setRemove(null);
        }}
      />
    </div>
  );
}
