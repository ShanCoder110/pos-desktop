import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  EmptyRow,
  HubExportMenu,
  KpiCard,
  PageHead,
  Pagination,
  SearchInput,
  Table,
  TabSheet,
  Tabs,
  Td,
  THead,
  Th,
} from "@/components/common";
import type { TableExportColumn } from "@/utils/exportFile";
import type { MoneyTxnRow } from "@/shared/domain/types";
import { useQueryTab } from "@/hooks/useQueryTab";
import { formatTableDateTime, money } from "@/utils/format";
import { ensureSession } from "@/services/auth";
import { listAllTransactions } from "@/services/finance";
import { listAllBranches, mapBranch } from "@/services/org";

const PAGE = 10;
const TRANSACTION_TABS = [
  { id: "all", label: "All" },
  { id: "in", label: "In" },
  { id: "out", label: "Out" },
] as const;

export function TransactionsPage() {
  const [seed, setSeed] = useState<MoneyTxnRow[]>([]);
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [tab, setTab] = useQueryTab(TRANSACTION_TABS, "all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const [txns, branches] = await Promise.all([
        listAllTransactions(controller.signal).catch(() => [] as MoneyTxnRow[]),
        listAllBranches(controller.signal)
          .then((rows) => rows.map(mapBranch))
          .catch(() => []),
      ]);
      setSeed(txns);
      const map: Record<string, string> = {};
      branches.forEach((b) => {
        map[b.id] = b.name;
      });
      setBranchNames(map);
    })();
    return () => controller.abort();
  }, []);

  const rows = useMemo(() => {
    return seed.filter((r) => {
      const text = `${r.type} ${r.notes} ${r.paymentMethod}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (tab === "in") return r.direction === "IN";
      if (tab === "out") return r.direction === "OUT";
      return true;
    });
  }, [seed, q, tab]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const inn = seed.filter((t) => t.direction === "IN").reduce((s, t) => s + t.amount, 0);
  const out = seed.filter((t) => t.direction === "OUT").reduce((s, t) => s + t.amount, 0);

  const exportColumns: TableExportColumn<MoneyTxnRow>[] = [
    { label: "When", value: (row) => formatTableDateTime(row.createdAt) },
    { label: "Branch", value: (row) => branchNames[row.branchId] ?? row.branchId },
    { label: "Direction", value: (row) => row.direction },
    { label: "Type", value: (row) => row.type },
    { label: "Amount", value: (row) => row.amount },
    { label: "Method", value: (row) => row.paymentMethod },
    { label: "Notes", value: (row) => row.notes ?? "" },
  ];

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Transactions" />
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        Real money only. Invoice credit does not appear here until someone pays. Types:
        SALE_PAYMENT, CUSTOMER_PAYMENT, REFUND, EXPENSE, COMMISSION.
      </p>
      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
        <KpiCard label="In" value={money(inn)} hint="Cash / bank received" tone="ok" />
        <KpiCard label="Out" value={money(out)} hint="Refunds, bills, commission" tone="danger" />
        <KpiCard
          label="Net"
          value={money(inn - out)}
          hint="Drawer"
          tone={inn - out >= 0 ? "ok" : "warn"}
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
            items={[...TRANSACTION_TABS]}
          />
        }
      >
        <Table
          toolbar={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <SearchInput
                value={q}
                onChange={(v) => {
                  setQ(v);
                  setPage(1);
                }}
                placeholder="Type, method, note"
              />
              <HubExportMenu
                columns={exportColumns}
                rows={rows}
                filename={`transactions-${tab}`}
                sheetName="Transactions"
              />
            </div>
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
              <Th>When</Th>
              <Th>Type</Th>
              <Th>Dir</Th>
              <Th>Method</Th>
              <Th>Amount</Th>
              <Th>Branch</Th>
              <Th>Note</Th>
              <Th>By</Th>
            </tr>
          </THead>
          <tbody>
            {shown.length === 0 ? <EmptyRow cols={8} /> : null}
            {shown.map((row) => (
              <tr key={row.id}>
                <Td>{formatTableDateTime(row.createdAt)}</Td>
                <Td>{row.type}</Td>
                <Td>
                  <Badge tone={row.direction === "IN" ? "ok" : "danger"}>{row.direction}</Badge>
                </Td>
                <Td>{row.paymentMethod}</Td>
                <Td numeric>{money(row.amount)}</Td>
                <Td>{branchNames[row.branchId] ?? row.branchId}</Td>
                <Td>{row.notes}</Td>
                <Td>{row.createdBy || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TabSheet>
    </div>
  );
}
