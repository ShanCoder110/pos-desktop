import { useEffect, useMemo, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { routes } from "@/shared/constants/routes";
import {
  Badge,
  Button,
  toaster,
  Drawer,
  EmptyRow,
  HubExportMenu,
  Pagination,
  SearchInput,
  Table,
  Td,
  THead,
  Th,
} from "@/components/common";
import { InvoiceReturnPanel } from "@/pages/invoices/InvoiceReturnPanel";
import { useSalesHub } from "@/pages/sales/SalesLayout";
import type { TableExportColumn } from "@/utils/exportFile";
import type { InvoiceRow } from "@/shared/domain/types";
import { formatTableDateTime, money } from "@/utils/format";
import { paymentStatusTone } from "@/utils/paymentStatus";
import { listAllInvoices, voidInvoice } from "@/services/sales";
import { isAbortError } from "@/utils/async";
import {
  canOpenInvoicePosEdit,
  canVoidInvoice,
  invoicePosEditBlockReason,
  invoicePosEditSearch,
  invoiceVoidBlockReason,
} from "@/utils/invoicePosEdit";
import { listAllBranches } from "@/services/org";
import { listMasterRecords } from "@/services/masters";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";

const PAGE = 10;

export function InvoicesPage() {
  const navigate = useNavigate();
  const { sectionKpi, invoices: hubInvoices, refreshHub } = useSalesHub();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<InvoiceRow | null>(null);

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  useEffect(() => {
    if (hubInvoices.length) {
      setRows(hubInvoices);
      return;
    }
    const controller = new AbortController();
    listAllInvoices(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setRows(data);
      })
      .catch((error) => {
        if (!isAbortError(error) && !controller.signal.aborted) setRows([]);
      });
    return () => controller.abort();
  }, [hubInvoices]);

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
        })
        .catch(() => undefined),
    ]);
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const text =
        `${r.invoiceNumber} ${r.customerId ? (customerNames[r.customerId] ?? "") : ""}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (sectionKpi === "paid") return r.paymentStatus === "PAID" && r.status === "COMPLETED";
      if (sectionKpi === "partial") return r.paymentStatus === "PARTIAL";
      if (sectionKpi === "credit") return r.paymentStatus === "CREDIT";
      if (sectionKpi === "cancelled") return r.status === "CANCELLED";
      return true;
    });
  }, [rows, q, sectionKpi, customerNames]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);

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
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Search number or customer"
            />
            <HubExportMenu
              columns={exportColumns}
              rows={filtered}
              filename={`invoices-${sectionKpi ?? "all"}`}
              sheetName="Invoices"
            />
          </div>
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
            <Th>Number</Th>
            <Th>When</Th>
            <Th>Branch</Th>
            <Th>Customer</Th>
            <Th>Total</Th>
            <Th>Paid</Th>
            <Th>Credit</Th>
            <Th>Payment</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={10} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{row.invoiceNumber}</Td>
              <Td>{formatTableDateTime(row.createdAt)}</Td>
              <Td>{branchNames[row.branchId] ?? row.branchId}</Td>
              <Td>{row.customerId ? (customerNames[row.customerId] ?? "Customer") : "Walk-in"}</Td>
              <Td numeric>{money(row.total)}</Td>
              <Td numeric>{money(row.paidAmount)}</Td>
              <Td numeric>{money(row.creditAmount)}</Td>
              <Td>
                <Badge tone={paymentStatusTone(row.paymentStatus)}>{row.paymentStatus}</Badge>
              </Td>
              <Td>
                <Badge tone={row.status === "COMPLETED" ? "ok" : "danger"}>{row.status}</Badge>
              </Td>
              <Td>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <Button variant="ghost" icon={<Eye size={14} />} onClick={() => setOpen(row)}>
                    View
                  </Button>
                  {row.status === "COMPLETED" ? (
                    <span title={invoicePosEditBlockReason(row) ?? undefined}>
                      <Button
                        variant="ghost"
                        icon={<Pencil size={14} />}
                        disabled={!canOpenInvoicePosEdit(row)}
                        onClick={() => openInvoiceInPos(row.id)}
                      >
                        Edit
                      </Button>
                    </span>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(open)}
        title={open?.invoiceNumber ?? "Invoice"}
        onClose={() => setOpen(null)}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            {open?.status === "COMPLETED" ? (
              <span title={invoiceVoidBlockReason(open) ?? undefined}>
                <Button
                  variant="outline"
                  disabled={!canVoidInvoice(open)}
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
                </Button>
              </span>
            ) : null}
            {open?.status === "COMPLETED" ? (
              <span title={invoicePosEditBlockReason(open) ?? undefined}>
                <Button
                  variant="outline"
                  icon={<Pencil size={14} />}
                  disabled={!canOpenInvoicePosEdit(open)}
                  onClick={() => openInvoiceInPos(open.id)}
                >
                  Edit
                </Button>
              </span>
            ) : null}
            <Button onClick={() => setOpen(null)}>Close</Button>
          </div>
        }
      >
        {open ? (
          <Table>
            <THead>
              <tr>
                <Th>Product</Th>
                <Th>Qty</Th>
                <Th>Price</Th>
                <Th>Total</Th>
              </tr>
            </THead>
            <tbody>
              {open.items.length === 0 ? <EmptyRow cols={4} /> : null}
              {open.items.map((item) => (
                <tr key={item.id}>
                  <Td>
                    <span className="font-semibold text-ink">{item.productName}</span>
                    {item.sku ? (
                      <span className="block text-[10px] text-muted">{item.sku}</span>
                    ) : null}
                  </Td>
                  <Td numeric>
                    {item.quantity} {item.unitName}
                  </Td>
                  <Td numeric>{money(item.unitPrice)}</Td>
                  <Td numeric>{money(item.total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
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
