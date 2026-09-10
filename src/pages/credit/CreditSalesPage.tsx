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
import { creditState, money } from "@/utils/format";
import {
  getCustomerLedger,
  listCustomersWithBalances,
  mapLedgerEntry,
  recordCustomerPayment,
} from "@/services/credit";
import { ensureSession } from "@/services/auth";

const PAGE = 10;

export function CreditSalesPage() {
  const [seed, setSeed] = useState<DomainCustomer[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<DomainCustomer | null>(null);
  const [pay, setPay] = useState("");
  const [method, setMethod] = useState("CASH");
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
      setPay("");
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

  async function savePayment() {
    if (!open) return;
    const amount = Number(pay);
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      await recordCustomerPayment(open.id, {
        amount,
        paymentMethod: method,
      });
      const customers = await reload();
      const next = customers.find((c) => c.id === open.id) ?? null;
      setOpen(next);
      setPay("");
    } catch {
      // keep drawer open
    }
  }

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Credit / Udhaar">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(owing[0] ?? seed[0] ?? null)}>
          Record payment
        </Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        + balance = customer owes. 0 = settled. − balance = advance on the next bill. Walk-in invoices never hit this ledger.
      </p>
      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
        <KpiCard label="Owed to shop" value={money(owing.reduce((s, c) => s + c.currentBalance, 0))} hint="Collect" tone="danger" />
        <KpiCard label="On udhaar" value={owing.length} hint="Customers" tone="warn" />
        <KpiCard label="Advance" value={money(Math.abs(seed.filter((c) => c.currentBalance < 0).reduce((s, c) => s + c.currentBalance, 0)))} hint="Held for next bill" tone="ok" />
        <KpiCard label="Settled" value={seed.filter((c) => c.currentBalance === 0 && c.isActive).length} hint="Zero khata" tone="ok" />
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
              { id: "owe", label: "Owes" },
              { id: "advance", label: "Advance" },
              { id: "settled", label: "Settled" },
            ]}
          />
        }
      >
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or phone" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} onChange={setPage} />}
      >
        <THead>
          <tr>
            <Th>Customer</Th>
            <Th>Phone</Th>
            <Th>Limit</Th>
            <Th>Khata</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={5} /> : null}
          {shown.map((row) => {
            const st = creditState(row.currentBalance);
            return (
              <tr key={row.id}>
                <Td>{row.name}</Td>
                <Td>{row.phone || "—"}</Td>
                <Td numeric>{row.creditLimit == null ? "None" : money(row.creditLimit)}</Td>
                <Td>
                  <Badge tone={st.tone === "neutral" ? "info" : st.tone}>{st.text}</Badge>
                </Td>
                <Td>
                  <Button size="icon" variant="ghost" onClick={() => setOpen(row)} aria-label="Ledger">
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
            <Button variant="primary" onClick={() => void savePayment()}>
              Save payment
            </Button>
          </>
        }
      >
        {open ? (
          <div className="ui-stack [display:grid] [gap:12px]">
            <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">A payment writes CustomerLedger PAYMENT (credit) and Transaction CUSTOMER_PAYMENT IN.</p>
            <Field label="Amount received">
              <TextInput value={pay} onChange={(e) => setPay(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Method">
              <SelectInput value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="CASH">CASH</option>
                <option value="CARD">CARD</option>
                <option value="BANK">BANK</option>
              </SelectInput>
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
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
