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
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import type { ReturnRow } from "@/shared/domain/types";
import { money } from "@/utils/format";

export function ReturnsPage() {
  const { sectionKpi, returns, invoices, products } = useSalesHub();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ReturnRow | null>(null);

  const invoiceLabel = (id: string) => invoices.find((row) => row.id === id)?.invoiceNumber ?? id;
  const productLabel = (id: string) => products.find((row) => row.id === id)?.name ?? id;

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  const rows = useMemo(() => {
    return returns.filter((r) => {
      const text = `${invoiceLabel(r.invoiceId)} ${r.customerId ?? ""} ${r.reason}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (sectionKpi === "refund") return r.type === "REFUND";
      if (sectionKpi === "replace") return r.type === "REPLACEMENT";
      return true;
    });
  }, [returns, q, sectionKpi, invoices]);

  const pages = Math.max(1, Math.ceil(rows.length / DEFAULT_PAGE_SIZE));
  const shown = rows.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Invoice, customer, reason" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} onChange={setPage} />}
      >
        <THead>
          <tr>
            <Th>When</Th>
            <Th>Invoice</Th>
            <Th>Customer</Th>
            <Th>Type</Th>
            <Th>Refund</Th>
            <Th>Reason</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={7} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{row.createdAt}</Td>
              <Td>{invoiceLabel(row.invoiceId)}</Td>
              <Td>{row.customerId || "Walk-in"}</Td>
              <Td>
                <Badge tone={row.type === "REFUND" ? "warn" : "info"}>{row.type}</Badge>
              </Td>
              <Td numeric>{money(row.refundAmount)}</Td>
              <Td>{row.reason}</Td>
              <Td>
                <Button size="icon" variant="ghost" onClick={() => setOpen(row)} aria-label="View">
                  <Eye size={15} />
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Drawer open={Boolean(open)} title={open?.type ?? "Return"} onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
        {open ? (
          <div className="ui-stack [display:grid] [gap:12px]">
            <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">{open.notes}</p>
            <p className="text-[14px] font-extrabold tracking-tight text-ink">Coming back</p>
            <Table>
              <THead>
                <tr>
                  <Th>Product</Th>
                  <Th>Lot</Th>
                  <Th>Qty</Th>
                  <Th>Condition</Th>
                  <Th>Refund</Th>
                </tr>
              </THead>
              <tbody>
                {open.returnItems.map((item, i) => (
                  <tr key={i}>
                    <Td>{productLabel(item.productId)}</Td>
                    <Td>{item.lotId || "—"}</Td>
                    <Td numeric>{item.baseQuantity}</Td>
                    <Td>
                      <Badge tone={item.condition === "GOOD" ? "ok" : item.condition === "DAMAGED" ? "danger" : "warn"}>
                        {item.condition}
                      </Badge>
                    </Td>
                    <Td numeric>{money(item.refundAmount)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {open.replacementItems.length ? (
              <>
                <p className="text-[14px] font-extrabold tracking-tight text-ink">Given instead</p>
                <Table>
                  <THead>
                    <tr>
                      <Th>Product</Th>
                      <Th>Unit</Th>
                      <Th>Qty</Th>
                      <Th>Base qty</Th>
                    </tr>
                  </THead>
                  <tbody>
                    {open.replacementItems.map((item, i) => (
                      <tr key={i}>
                        <Td>{productLabel(item.productId)}</Td>
                        <Td>{item.unitName}</Td>
                        <Td numeric>{item.quantity}</Td>
                        <Td numeric>{item.baseQuantity}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            ) : (
              <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">No replacement line. Money out is a Transaction REFUND.</p>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
