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
import { productions as seed, bom, branchName, lotNumber, productName, userName } from "@/shared/domain/mock";
import type { ProductionRow, ProductionStatus } from "@/shared/domain/types";
import { money } from "@/utils/format";

const PAGE = 10;

function tone(s: ProductionStatus) {
  if (s === "COMPLETED") return "ok" as const;
  if (s === "IN_PROGRESS") return "warn" as const;
  if (s === "PENDING") return "info" as const;
  return "danger" as const;
}

export function RepairPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ProductionRow | null>(null);

  const rows = useMemo(() => {
    return seed.filter((r) => {
      const text = `${r.productionNumber} ${productName(r.productId)}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (tab !== "all") return r.status === tab.toUpperCase();
      return true;
    });
  }, [q, tab]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="ui-stack">
      <PageHead title="Production" />
      <p className="ui-note">
        A job consumes BOM components (PRODUCTION_USE, including damage) then outputs finished goods (PRODUCTION_OUTPUT). Technician commission is EmployeeCommission until paid as a Transaction OUT.
      </p>
      <div className="ui-kpi-row">
        <KpiCard label="Open" value={seed.filter((p) => p.status === "PENDING" || p.status === "IN_PROGRESS").length} hint="Not finished" tone="warn" />
        <KpiCard label="Completed" value={seed.filter((p) => p.status === "COMPLETED").length} hint="Stock in" tone="ok" />
        <KpiCard label="Commission due" value={money(seed.reduce((s, p) => s + (p.status === "COMPLETED" ? p.commissionAmount : 0), 0))} hint="Pay staff" tone="stale" />
      </div>
      <Tabs
        value={tab}
        onChange={(id) => {
          setTab(id);
          setPage(1);
        }}
        items={[
          { id: "all", label: "All" },
          { id: "pending", label: "Pending" },
          { id: "in_progress", label: "In progress" },
          { id: "completed", label: "Completed" },
        ]}
      />
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Job no or product" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} onChange={setPage} />}
      >
        <THead>
          <tr>
            <Th>Job</Th>
            <Th>Product</Th>
            <Th>Qty</Th>
            <Th>Branch</Th>
            <Th>Staff</Th>
            <Th>Status</Th>
            <Th>Cost</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={8} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{row.productionNumber}</Td>
              <Td>{productName(row.productId)}</Td>
              <Td numeric>{row.outputQuantity}</Td>
              <Td>{branchName(row.branchId)}</Td>
              <Td>{userName(row.employeeId)}</Td>
              <Td>
                <Badge tone={tone(row.status)}>{row.status.replace("_", " ")}</Badge>
              </Td>
              <Td numeric>{row.totalCost ? money(row.totalCost) : "—"}</Td>
              <Td>
                <Button size="icon" variant="ghost" onClick={() => setOpen(row)} aria-label="View">
                  <Eye size={15} />
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Drawer open={Boolean(open)} title={open?.productionNumber ?? "Job"} onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
        {open ? (
          <div className="ui-stack">
            <dl className="ui-kv">
              <dt>Material</dt>
              <dd>{money(open.materialCost)}</dd>
              <dt>Damage</dt>
              <dd>{money(open.damageCost)}</dd>
              <dt>Commission</dt>
              <dd>{money(open.commissionAmount)}</dd>
              <dt>Total</dt>
              <dd>{money(open.totalCost)}</dd>
            </dl>
            <p className="ui-page-title" style={{ fontSize: 14 }}>
              Recipe (BOM)
            </p>
            <Table>
              <THead>
                <tr>
                  <Th>Component</Th>
                  <Th>Qty</Th>
                  <Th>Unit</Th>
                </tr>
              </THead>
              <tbody>
                {bom.filter((b) => b.productId === open.productId).map((row) => (
                  <tr key={row.id}>
                    <Td>{productName(row.componentProductId)}</Td>
                    <Td numeric>{row.quantity}</Td>
                    <Td>{row.unit}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="ui-page-title" style={{ fontSize: 14 }}>
              Consumed this job
            </p>
            <Table>
              <THead>
                <tr>
                  <Th>Product</Th>
                  <Th>Lot</Th>
                  <Th>Used</Th>
                  <Th>Damaged</Th>
                </tr>
              </THead>
              <tbody>
                {open.items.length === 0 ? <EmptyRow cols={4} text="Not started" /> : null}
                {open.items.map((item, i) => (
                  <tr key={i}>
                    <Td>{productName(item.productId)}</Td>
                    <Td>{lotNumber(item.lotId)}</Td>
                    <Td numeric>{item.quantityUsed}</Td>
                    <Td numeric>{item.quantityDamaged}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
