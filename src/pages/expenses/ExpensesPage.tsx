import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
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
import type { ExpenseCategory, ExpenseRow } from "@/shared/domain/types";
import { money } from "@/utils/format";
import { ensureSession } from "@/services/auth";
import {
  createExpense,
  listAllExpenses,
  listExpenseCategories,
} from "@/services/finance";
import { listAllBranches, mapBranch } from "@/services/org";

const PAGE = 10;

export function ExpensesPage() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<ExpenseRow | null>(null);

  const categoryName = (id: string) => expenseCategories.find((c) => c.id === id)?.name ?? id;
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  const blank = (): ExpenseRow => ({
    id: "",
    branchId: branches[0]?.id ?? "",
    categoryId: expenseCategories[0]?.id ?? "",
    amount: 0,
    paymentMethod: "CASH",
    description: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    createdBy: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const [expenseRows, categories, branchRows] = await Promise.all([
        listAllExpenses(controller.signal).catch(() => [] as ExpenseRow[]),
        listExpenseCategories(controller.signal).catch(() => [] as ExpenseCategory[]),
        listAllBranches(controller.signal)
          .then((rows) => rows.map(mapBranch))
          .catch(() => []),
      ]);
      setRows(expenseRows);
      setExpenseCategories(categories);
      setBranches(branchRows);
    })();
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (q && !`${r.description} ${categoryName(r.categoryId)}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (tab !== "all") return r.categoryId === tab;
      return true;
    });
  }, [rows, q, tab, expenseCategories]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);

  async function saveExpense(expense: ExpenseRow) {
    if (!expense.description || !expense.amount || !expense.categoryId) return;
    try {
      const created = await createExpense({
        categoryId: expense.categoryId,
        amount: expense.amount,
        paymentMethod: expense.paymentMethod,
        description: expense.description,
        expenseDate: expense.expenseDate,
      });
      setRows((current) => [...current, created]);
      setEdit(null);
    } catch {
      // keep drawer open
    }
  }

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Expenses">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit(blank())}>
          Add expense
        </Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">Saving writes Expense and a Transaction EXPENSE with direction OUT. Categories are ExpenseCategory.</p>
      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
        <KpiCard label="This month" value={money(rows.reduce((s, r) => s + r.amount, 0))} hint="All branches" tone="danger" />
        <KpiCard label="Cash" value={money(rows.filter((r) => r.paymentMethod === "CASH").reduce((s, r) => s + r.amount, 0))} hint="OUT cash" tone="warn" />
        <KpiCard label="Bank" value={money(rows.filter((r) => r.paymentMethod === "BANK").reduce((s, r) => s + r.amount, 0))} hint="OUT bank" tone="stale" />
      </div>
      <TabSheet
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => {
              setTab(id);
              setPage(1);
            }}
            items={[{ id: "all", label: "All" }, ...expenseCategories.map((c) => ({ id: c.id, label: c.name }))]}
          />
        }
      >
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Description or category" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={filtered.length} onChange={setPage} />}
      >
        <THead>
          <tr>
            <Th>Date</Th>
            <Th>Category</Th>
            <Th>Description</Th>
            <Th>Branch</Th>
            <Th>Method</Th>
            <Th>Amount</Th>
            <Th>By</Th>
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={7} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{row.expenseDate}</Td>
              <Td>{categoryName(row.categoryId)}</Td>
              <Td>{row.description}</Td>
              <Td>{branchName(row.branchId)}</Td>
              <Td>
                <Badge>{row.paymentMethod}</Badge>
              </Td>
              <Td numeric>{money(row.amount)}</Td>
              <Td>{row.createdBy || "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      </TabSheet>

      <Drawer
        open={Boolean(edit)}
        title="Add expense"
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (edit) void saveExpense(edit);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="ui-stack [display:grid] [gap:12px]">
            <Field label="Category">
              <SelectInput value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Branch">
              <SelectInput value={edit.branchId} onChange={(e) => setEdit({ ...edit, branchId: e.target.value })}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Amount">
              <TextInput value={String(edit.amount)} onChange={(e) => setEdit({ ...edit, amount: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Method">
              <SelectInput value={edit.paymentMethod} onChange={(e) => setEdit({ ...edit, paymentMethod: e.target.value as ExpenseRow["paymentMethod"] })}>
                <option>CASH</option>
                <option>CARD</option>
                <option>BANK</option>
                <option>OTHER</option>
              </SelectInput>
            </Field>
            <Field label="Description">
              <TextInput value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
