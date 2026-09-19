import { useEffect, useMemo, useState } from "react";
import { Eye, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  EmptyRow,
  Field,
  KpiCard,
  PageHead,
  Pagination,
  SearchInput,
  SelectInput,
  Table,
  TabSheet,
  Tabs,
  Td,
  TextInput,
  THead,
  Th,
} from "@/components/common";
import type { DomainCustomer, LedgerRow } from "@/shared/domain/types";
import { creditState, limitMoneyDraft, money, shortError } from "@/utils/format";
import { FIELD_LIMITS, FORM_COPY } from "@/shared/constants/fields";
import { CREDIT_COPY, CREDIT_TABS, CUSTOMER_COPY } from "@/shared/constants/customers";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { useQueryTab } from "@/hooks/useQueryTab";
import { assignApiError, fieldMessage } from "@/utils/form";
import {
  getCustomerLedger,
  listCustomersWithBalances,
  mapLedgerEntry,
  recordCustomerPayment,
} from "@/services/credit";
import { ensureSession } from "@/services/auth";

const PAGE = 10;
const CREDIT_PAY_FORM_ID = "credit-pay-form";

function CreditPayForm({
  lines,
  onValid,
}: {
  lines: LedgerRow[];
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
  return (
    <form
      id={CREDIT_PAY_FORM_ID}
      className="ui-stack [display:grid] [gap:12px]"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, CUSTOMER_COPY.payFailed), "amount");
        }
      })}
    >
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        A payment writes CustomerLedger PAYMENT (credit) and Transaction CUSTOMER_PAYMENT IN.
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
              <option value="CASH">CASH</option>
              <option value="CARD">CARD</option>
              <option value="BANK">BANK</option>
            </SelectInput>
          )}
        />
      </Field>
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
          {lines.length === 0 ? <EmptyRow cols={5} text="No ledger lines" /> : null}
          {lines.map((line) => (
            <tr key={line.id}>
              <Td>{line.createdAt}</Td>
              <Td>
                {line.type}
                <span className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
                  {" "}
                  {line.invoiceId ?? line.branchId}
                </span>
              </Td>
              <Td numeric>{line.debit ? money(line.debit) : "—"}</Td>
              <Td numeric>{line.credit ? money(line.credit) : "—"}</Td>
              <Td numeric>{creditState(line.balanceAfter).text}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </form>
  );
}

export function CreditSalesPage() {
  const [seed, setSeed] = useState<DomainCustomer[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useQueryTab(CREDIT_TABS, "all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<DomainCustomer | null>(null);
  const [lines, setLines] = useState<LedgerRow[]>([]);

  async function reload(signal?: AbortSignal) {
    await ensureSession(signal);
    const customers = await listCustomersWithBalances(signal).catch(() => [] as DomainCustomer[]);
    setSeed(customers);
    return customers;
  }

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open) {
      setLines([]);
      return;
    }
    const controller = new AbortController();
    getCustomerLedger(open.id, controller.signal)
      .then((ledger) => setLines(ledger.entries.map(mapLedgerEntry)))
      .catch(() => setLines([]));
    return () => controller.abort();
  }, [open]);

  const rows = useMemo(() => {
    return seed.filter((r) => {
      if (!r.isActive && tab !== "all") return false;
      if (q && !`${r.name} ${r.phone}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (tab === "owe") return r.currentBalance > 0;
      if (tab === "advance") return r.currentBalance < 0;
      if (tab === "settled") return r.currentBalance === 0 && r.isActive;
      return true;
    });
  }, [seed, q, tab]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const owing = seed.filter((c) => c.currentBalance > 0);

  async function savePayment(values: { amount: string; method: string }) {
    if (!open) return;
    await recordCustomerPayment(open.id, {
      amount: Number(values.amount),
      paymentMethod: values.method,
    });
    const customers = await reload();
    setOpen(customers.find((c) => c.id === open.id) ?? null);
  }

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title={CREDIT_COPY.title}>
        <Button
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => setOpen(owing[0] ?? seed[0] ?? null)}
        >
          Record payment
        </Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        {CREDIT_COPY.hint}
      </p>
      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
        <KpiCard
          label={CREDIT_COPY.owedToShop}
          value={money(owing.reduce((s, c) => s + c.currentBalance, 0))}
          hint={CREDIT_COPY.collectHint}
          tone="danger"
        />
        <KpiCard
          label={CREDIT_COPY.owingCount}
          value={owing.length}
          hint={CREDIT_COPY.customersHint}
          tone="warn"
        />
        <KpiCard
          label={CREDIT_COPY.advanceHeld}
          value={money(
            Math.abs(
              seed.filter((c) => c.currentBalance < 0).reduce((s, c) => s + c.currentBalance, 0),
            ),
          )}
          hint={CREDIT_COPY.advanceHint}
          tone="info"
        />
        <KpiCard
          label={CREDIT_COPY.settled}
          value={seed.filter((c) => c.currentBalance === 0 && c.isActive).length}
          hint={CREDIT_COPY.zeroBalanceHint}
          tone="ok"
        />
      </div>
      <TabSheet
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => {
              setTab(id);
              setPage(1);
            }}
            items={[...CREDIT_TABS]}
          />
        }
      >
        <Table
          toolbar={
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Name or phone"
            />
          }
          footer={
            <Pagination
              page={Math.min(page, pages)}
              pages={pages}
              total={rows.length}
              onChange={setPage}
            />
          }
        >
          <THead>
            <tr>
              <Th>Customer</Th>
              <Th>Phone</Th>
              <Th>Balance</Th>
              <Th />
            </tr>
          </THead>
          <tbody>
            {shown.length === 0 ? <EmptyRow cols={4} /> : null}
            {shown.map((row) => {
              const st = creditState(row.currentBalance);
              return (
                <tr key={row.id}>
                  <Td>{row.name}</Td>
                  <Td>{row.phone || "—"}</Td>
                  <Td>
                    <Badge tone={st.tone === "neutral" ? "info" : st.tone}>{st.text}</Badge>
                  </Td>
                  <Td>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setOpen(row)}
                      aria-label="Ledger"
                    >
                      <Eye size={15} />
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TabSheet>

      <Drawer
        open={Boolean(open)}
        title={open ? `${open.name} ledger` : "Ledger"}
        onClose={() => setOpen(null)}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Close</Button>
            <Button variant="primary" type="submit" form={CREDIT_PAY_FORM_ID}>
              Save payment
            </Button>
          </>
        }
      >
        {open ? <CreditPayForm key={open.id} lines={lines} onValid={savePayment} /> : null}
      </Drawer>
    </div>
  );
}
