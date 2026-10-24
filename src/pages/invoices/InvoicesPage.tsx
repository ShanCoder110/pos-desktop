import { useEffect, useMemo, useState } from "react";
import { Ban, Eye, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { routes } from "@/shared/constants/routes";
import {
  Badge,
  toaster,
  DetailToolbar,
  DetailToolbarButton,
  Drawer,
  EmptyRow,
  HubExportMenu,
  Menu,
  MenuItem,
  PAGE_SIZE_ALL,
  Pagination,
  Table,
  Td,
  THead,
  Th,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import {
  dateInRange,
  rangeForPeriod,
  type DateRangeFilter,
} from "@/components/common/DateRangePeriodPicker";
import { InvoiceReturnPanel } from "@/pages/invoices/InvoiceReturnPanel";
import { useSalesHub } from "@/pages/sales/SalesLayout";
import { HubToolbar } from "@/pages/products/HubToolbar";
import type { TableExportColumn } from "@/utils/exportFile";
import type { InvoiceRow } from "@/shared/domain/types";
import { formatTableDateTime, money } from "@/utils/format";
import { paymentStatusTone } from "@/utils/paymentStatus";
import { voidInvoice } from "@/services/sales";
import {
  canOpenInvoicePosEdit,
  canVoidInvoice,
  invoicePosEditBlockReason,
  invoicePosEditSearch,
  invoiceVoidBlockReason,
} from "@/utils/invoicePosEdit";
import { listAllBranches } from "@/services/org";
import { listMasterRecords, type MasterRecord } from "@/services/masters";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/constants/config";
import { applyFilterChip, chipValues } from "@/utils/filterChips";
import { calculateInvoiceGrossProfit } from "@/pages/credit/creditProfitUtils";
import { InvoiceProfitSummary } from "@/pages/invoices/InvoiceProfitSummary";

const INVOICE_COLUMNS = [
  { id: "number", label: "Number", locked: true },
  { id: "when", label: "When" },
  { id: "branch", label: "Branch" },
  { id: "customer", label: "Customer" },
  { id: "total", label: "Total" },
  { id: "paid", label: "Paid" },
  { id: "credit", label: "Credit" },
  { id: "payment", label: "Payment" },
  { id: "status", label: "Status" },
];
const DEFAULT_INVOICE_COLUMNS = INVOICE_COLUMNS.map((column) => column.id);

function minimumFilterValue(chip: FilterChip) {
  const values = chipValues(chip).map(Number).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

export function InvoicesPage() {
  const navigate = useNavigate();
  const { sectionKpi, invoices: hubInvoices, refreshHub } = useSalesHub();
  const rows = hubInvoices;
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [customerDetails, setCustomerDetails] = useState<Record<string, MasterRecord>>({});
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [cols, setCols] = useState(DEFAULT_INVOICE_COLUMNS);
  const [dateRange, setDateRange] = useState<DateRangeFilter>(() => rangeForPeriod("all"));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [open, setOpen] = useState<InvoiceRow | null>(null);

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      listAllBranches(controller.signal)
        .then((branches) => {
          const map: Record<string, string> = {};
          branches.forEach((b) => {
            map[b.id] = b.name;
          });
          setBranchNames(map);
        })
        .catch(() => undefined),
      listMasterRecords("customers", { perPage: MAX_PAGE_SIZE }, controller.signal)
        .then((response) => {
          const map: Record<string, string> = {};
          response.data.forEach((c) => {
            map[c.id] = c.name;
          });
          setCustomerNames(map);
          setCustomerDetails(
            Object.fromEntries(response.data.map((customer) => [customer.id, customer])),
          );
        })
        .catch(() => undefined),
    ]);
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const customer = r.customerId ? (customerNames[r.customerId] ?? "Customer") : "Walk-in";
      const branch = branchNames[r.branchId] ?? r.branchId;
      const text = `${r.invoiceNumber} ${customer} ${branch}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (!dateInRange(r.createdAt, dateRange)) return false;
      if (sectionKpi === "paid" && !(r.paymentStatus === "PAID" && r.status === "COMPLETED"))
        return false;
      if (sectionKpi === "partial" && r.paymentStatus !== "PARTIAL") return false;
      if (sectionKpi === "credit" && r.paymentStatus !== "CREDIT") return false;
      if (sectionKpi === "cancelled" && r.status !== "CANCELLED") return false;

      for (const chip of chips) {
        const selected = chipValues(chip);
        if (
          chip.field === "number" &&
          selected.length &&
          !selected.some((value) => r.invoiceNumber.toLowerCase().includes(value.toLowerCase()))
        )
          return false;
        if (chip.field === "customer" && selected.length && !selected.includes(customer))
          return false;
        if (chip.field === "branch" && selected.length && !selected.includes(branch)) return false;
        if (chip.field === "payment" && selected.length && !selected.includes(r.paymentStatus))
          return false;
        if (chip.field === "status" && selected.length && !selected.includes(r.status))
          return false;

        const minimum = minimumFilterValue(chip);
        if (minimum === null) continue;
        if (chip.field === "total" && r.total < minimum) return false;
        if (chip.field === "paid" && r.paidAmount < minimum) return false;
        if (chip.field === "credit" && r.creditAmount < minimum) return false;
        if (chip.field === "profit" && calculateInvoiceGrossProfit(r) < minimum) return false;
      }
      return true;
    });
  }, [rows, q, sectionKpi, customerNames, branchNames, chips, dateRange]);

  const pageCount = pageSize === PAGE_SIZE_ALL ? Math.max(filtered.length, 1) : pageSize;
  const pages = Math.max(1, Math.ceil(filtered.length / pageCount));
  const shown =
    pageSize === PAGE_SIZE_ALL ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);
  const show = (id: string) => cols.includes(id);
  const branchOptions = [...new Set(Object.values(branchNames))].sort();
  const customerOptions = [...new Set(["Walk-in", ...Object.values(customerNames)])].sort();
  const paymentOptions = [...new Set(rows.map((row) => row.paymentStatus))].sort();
  const statusOptions = [...new Set(rows.map((row) => row.status))].sort();

  function openInvoiceInPos(invoiceId: string) {
    setOpen(null);
    navigate({ pathname: routes.pos, search: invoicePosEditSearch(invoiceId) });
  }

  const exportColumns: TableExportColumn<InvoiceRow>[] = [
    { label: "Number", value: (row) => row.invoiceNumber },
    { label: "When", value: (row) => formatTableDateTime(row.createdAt) },
    { label: "Branch", value: (row) => branchNames[row.branchId] ?? row.branchId },
    {
      label: "Customer",
      value: (row) => (row.customerId ? (customerNames[row.customerId] ?? "Customer") : "Walk-in"),
    },
    { label: "Total", value: (row) => row.total },
    { label: "Paid", value: (row) => row.paidAmount },
    { label: "Credit", value: (row) => row.creditAmount },
    { label: "Payment", value: (row) => row.paymentStatus },
    { label: "Status", value: (row) => row.status },
  ];

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      <Table
        toolbar={
          <HubToolbar
            columns={INVOICE_COLUMNS}
            cols={cols}
            onCols={setCols}
            chips={chips}
            onApply={(chip) => {
              setChips((current) => applyFilterChip(current, chip));
              setPage(1);
            }}
            onRemove={(field) => {
              setChips((current) => current.filter((chip) => chip.field !== field));
              setPage(1);
            }}
            onClear={() => {
              setChips([]);
              setPage(1);
            }}
            filterFields={[
              { id: "number", label: "Invoice number", placeholder: "Number contains…" },
              { id: "customer", label: "Customer", options: customerOptions, searchable: true },
              { id: "branch", label: "Branch", options: branchOptions },
              { id: "payment", label: "Payment", options: paymentOptions },
              { id: "status", label: "Status", options: statusOptions },
              { id: "total", label: "Total", placeholder: "Minimum total", numeric: true },
              { id: "paid", label: "Paid", placeholder: "Minimum paid", numeric: true },
              { id: "credit", label: "Credit", placeholder: "Minimum credit", numeric: true },
              { id: "profit", label: "Profit", placeholder: "Minimum profit", numeric: true },
            ]}
            search={q}
            onSearch={(value) => {
              setQ(value);
              setPage(1);
            }}
            searchPlaceholder="Search number, customer, branch"
            dateRange={dateRange}
            onDateRange={(range) => {
              setDateRange(range);
              setPage(1);
            }}
            trailing={
              <HubExportMenu
                columns={exportColumns}
                rows={filtered}
                filename={`invoices-${sectionKpi ?? "all"}`}
                sheetName="Invoices"
              />
            }
          />
        }
        footer={
          <Pagination
            page={Math.min(page, pages)}
            pages={pages}
            total={filtered.length}
            pageSize={pageSize}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            onChange={setPage}
          />
        }
      >
        <THead>
          <tr>
            <Th>Number</Th>
            {show("when") ? <Th>When</Th> : null}
            {show("branch") ? <Th>Branch</Th> : null}
            {show("customer") ? <Th>Customer</Th> : null}
            {show("total") ? <Th>Total</Th> : null}
            {show("paid") ? <Th>Paid</Th> : null}
            {show("credit") ? <Th>Credit</Th> : null}
            {show("payment") ? <Th>Payment</Th> : null}
            {show("status") ? <Th>Status</Th> : null}
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={cols.length + 1} /> : null}
          {shown.map((row) => (
            <tr key={row.id} className="cursor-pointer" onClick={() => setOpen(row)}>
              <Td>{row.invoiceNumber}</Td>
              {show("when") ? <Td>{formatTableDateTime(row.createdAt)}</Td> : null}
              {show("branch") ? <Td>{branchNames[row.branchId] ?? row.branchId}</Td> : null}
              {show("customer") ? (
                <Td>
                  {row.customerId ? (customerNames[row.customerId] ?? "Customer") : "Walk-in"}
                </Td>
              ) : null}
              {show("total") ? <Td numeric>{money(row.total)}</Td> : null}
              {show("paid") ? <Td numeric>{money(row.paidAmount)}</Td> : null}
              {show("credit") ? <Td numeric>{money(row.creditAmount)}</Td> : null}
              {show("payment") ? (
                <Td>
                  <Badge tone={paymentStatusTone(row.paymentStatus)}>{row.paymentStatus}</Badge>
                </Td>
              ) : null}
              {show("status") ? (
                <Td>
                  <Badge tone={row.status === "COMPLETED" ? "ok" : "danger"}>{row.status}</Badge>
                </Td>
              ) : null}
              <Td>
                <div
                  className="relative flex items-center justify-end"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Menu>
                    <MenuItem icon={<Eye size={14} />} onClick={() => setOpen(row)}>
                      View details
                    </MenuItem>
                    {row.status === "COMPLETED" ? (
                      <MenuItem
                        icon={<Pencil size={14} />}
                        disabled={!canOpenInvoicePosEdit(row)}
                        title={invoicePosEditBlockReason(row) ?? undefined}
                        onClick={() => openInvoiceInPos(row.id)}
                      >
                        Edit in POS
                      </MenuItem>
                    ) : null}
                  </Menu>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(open)}
        title={open?.invoiceNumber ?? "Invoice"}
        subtitle={
          open ? (
            <span className="mt-1 block text-[11px] text-muted">
              {formatTableDateTime(open.createdAt)} · {branchNames[open.branchId] ?? open.branchId}
            </span>
          ) : null
        }
        size="xl"
        onClose={() => setOpen(null)}
      >
        {open ? (
          <div className="grid gap-4">
            {open.status === "COMPLETED" ? (
              <DetailToolbar>
                <DetailToolbarButton
                  variant="edit"
                  icon={<Pencil size={15} />}
                  disabled={!canOpenInvoicePosEdit(open)}
                  title={invoicePosEditBlockReason(open) ?? undefined}
                  onClick={() => openInvoiceInPos(open.id)}
                >
                  Edit
                </DetailToolbarButton>
                <DetailToolbarButton
                  variant="danger"
                  icon={<Ban size={15} />}
                  disabled={!canVoidInvoice(open)}
                  title={invoiceVoidBlockReason(open) ?? undefined}
                  onClick={() => {
                    const id = open.id;
                    void voidInvoice(id, "Void")
                      .then(() => {
                        toaster.success("Invoice voided");
                        setOpen(null);
                        refreshHub();
                      })
                      .catch((error) =>
                        toaster.error(error instanceof Error ? error.message : "Could not void"),
                      );
                  }}
                >
                  Void
                </DetailToolbarButton>
              </DetailToolbar>
            ) : null}
            <section className="grid gap-3 rounded-xl border border-line bg-bg/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Invoice overview
                  </span>
                  <h3 className="mt-1 text-[18px] font-extrabold text-ink">
                    {open.customerId
                      ? (customerNames[open.customerId] ?? "Customer")
                      : "Walk-in customer"}
                  </h3>
                  {open.customerId &&
                  (customerDetails[open.customerId]?.phone ||
                    customerDetails[open.customerId]?.address ||
                    customerDetails[open.customerId]?.cityName) ? (
                    <p className="mt-1 text-[11px] text-muted">
                      {[
                        customerDetails[open.customerId]?.phone,
                        customerDetails[open.customerId]?.address,
                        customerDetails[open.customerId]?.cityName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={paymentStatusTone(open.paymentStatus)}>{open.paymentStatus}</Badge>
                  <Badge tone={open.status === "COMPLETED" ? "ok" : "danger"}>{open.status}</Badge>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[11px] sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Invoice number</dt>
                  <dd className="mt-0.5 font-bold text-ink">{open.invoiceNumber}</dd>
                </div>
                <div>
                  <dt className="text-muted">Date and time</dt>
                  <dd className="mt-0.5 font-bold text-ink">
                    {formatTableDateTime(open.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Branch</dt>
                  <dd className="mt-0.5 font-bold text-ink">
                    {branchNames[open.branchId] ?? open.branchId}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Cashier</dt>
                  <dd className="mt-0.5 font-bold text-ink">{open.createdBy || "—"}</dd>
                </div>
              </dl>
            </section>

            <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["Subtotal", open.subtotal],
                ["Discount", open.discount],
                ["Total", open.total],
                ["Paid", open.paidAmount],
                ["Credit", open.creditAmount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-line bg-paper p-3">
                  <span className="block text-[10px] font-semibold text-muted">{label}</span>
                  <strong className="mt-1 block text-[14px] tabular-nums text-ink">
                    {money(Number(value))}
                  </strong>
                </div>
              ))}
            </section>

            <InvoiceProfitSummary invoice={open} />

            <section>
              <h3 className="mb-2 text-[12px] font-extrabold text-ink">Items</h3>
              <Table>
                <THead>
                  <tr>
                    <Th>Product</Th>
                    <Th>Unit</Th>
                    <Th>Qty</Th>
                    <Th>Base qty</Th>
                    <Th>Price mode</Th>
                    <Th>Unit price</Th>
                    <Th>Discount</Th>
                    <Th>Total</Th>
                    <Th>Gross profit</Th>
                  </tr>
                </THead>
                <tbody>
                  {open.items.length === 0 ? <EmptyRow cols={9} /> : null}
                  {open.items.map((item) => (
                    <tr key={item.id}>
                      <Td>
                        <span
                          className={
                            item.productDeleted
                              ? "font-semibold text-danger"
                              : "font-semibold text-ink"
                          }
                        >
                          {item.productName || "Product"}
                          {item.productDeleted ? (
                            <span className="ml-1 text-[10px] font-bold uppercase tracking-wide">
                              deleted
                            </span>
                          ) : null}
                        </span>
                        {item.sku ? (
                          <span className="block text-[10px] text-muted">{item.sku}</span>
                        ) : null}
                      </Td>
                      <Td>{item.unitName || "—"}</Td>
                      <Td numeric>{item.quantity}</Td>
                      <Td numeric>{item.baseQuantity}</Td>
                      <Td>{item.priceMode || "—"}</Td>
                      <Td numeric>{money(item.unitPrice)}</Td>
                      <Td numeric>{money(item.discount)}</Td>
                      <Td numeric>{money(item.total)}</Td>
                      <Td numeric>{item.grossProfit != null ? money(item.grossProfit) : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>

            <section>
              <h3 className="mb-2 text-[12px] font-extrabold text-ink">Payments</h3>
              <Table>
                <THead>
                  <tr>
                    <Th>Method</Th>
                    <Th>Amount</Th>
                    <Th>Tendered</Th>
                    <Th>Change</Th>
                    <Th>Reference</Th>
                    <Th>Status</Th>
                    <Th>Paid at</Th>
                  </tr>
                </THead>
                <tbody>
                  {!open.payments?.length ? (
                    <EmptyRow cols={7} text="No payment recorded." />
                  ) : null}
                  {(open.payments ?? []).map((payment) => (
                    <tr key={payment.id}>
                      <Td>{payment.paymentMethod || "—"}</Td>
                      <Td numeric>{money(payment.amount)}</Td>
                      <Td numeric>
                        {payment.amountTendered == null ? "—" : money(payment.amountTendered)}
                      </Td>
                      <Td numeric>{money(payment.changeAmount ?? 0)}</Td>
                      <Td>{payment.referenceNumber || "—"}</Td>
                      <Td>
                        <Badge tone={payment.status === "VOIDED" ? "danger" : "ok"}>
                          {payment.status}
                        </Badge>
                      </Td>
                      <Td>{payment.paidAt ? formatTableDateTime(payment.paidAt) : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>

            <section className="rounded-xl border border-line bg-bg/30 p-4">
              <h3 className="text-[12px] font-extrabold text-ink">Notes</h3>
              <p className="mt-2 whitespace-pre-wrap text-[11px] text-sub">
                {open.notes?.trim() || "No notes for this invoice."}
              </p>
            </section>
          </div>
        ) : null}
        {open?.status === "COMPLETED" &&
        open.paymentStatus !== "RETURNED" &&
        open.paymentStatus !== "PARTIALLY_RETURNED" ? (
          <InvoiceReturnPanel invoice={open} onSuccess={() => refreshHub()} />
        ) : null}
      </Drawer>
    </div>
  );
}
