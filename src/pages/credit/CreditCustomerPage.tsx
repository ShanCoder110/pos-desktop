import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CreditCard, History, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  Field,
  KpiCard,
  PageHead,
  SelectInput,
  TabSheet,
  Tabs,
  Table,
  Td,
  TextInput,
  THead,
  Th,
  toaster,
} from "@/components/common";
import {
  CREDIT_SALE_FORM_ID,
  CreditSaleForm,
  type CreditSaleLine,
} from "@/pages/credit/CreditSaleForm";
import {
  CREDIT_CUSTOMER_EDIT_FORM_ID,
  CreditCustomerEditForm,
  creditBalanceAdjustNote,
  type CreditCustomerEditValues,
} from "@/pages/credit/CreditCustomerEditForm";
import { summarizeCreditInvoices, summarizeCreditLedger } from "@/pages/credit/creditProfitUtils";
import { paymentStatusTone } from "@/utils/paymentStatus";
import { ensureSession } from "@/services/auth";
import {
  adjustCustomerBalance,
  getCustomerLedger,
  mapCustomer,
  mapLedgerEntry,
  recordCustomerPayment,
} from "@/services/credit";
import { deleteMasterRecord, getMasterRecord, updateMasterRecord } from "@/services/masters";
import { completeSale, listInvoices, mapInvoice } from "@/services/sales";
import { listAllProducts } from "@/services/products";
import {
  CREDIT_COPY,
  CUSTOMER_COPY,
  CUSTOMER_PAY_METHODS,
  customerLedgerTypeLabel,
} from "@/shared/constants/customers";
import { FIELD_LIMITS, FORM_COPY } from "@/shared/constants/fields";
import { routes } from "@/shared/constants/routes";
import type { DomainCustomer, InvoiceRow, LedgerRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import {
  creditState,
  formatTableDateTime,
  limitMoneyDraft,
  ledgerNoteText,
  money,
  shortError,
} from "@/utils/format";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { assignApiError, fieldMessage } from "@/utils/form";

function isCreditInvoice(row: InvoiceRow) {
  // Safer option: keep creditAmount on void for audit; exclude CANCELLED from open-credit UI.
  if (row.status === "CANCELLED") return false;
  return (
    row.creditAmount > 0 ||
    row.paymentStatus === "CREDIT" ||
    row.paymentStatus === "PARTIAL" ||
    row.paymentStatus === "RETURNED" ||
    row.paymentStatus === "PARTIALLY_RETURNED"
  );
}

function isSaleLedger(line: LedgerRow) {
  return (
    line.type === "SALE" ||
    line.type === "CREDIT_SALE" ||
    (line.debit > 0 && line.type !== "ADJUSTMENT")
  );
}

function isPaymentLedger(line: LedgerRow) {
  return (
    line.type === "PAYMENT_RECEIVED" || line.type === "PAYMENT" || line.type === "PAYMENT_MADE"
  );
}

type DetailTab = "credit-sales" | "invoices" | "ledger";

const CUSTOMER_PAGE_TABS = [
  { id: "credit-sales", label: CREDIT_COPY.tabCreditSales },
  { id: "invoices", label: CREDIT_COPY.tabInvoices },
  { id: "ledger", label: CREDIT_COPY.tabLedger },
];

export function CreditCustomerPage() {
  const navigate = useNavigate();
  const { customerId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customer, setCustomer] = useState<DomainCustomer | null>(null);
  const [allInvoices, setAllInvoices] = useState<InvoiceRow[]>([]);
  const [creditInvoices, setCreditInvoices] = useState<InvoiceRow[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<DetailTab>(
    requestedTab === "invoices" || requestedTab === "ledger" ? requestedTab : "credit-sales",
  );
  const [saleOpen, setSaleOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    handleSubmit: handlePaySubmit,
    control: payControl,
    reset: resetPayForm,
    setError: setPayError,
    formState: { errors: payErrors, isSubmitting: paySubmitting },
  } = useAppForm({
    defaultValues: { amount: "", method: "CASH", notes: "" },
  });

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const session = await ensureSession(signal);
      if (!session || !customerId) return;
      const [record, invoicePage, productRows, ledgerData] = await Promise.all([
        getMasterRecord("customers", customerId, signal),
        listInvoices({ customerId, page: 1, perPage: 200, branchId: session.branchId }, signal),
        listAllProducts(signal, session.branchId),
        getCustomerLedger(customerId, signal),
      ]);
      setCustomer({
        ...mapCustomer(record, ledgerData.balance),
        currentBalance: ledgerData.balance,
      });
      const rawInvoices = invoicePage.data.map(mapInvoice);
      setAllInvoices(rawInvoices);
      const credits = rawInvoices.filter(isCreditInvoice);
      setCreditInvoices(credits);
      setProducts(productRows);
      setLedgerEntries(ledgerData.entries.map(mapLedgerEntry));
    },
    [customerId],
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "credit-sales" || tab === "invoices" || tab === "ledger") setActiveTab(tab);
  }, [searchParams]);

  function changeTab(tab: DetailTab) {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === "credit-sales") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void reload(controller.signal)
      .catch(() => {
        setCustomer(null);
        setAllInvoices([]);
        setCreditInvoices([]);
        setLedgerEntries([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [reload]);

  const balance = useMemo(() => creditState(customer?.currentBalance ?? 0), [customer]);
  const invoiceSummary = useMemo(() => summarizeCreditInvoices(creditInvoices), [creditInvoices]);
  const ledgerSummary = useMemo(
    () => summarizeCreditLedger(ledgerEntries, customer?.currentBalance),
    [ledgerEntries, customer?.currentBalance],
  );
  const creditSaleLines = useMemo(
    () =>
      creditInvoices.flatMap((inv) =>
        inv.items.map((item) => ({
          id: item.id,
          date: inv.createdAt,
          productName: item.productName || "Product",
          sku: item.sku,
          quantity: item.quantity,
          unitName: item.unitName,
          unitPrice: item.unitPrice,
          total: item.total,
          grossProfit: item.grossProfit,
        })),
      ),
    [creditInvoices],
  );

  async function saveCreditSale(lines: CreditSaleLine[], notes: string) {
    if (!customer) return;
    try {
      await completeSale({
        clientRequestId: crypto.randomUUID(),
        customerId: customer.id,
        items: lines.map((line) => ({
          productId: line.productId,
          productUnitId: line.productUnitId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          priceMode: line.priceMode === "WHOLESALE" ? "WHOLESALE" : "RETAIL",
        })),
        payments: [],
        notes: notes || null,
      });
      toaster.success(CREDIT_COPY.saleSaved);
      setSaleOpen(false);
      await reload();
    } catch (error) {
      toaster.error(shortError(error, CREDIT_COPY.saleFailed));
      throw error;
    }
  }

  async function handleRecordPayment(values: { amount: string; method: string; notes?: string }) {
    if (!customer) return;
    try {
      await recordCustomerPayment(customer.id, {
        amount: Number(values.amount),
        paymentMethod: values.method,
        notes: values.notes || null,
      });
      toaster.success(CUSTOMER_COPY.paySaved);
      setPayOpen(false);
      resetPayForm({ amount: "", method: "CASH", notes: "" });
      await reload();
    } catch (error) {
      assignApiError(setPayError, shortError(error, CUSTOMER_COPY.payFailed), "amount");
      throw error;
    }
  }

  async function saveCustomerEdit(values: CreditCustomerEditValues) {
    if (!customer || savingCustomer) return;
    const magnitude = Math.abs(Number(String(values.amount).replace(/,/g, "").trim()) || 0);
    const nextBalance = values.side === "owe" ? magnitude : -magnitude;
    setSavingCustomer(true);
    try {
      const record = await getMasterRecord("customers", customer.id);
      await updateMasterRecord("customers", customer.id, {
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
      const adjustment = nextBalance - customer.currentBalance;
      if (Math.abs(adjustment) > 0.005) {
        await adjustCustomerBalance(customer.id, {
          amount: adjustment,
          notes: creditBalanceAdjustNote(customer.currentBalance, nextBalance),
        });
      }
      toaster.success(
        Math.abs(adjustment) > 0.005 ? CUSTOMER_COPY.adjustSaved : CREDIT_COPY.customerUpdated,
      );
      setEditOpen(false);
      await reload();
    } catch (error) {
      toaster.error(shortError(error, CREDIT_COPY.customerUpdateFailed));
      throw error;
    } finally {
      setSavingCustomer(false);
    }
  }

  async function moveCustomerToTrash() {
    if (!customer || deleting) return;
    setDeleting(true);
    try {
      await deleteMasterRecord("customers", customer.id);
      toaster.success(`${customer.name} ${CREDIT_COPY.trashMoved}`);
      setDeleteOpen(false);
      navigate(routes.credit);
    } catch (error) {
      toaster.error(shortError(error, CREDIT_COPY.trashFailed));
    } finally {
      setDeleting(false);
    }
  }

  if (!loading && !customer) {
    return (
      <div className="ui-stack [display:grid] [gap:12px]">
        <PageHead title={CREDIT_COPY.creditSalesFor} />
        <p className="text-[13px] text-muted">Customer not found.</p>
        <Button
          variant="ghost"
          icon={<ArrowLeft size={14} />}
          onClick={() => navigate(routes.credit)}
        >
          {CREDIT_COPY.backToBook}
        </Button>
      </div>
    );
  }

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead
        title={customer?.name ?? CREDIT_COPY.creditSalesFor}
        leading={
          <Button
            size="icon"
            variant="ghost"
            aria-label={CREDIT_COPY.backToBook}
            title={CREDIT_COPY.backToBook}
            onClick={() => navigate(routes.credit)}
          >
            <ArrowLeft size={16} />
          </Button>
        }
      >
        <Button
          variant="outline"
          icon={<Pencil size={14} />}
          disabled={!customer}
          onClick={() => setEditOpen(true)}
        >
          {CREDIT_COPY.editCustomer}
        </Button>
        <Button
          variant="outline"
          icon={<Trash2 size={14} />}
          disabled={!customer}
          onClick={() => setDeleteOpen(true)}
        >
          {CREDIT_COPY.moveToTrash}
        </Button>
        <Button variant="outline" icon={<CreditCard size={14} />} onClick={() => setPayOpen(true)}>
          Record payment
        </Button>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setSaleOpen(true)}>
          {CREDIT_COPY.newCreditSale}
        </Button>
      </PageHead>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <div>
          <span>{customer?.phone || "No phone"}</span>
          {customer?.address ? <span> · {customer.address}</span> : null}
          {customer?.cityName ? <span> ({customer.cityName})</span> : null}
        </div>
        <Badge tone={balance.tone === "neutral" ? "info" : balance.tone}>
          Balance: {balance.text}
        </Badge>
      </div>

      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(4,_minmax(0,_1fr))] [gap:10px]">
        <KpiCard
          label="Balance"
          value={balance.text}
          hint={CUSTOMER_COPY.ledgerBalanceHint}
          tone={balance.tone === "neutral" ? "info" : balance.tone}
        />
        <KpiCard
          label={CREDIT_COPY.creditSold}
          value={money(ledgerSummary.sold)}
          hint={`${creditSaleLines.length} ${CREDIT_COPY.creditSoldHint}`}
          tone="warn"
        />
        <KpiCard
          label={CREDIT_COPY.paidOnCredit}
          value={money(ledgerSummary.paid)}
          hint={CREDIT_COPY.paidOnCreditHint}
          tone="ok"
        />
        <KpiCard
          label="Profit on hold"
          value={money(invoiceSummary.totalProfitOnHold)}
          hint={`Realized: ${money(invoiceSummary.totalRealizedProfit)}`}
          tone={invoiceSummary.totalProfitOnHold > 0 ? "warn" : "info"}
        />
      </div>

      <TabSheet
        tabs={
          <Tabs
            value={activeTab}
            onChange={(tabId) => changeTab(tabId as DetailTab)}
            items={[...CUSTOMER_PAGE_TABS]}
          />
        }
      >
        {activeTab === "credit-sales" ? (
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Product</Th>
                <Th>Quantity</Th>
                <Th>Unit price</Th>
                <Th>Line total</Th>
                <Th>Gross profit</Th>
              </tr>
            </THead>
            <tbody>
              {loading ? (
                <EmptyRow cols={6} text="Loading credit sales…" />
              ) : creditSaleLines.length === 0 ? (
                <EmptyRow cols={6} text={CREDIT_COPY.noCreditSales} />
              ) : (
                creditSaleLines.map((line) => (
                  <tr key={line.id}>
                    <Td>{formatTableDateTime(line.date)}</Td>
                    <Td>
                      <div className="font-medium text-ink">{line.productName}</div>
                      {line.sku ? (
                        <div className="text-[11px] text-muted">SKU: {line.sku}</div>
                      ) : null}
                    </Td>
                    <Td numeric>
                      {line.quantity} {line.unitName}
                    </Td>
                    <Td numeric>{money(line.unitPrice)}</Td>
                    <Td numeric className="font-semibold text-ink">
                      {money(line.total)}
                    </Td>
                    <Td numeric className="text-muted">
                      {line.grossProfit !== undefined ? money(line.grossProfit) : "—"}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        ) : activeTab === "invoices" ? (
          <div>
            <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
              <span className="flex items-center gap-1.5">
                <Receipt size={14} /> All invoices for {customer?.name}
              </span>
              <span>{allInvoices.length} invoice(s)</span>
            </div>
            <Table>
              <THead>
                <tr>
                  <Th>Invoice #</Th>
                  <Th>Date</Th>
                  <Th>Items</Th>
                  <Th>Total</Th>
                  <Th>Paid</Th>
                  <Th>Credit</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <tbody>
                {loading ? (
                  <EmptyRow cols={7} text="Loading invoices…" />
                ) : allInvoices.length === 0 ? (
                  <EmptyRow cols={7} text="No invoices found." />
                ) : (
                  allInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <Td className="font-medium text-ink">#{inv.invoiceNumber}</Td>
                      <Td>{formatTableDateTime(inv.createdAt)}</Td>
                      <Td numeric>{inv.items.length}</Td>
                      <Td numeric className="font-semibold">
                        {money(inv.total)}
                      </Td>
                      <Td numeric className="text-[var(--ok)]">
                        {money(inv.paidAmount)}
                      </Td>
                      <Td
                        numeric
                        className={inv.creditAmount > 0 ? "text-[var(--danger)]" : "text-muted"}
                      >
                        {money(inv.creditAmount)}
                      </Td>
                      <Td>
                        <Badge tone={paymentStatusTone(inv.paymentStatus)}>
                          {inv.paymentStatus}
                        </Badge>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
              <span className="flex items-center gap-1.5">
                <History size={14} /> Customer balance ledger
              </span>
              <span>{ledgerEntries.length} entry(ies)</span>
            </div>
            <Table>
              <THead>
                <tr>
                  <Th>When</Th>
                  <Th>Type</Th>
                  <Th>Debit (Owes +)</Th>
                  <Th>Credit (Paid / Advance)</Th>
                  <Th>Balance after</Th>
                  <Th>Notes</Th>
                </tr>
              </THead>
              <tbody>
                {loading ? (
                  <EmptyRow cols={6} text="Loading ledger…" />
                ) : ledgerEntries.length === 0 ? (
                  <EmptyRow cols={6} text="No ledger entries yet." />
                ) : (
                  ledgerEntries.map((line) => {
                    const lineState = creditState(line.balanceAfter);
                    const saleLike = isSaleLedger(line);
                    const payLike = isPaymentLedger(line);
                    return (
                      <tr key={line.id}>
                        <Td>{formatTableDateTime(line.createdAt)}</Td>
                        <Td>
                          <Badge tone={payLike ? "ok" : saleLike ? "warn" : "info"}>
                            {customerLedgerTypeLabel(line.type)}
                          </Badge>
                        </Td>
                        <Td
                          numeric
                          className={line.debit > 0 ? "text-[var(--danger)]" : "text-muted"}
                        >
                          {line.debit > 0 ? money(line.debit) : "—"}
                        </Td>
                        <Td numeric className={line.credit > 0 ? "text-[var(--ok)]" : "text-muted"}>
                          {line.credit > 0 ? money(line.credit) : "—"}
                        </Td>
                        <Td numeric className="font-semibold">
                          {lineState.text}
                        </Td>
                        <Td className="text-muted">{ledgerNoteText(line.notes)}</Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </div>
        )}
      </TabSheet>

      <Drawer
        open={saleOpen}
        size="lg"
        title={CREDIT_COPY.newCreditSale}
        subtitle={customer ? `${customer.name} · Balance: ${balance.text}` : undefined}
        onClose={() => setSaleOpen(false)}
        footer={
          <>
            <Button onClick={() => setSaleOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form={CREDIT_SALE_FORM_ID}>
              {CREDIT_COPY.newCreditSale}
            </Button>
          </>
        }
      >
        <CreditSaleForm
          products={products}
          onSubmit={saveCreditSale}
          previousBalance={customer?.currentBalance ?? 0}
          hideSubmitButton
        />
      </Drawer>

      <Drawer
        open={payOpen}
        size="md"
        title={`Record payment · ${customer?.name ?? "Customer"}`}
        subtitle={`Balance: ${balance.text}`}
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <Button onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={paySubmitting}
              onClick={() => void handlePaySubmit(handleRecordPayment)()}
            >
              {paySubmitting ? "Saving…" : "Save payment"}
            </Button>
          </>
        }
      >
        <form
          className="ui-stack [display:grid] [gap:12px]"
          onSubmit={handlePaySubmit(handleRecordPayment)}
        >
          <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
            {CREDIT_COPY.paymentNote}
          </p>
          <Field label="Amount" error={fieldMessage(payErrors, "amount")}>
            <Controller
              name="amount"
              control={payControl}
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
          <Field label="Payment method">
            <Controller
              name="method"
              control={payControl}
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
          <Field label="Notes (optional)">
            <Controller
              name="notes"
              control={payControl}
              render={({ field }) => (
                <TextInput
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                  placeholder="Optional note"
                />
              )}
            />
          </Field>
        </form>
      </Drawer>

      <Drawer
        open={editOpen}
        size="sm"
        title={CREDIT_COPY.editCustomer}
        subtitle={customer ? `Update ${customer.name}` : undefined}
        onClose={() => {
          if (!savingCustomer) setEditOpen(false);
        }}
        footer={
          <>
            <Button disabled={savingCustomer} onClick={() => setEditOpen(false)}>
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
        {customer ? (
          <CreditCustomerEditForm
            key={customer.id}
            customer={customer}
            onValid={saveCustomerEdit}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={deleteOpen}
        title={CREDIT_COPY.trashConfirmTitle}
        body={
          customer
            ? `${customer.name} (${balance.text}) will be removed from active customers. Their records can be restored from Trash.`
            : ""
        }
        confirmLabel={deleting ? "Moving…" : CREDIT_COPY.moveToTrash}
        onCancel={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={() => void moveCustomerToTrash()}
      />
    </div>
  );
}
