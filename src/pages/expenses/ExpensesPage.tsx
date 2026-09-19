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
import { FIELD_LIMITS, FORM_COPY } from "@/shared/constants/fields";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { useQueryTab } from "@/hooks/useQueryTab";
import { assignApiError, fieldMessage, requiredTrim } from "@/utils/form";
import { limitMoneyDraft, money, shortError } from "@/utils/format";
import { ensureSession } from "@/services/auth";
import { createExpense, listAllExpenses, listExpenseCategories } from "@/services/finance";
import { listAllBranches, mapBranch } from "@/services/org";

const PAGE = 10;
const EXPENSE_FORM_ID = "expense-form";

function ExpenseEditForm({
  row,
  categories,
  branches,
  onValid,
}: {
  row: ExpenseRow;
  categories: ExpenseCategory[];
  branches: { id: string; name: string }[];
  onValid: (values: {
    categoryId: string;
    branchId: string;
    amount: string;
    paymentMethod: ExpenseRow["paymentMethod"];
    description: string;
  }) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useAppForm({
    defaultValues: {
      categoryId: row.categoryId,
      branchId: row.branchId,
      amount: row.amount ? String(row.amount) : "",
      paymentMethod: row.paymentMethod,
      description: row.description,
    },
  });
  return (
    <form
      id={EXPENSE_FORM_ID}
      className="ui-stack [display:grid] [gap:12px]"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, FORM_COPY.descriptionRequired), "description");
        }
      })}
    >
      <Field label="Category">
        <Controller
          name="categoryId"
          control={control}
          render={({ field }) => (
            <SelectInput
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectInput>
          )}
        />
      </Field>
      <Field label="Branch">
        <Controller
          name="branchId"
          control={control}
          render={({ field }) => (
            <SelectInput
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
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
            />
          )}
        />
      </Field>
      <Field label="Method">
        <Controller
          name="paymentMethod"
          control={control}
          render={({ field }) => (
            <SelectInput
              value={field.value}
              onChange={(event) =>
                field.onChange(event.target.value as ExpenseRow["paymentMethod"])
              }
            >
              <option>CASH</option>
              <option>CARD</option>
              <option>BANK</option>
              <option>OTHER</option>
            </SelectInput>
          )}
        />
      </Field>
      <Field label="Description" error={fieldMessage(errors, "description")}>
        <TextInput
          maxLength={FIELD_LIMITS.description}
          {...register("description", { validate: requiredTrim(FORM_COPY.descriptionRequired) })}
        />
      </Field>
    </form>
  );
}

export function ExpensesPage() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const tabItems = useMemo(
    () => [
      { id: "all", label: "All" },
      ...expenseCategories.map((category) => ({ id: category.id, label: category.name })),
    ],
    [expenseCategories],
  );
  const [tab, setTab] = useQueryTab(tabItems, "all");
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
      if (
        q &&
        !`${r.description} ${categoryName(r.categoryId)}`.toLowerCase().includes(q.toLowerCase())
      )
        return false;
      if (tab !== "all") return r.categoryId === tab;
      return true;
    });
  }, [rows, q, tab, expenseCategories]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);

  async function saveExpense(values: {
    categoryId: string;
    branchId: string;
    amount: string;
    paymentMethod: ExpenseRow["paymentMethod"];
    description: string;
  }) {
    if (!edit) return;
    const created = await createExpense({
      categoryId: values.categoryId,
      amount: Number(values.amount),
      paymentMethod: values.paymentMethod,
      description: values.description.trim(),
      expenseDate: edit.expenseDate,
    });
    setRows((current) => [...current, created]);
    setEdit(null);
  }

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Expenses">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit(blank())}>
          Add expense
        </Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        Saving writes Expense and a Transaction EXPENSE with direction OUT. Categories are
        ExpenseCategory.
      </p>
      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
        <KpiCard
          label="This month"
          value={money(rows.reduce((s, r) => s + r.amount, 0))}
          hint="All branches"
          tone="danger"
        />
        <KpiCard
          label="Cash"
          value={money(
            rows.filter((r) => r.paymentMethod === "CASH").reduce((s, r) => s + r.amount, 0),
          )}
          hint="OUT cash"
          tone="warn"
        />
        <KpiCard
          label="Bank"
          value={money(
            rows.filter((r) => r.paymentMethod === "BANK").reduce((s, r) => s + r.amount, 0),
          )}
          hint="OUT bank"
          tone="stale"
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
            items={tabItems}
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
              placeholder="Description or category"
            />
          }
          footer={
            <Pagination
              page={Math.min(page, pages)}
              pages={pages}
              total={filtered.length}
              onChange={setPage}
            />
          }
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
            <Button variant="primary" type="submit" form={EXPENSE_FORM_ID}>
              Save
            </Button>
          </>
        }
      >
        {edit ? (
          <ExpenseEditForm
            key={edit.id || "new"}
            row={edit}
            categories={expenseCategories}
            branches={branches}
            onValid={saveExpense}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
