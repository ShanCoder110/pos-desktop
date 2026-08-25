import { useState } from "react";
import { Badge, EmptyRow, KpiCard, PageHead, Table, Tabs, Td, THead, Th } from "@/components/common";
import { catalog, invoices, ledger, stockMovements, domainCustomers, productName } from "@/shared/domain/mock";
import { money } from "@/utils/format";

export function AnalyticsPage() {
  const [tab, setTab] = useState("sales");
  const sold = invoices.filter((i) => i.status === "COMPLETED");
  const owed = domainCustomers.filter((c) => c.currentBalance > 0);

  return (
    <div className="ui-stack">
      <PageHead title="Reports" />
      <p className="ui-note">Read-only picture of invoices, FIFO movements, and khata. Live app will filter by date and branch.</p>
      <div className="ui-kpi-row">
        <KpiCard label="Billed" value={money(sold.reduce((s, i) => s + i.total, 0))} hint="Completed invoices" tone="ok" />
        <KpiCard label="Collected" value={money(sold.reduce((s, i) => s + i.paidAmount, 0))} hint="Paid amount" tone="ok" />
        <KpiCard label="Udhaar" value={money(owed.reduce((s, c) => s + c.currentBalance, 0))} hint="Still to collect" tone="warn" />
        <KpiCard label="Low SKUs" value={catalog.filter((p) => p.onHand < p.minimumStock).length} hint="Below minimum" tone="danger" />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "sales", label: "Sales" },
          { id: "stock", label: "Stock movement" },
          { id: "khata", label: "Khata" },
        ]}
      />
      {tab === "sales" ? (
        <Table>
          <THead>
            <tr>
              <Th>Invoice</Th>
              <Th>Payment</Th>
              <Th>Total</Th>
              <Th>Paid</Th>
              <Th>Credit</Th>
            </tr>
          </THead>
          <tbody>
            {sold.length === 0 ? <EmptyRow cols={5} /> : null}
            {sold.map((row) => (
              <tr key={row.id}>
                <Td>{row.invoiceNumber}</Td>
                <Td>
                  <Badge tone={row.paymentStatus === "PAID" ? "ok" : row.paymentStatus === "PARTIAL" ? "warn" : "danger"}>
                    {row.paymentStatus}
                  </Badge>
                </Td>
                <Td numeric>{money(row.total)}</Td>
                <Td numeric>{money(row.paidAmount)}</Td>
                <Td numeric>{money(row.creditAmount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      {tab === "stock" ? (
        <Table>
          <THead>
            <tr>
              <Th>When</Th>
              <Th>Product</Th>
              <Th>Type</Th>
              <Th>Qty</Th>
              <Th>Ref</Th>
            </tr>
          </THead>
          <tbody>
            {stockMovements.map((m) => (
              <tr key={m.id}>
                <Td>{m.createdAt}</Td>
                <Td>{productName(m.productId)}</Td>
                <Td>
                  <Badge tone={m.quantity < 0 ? "danger" : "ok"}>{m.type}</Badge>
                </Td>
                <Td numeric>{m.quantity}</Td>
                <Td>
                  {m.referenceType} {m.referenceId}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      {tab === "khata" ? (
        <Table>
          <THead>
            <tr>
              <Th>When</Th>
              <Th>Type</Th>
              <Th>Debit</Th>
              <Th>Credit</Th>
              <Th>After</Th>
            </tr>
          </THead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id}>
                <Td>{l.createdAt}</Td>
                <Td>{l.type}</Td>
                <Td numeric>{l.debit ? money(l.debit) : "—"}</Td>
                <Td numeric>{l.credit ? money(l.credit) : "—"}</Td>
                <Td numeric>{l.balanceAfter}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </div>
  );
}
