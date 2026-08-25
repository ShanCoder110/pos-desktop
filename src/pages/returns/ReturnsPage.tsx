import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  EmptyRow,
  KpiCard,
  PageHead,
  Pagination,
  SearchInput,
  Table,
  Tabs,
  Td,
  THead,
  Th,
} from "@/components/common";
import { returns as seed, customerName, invoiceNumber, lotNumber, productName } from "@/shared/domain/mock";
import type { ReturnRow } from "@/shared/domain/types";
import { money } from "@/utils/format";

const PAGE = 10;

export function ReturnsPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ReturnRow | null>(null);

  const rows = useMemo(() => {
    return seed.filter((r) => {
      const text = `${invoiceNumber(r.invoiceId)} ${customerName(r.customerId)} ${r.reason}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (tab === "refund") return r.type === "REFUND";
      if (tab === "replace") return r.type === "REPLACEMENT";
      return true;
    });
  }, [q, tab]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="ui-stack">
      <PageHead title="Returns" />
      <p className="ui-note">
        Always tied to an invoice. Goods coming back are ReturnItems (GOOD restock, DAMAGED / WARRANTY do not sell again). A replacement also writes ReplacementItems and StockMovement REPLACEMENT.
      </p>
      <div className="ui-kpi-row">
        <KpiCard label="Tickets" value={seed.length} hint="All types" tone="ok" />
        <KpiCard label="Refunds" value={seed.filter((r) => r.type === "REFUND").length} hint="Cash out" tone="warn" />
        <KpiCard label="Replacements" value={seed.filter((r) => r.type === "REPLACEMENT").length} hint="New lot out" tone="phantom" />
        <KpiCard label="Refunded" value={money(seed.reduce((s, r) => s + r.refundAmount, 0))} hint="Money OUT" tone="danger" />
      </div>
      <Tabs
        value={tab}
        onChange={(id) => {
          setTab(id);
          setPage(1);
        }}
        items={[
          { id: "all", label: "All" },
          { id: "refund", label: "Refund" },
          { id: "replace", label: "Replacement" },
        ]}
      />
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
              <Td>{invoiceNumber(row.invoiceId)}</Td>
              <Td>{customerName(row.customerId)}</Td>
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
          <div className="ui-stack">
            <p className="ui-note">{open.notes}</p>
            <p className="ui-page-title" style={{ fontSize: 14 }}>Coming back</p>
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
                    <Td>{productName(item.productId)}</Td>
                    <Td>{lotNumber(item.lotId)}</Td>
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
                <p className="ui-page-title" style={{ fontSize: 14 }}>Given instead</p>
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
                        <Td>{productName(item.productId)}</Td>
                        <Td>{item.unitName}</Td>
                        <Td numeric>{item.quantity}</Td>
                        <Td numeric>{item.baseQuantity}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            ) : (
              <p className="ui-note">No replacement line. Money out is a Transaction REFUND.</p>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
