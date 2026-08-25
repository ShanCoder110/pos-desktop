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
import { catalog as seed, stockMovements, branchName, lotNumber, userName } from "@/shared/domain/mock";
import type { CatalogProduct } from "@/shared/domain/types";
import { qty } from "@/utils/format";

const PAGE = 10;

export function StockPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<CatalogProduct | null>(null);

  const rows = useMemo(() => {
    return seed.filter((r) => {
      if (q && !`${r.name} ${r.sku}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (tab === "low") return r.onHand > 0 && r.onHand < r.minimumStock;
      if (tab === "out") return r.onHand <= 0;
      if (tab === "ok") return r.onHand >= r.minimumStock;
      return true;
    });
  }, [q, tab]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const moves = open ? stockMovements.filter((m) => m.productId === open.id) : [];

  return (
    <div className="ui-stack">
      <PageHead title="Stock" />
      <p className="ui-note">
        On-hand is the sum of ProductLot remaining_quantity. Sales never skip FIFO. Branch lot rows only appear when that branch has branch_lot_enabled.
      </p>
      <div className="ui-kpi-row">
        <KpiCard label="Healthy" value={seed.filter((p) => p.onHand >= p.minimumStock).length} hint="At or above min" tone="ok" />
        <KpiCard label="At risk" value={seed.filter((p) => p.onHand > 0 && p.onHand < p.minimumStock).length} hint="Below minimum" tone="warn" />
        <KpiCard label="Dead" value={seed.filter((p) => p.onHand <= 0).length} hint="Zero remaining" tone="danger" />
        <KpiCard label="SKUs" value={seed.length} hint="Catalog" tone="phantom" />
      </div>
      <Tabs
        value={tab}
        onChange={(id) => {
          setTab(id);
          setPage(1);
        }}
        items={[
          { id: "all", label: "All" },
          { id: "ok", label: "Healthy" },
          { id: "low", label: "Below min" },
          { id: "out", label: "Zero" },
        ]}
      />
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or SKU" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} onChange={setPage} />}
      >
        <THead>
          <tr>
            <Th>Product</Th>
            <Th>SKU</Th>
            <Th>Base unit</Th>
            <Th>On hand</Th>
            <Th>Minimum</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={7} /> : null}
          {shown.map((row) => {
            const dead = row.onHand <= 0;
            const low = !dead && row.onHand < row.minimumStock;
            return (
              <tr key={row.id}>
                <Td>
                  {row.name}
                  {row.isManufactured ? <span className="ui-note"> Manufactured</span> : null}
                </Td>
                <Td>{row.sku}</Td>
                <Td>{row.baseUnit}</Td>
                <Td numeric>{qty(row.onHand, row.baseUnit)}</Td>
                <Td numeric>{qty(row.minimumStock, row.baseUnit)}</Td>
                <Td>
                  <Badge tone={dead ? "danger" : low ? "warn" : "ok"}>{dead ? "Out" : low ? "Low" : "OK"}</Badge>
                </Td>
                <Td>
                  <Button size="icon" variant="ghost" onClick={() => setOpen(row)} aria-label="Movements">
                    <Eye size={15} />
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Drawer open={Boolean(open)} title={open ? `${open.name} movements` : "Movements"} onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
        {open ? (
          <div className="ui-stack">
            <p className="ui-note">StockMovement is the audit log. Positive = in, negative = out. Receive more on Lots.</p>
            <Table>
              <THead>
                <tr>
                  <Th>When</Th>
                  <Th>Type</Th>
                  <Th>Qty</Th>
                  <Th>Lot</Th>
                  <Th>Branch</Th>
                  <Th>By</Th>
                </tr>
              </THead>
              <tbody>
                {moves.length === 0 ? <EmptyRow cols={6} text="No movements yet" /> : null}
                {moves.map((m) => (
                  <tr key={m.id}>
                    <Td>{m.createdAt}</Td>
                    <Td>
                      <Badge tone={m.quantity < 0 ? "danger" : "ok"}>{m.type}</Badge>
                    </Td>
                    <Td numeric>{m.quantity}</Td>
                    <Td>{lotNumber(m.productLotId)}</Td>
                    <Td>{branchName(m.branchId)}</Td>
                    <Td>{userName(m.createdBy)}</Td>
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
