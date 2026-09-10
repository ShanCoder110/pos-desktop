import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  EmptyRow,
  Pagination,
  SearchInput,
  Table,
  Td,
  THead,
  Th,
} from "@/components/common";
import { useSalesHub } from "@/pages/sales/SalesLayout";
import type { InvoiceRow, PaymentStatus } from "@/shared/domain/types";
import { money } from "@/utils/format";
import { listAllInvoices } from "@/services/sales";
import { listAllBranches } from "@/services/org";
import { listMasterRecords } from "@/services/masters";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";

const PAGE = 10;

function payTone(s: PaymentStatus) {
  if (s === "PAID") return "ok" as const;
  if (s === "PARTIAL") return "warn" as const;
  return "danger" as const;
}

export function InvoicesPage() {
  const { sectionKpi, invoices: hubInvoices } = useSalesHub();
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
      .then(setRows)
      .catch(() => setRows([]));
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
      const text = `${r.invoiceNumber} ${r.customerId ? customerNames[r.customerId] ?? "" : ""}`.toLowerCase();
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

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search number or customer" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={filtered.length} onChange={setPage} />}
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
              <Td>{row.createdAt}</Td>
              <Td>{branchNames[row.branchId] ?? row.branchId}</Td>
              <Td>{row.customerId ? customerNames[row.customerId] ?? row.customerId : "Walk-in"}</Td>
              <Td numeric>{money(row.total)}</Td>
              <Td numeric>{money(row.paidAmount)}</Td>
              <Td numeric>{money(row.creditAmount)}</Td>
              <Td>
                <Badge tone={payTone(row.paymentStatus)}>{row.paymentStatus}</Badge>
              </Td>
              <Td>
                <Badge tone={row.status === "COMPLETED" ? "ok" : "danger"}>{row.status}</Badge>
              </Td>
              <Td>
                <Button variant="ghost" icon={<Eye size={14} />} onClick={() => setOpen(row)}>
                  View
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Drawer open={Boolean(open)} title={open?.invoiceNumber ?? "Invoice"} onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
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
                  <Td>{item.productId}</Td>
                  <Td numeric>{item.quantity} {item.unitName}</Td>
                  <Td numeric>{money(item.unitPrice)}</Td>
                  <Td numeric>{money(item.total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Drawer>
    </div>
  );
}
