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
import { invoices as seed, branchName, customerName, productName, userName } from "@/shared/domain/mock";
import type { InvoiceRow, PaymentStatus } from "@/shared/domain/types";
import { money } from "@/utils/format";

const PAGE = 10;

function payTone(s: PaymentStatus) {
  if (s === "PAID") return "ok" as const;
  if (s === "PARTIAL") return "warn" as const;
  return "danger" as const;
}

export function InvoicesPage() {
  const { sectionKpi } = useSalesHub();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<InvoiceRow | null>(null);

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  const rows = useMemo(() => {
    return seed.filter((r) => {
      const text = `${r.invoiceNumber} ${customerName(r.customerId)}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (sectionKpi === "paid") return r.paymentStatus === "PAID" && r.status === "COMPLETED";
      if (sectionKpi === "partial") return r.paymentStatus === "PARTIAL";
      if (sectionKpi === "credit") return r.paymentStatus === "CREDIT";
      if (sectionKpi === "cancelled") return r.status === "CANCELLED";
      return true;
    });
  }, [q, sectionKpi]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="products-hub-panel">
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search number or customer" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} onChange={setPage} />}
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
              <Td>{branchName(row.branchId)}</Td>
              <Td>{customerName(row.customerId)}</Td>
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
                <Button size="icon" variant="ghost" onClick={() => setOpen(row)} aria-label="View">
                  <Eye size={15} />
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(open)}
        title={open?.invoiceNumber ?? "Invoice"}
        onClose={() => setOpen(null)}
        footer={<Button onClick={() => setOpen(null)}>Close</Button>}
      >
        {open ? (
          <div className="ui-stack">
            <p className="ui-note">
              Cashier {userName(open.createdBy)} · Discount {money(open.discount)}. Cancelled bills do not reverse stock in this demo.
            </p>
            <dl className="ui-kv">
              <dt>Customer</dt>
              <dd>{customerName(open.customerId)}</dd>
              <dt>Payment</dt>
              <dd>{open.paymentStatus}</dd>
              <dt>Total</dt>
              <dd>{money(open.total)}</dd>
              <dt>Paid</dt>
              <dd>{money(open.paidAmount)}</dd>
              <dt>Credit</dt>
              <dd>{money(open.creditAmount)}</dd>
            </dl>
            <Table>
              <THead>
                <tr>
                  <Th>Product</Th>
                  <Th>Unit</Th>
                  <Th>Qty</Th>
                  <Th>Base qty</Th>
                  <Th>Price</Th>
                  <Th>Total</Th>
                </tr>
              </THead>
              <tbody>
                {open.items.map((item) => (
                  <tr key={item.id}>
                    <Td>{productName(item.productId)}</Td>
                    <Td>{item.unitName}</Td>
                    <Td numeric>{item.quantity}</Td>
                    <Td numeric>{item.baseQuantity}</Td>
                    <Td numeric>{money(item.unitPrice)}</Td>
                    <Td numeric>{money(item.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="ui-note">Example: 1 × 90m Roll stores quantity 1 and base_quantity 90. Lot consumption is a StockMovement SALE.</p>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
