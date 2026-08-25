import { useMemo, useState } from "react";
import { Eye, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  EmptyRow,
  Field,
  KpiCard,
  PageHead,
  Pagination,
  SearchInput,
  SelectInput,
  Table,
  Tabs,
  Td,
  TextArea,
  THead,
  Th,
} from "@/components/common";
import { transfers as seed, branchName, lotNumber, productName, userName, branches, productLots } from "@/shared/domain/mock";
import type { StockTransferRow, TransferStatus } from "@/shared/domain/types";

const PAGE = 10;

function tone(s: TransferStatus) {
  if (s === "COMPLETED") return "ok" as const;
  if (s === "PENDING") return "warn" as const;
  return "danger" as const;
}

export function TransfersPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<StockTransferRow | null>(null);

  const rows = useMemo(() => {
    return seed.filter((r) => {
      const text = `${branchName(r.fromBranchId)} ${branchName(r.toBranchId)} ${r.notes}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (tab !== "all") return r.status === tab.toUpperCase();
      return true;
    });
  }, [q, tab]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="ui-stack">
      <PageHead title="Transfers">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(seed[1])}>
          New transfer
        </Button>
      </PageHead>
      <p className="ui-note">
        Completing a transfer writes TRANSFER_OUT on the source branch and TRANSFER_IN on the destination, against the same ProductLot. Warehouse uses BranchLot when branch_lot_enabled is on.
      </p>
      <div className="ui-kpi-row">
        <KpiCard label="Pending" value={seed.filter((t) => t.status === "PENDING").length} hint="Waiting receive" tone="warn" />
        <KpiCard label="Completed" value={seed.filter((t) => t.status === "COMPLETED").length} hint="Stock moved" tone="ok" />
        <KpiCard label="Cancelled" value={seed.filter((t) => t.status === "CANCELLED").length} hint="No movement" tone="danger" />
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
          { id: "completed", label: "Completed" },
          { id: "cancelled", label: "Cancelled" },
        ]}
      />
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Branch or note" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} onChange={setPage} />}
      >
        <THead>
          <tr>
            <Th>From</Th>
            <Th>To</Th>
            <Th>Status</Th>
            <Th>Items</Th>
            <Th>Created</Th>
            <Th>Completed</Th>
            <Th>By</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={8} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{branchName(row.fromBranchId)}</Td>
              <Td>{branchName(row.toBranchId)}</Td>
              <Td>
                <Badge tone={tone(row.status)}>{row.status}</Badge>
              </Td>
              <Td numeric>{row.items.length}</Td>
              <Td>{row.createdAt}</Td>
              <Td>{row.completedAt ?? "—"}</Td>
              <Td>{userName(row.createdBy)}</Td>
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
        title="Transfer"
        onClose={() => setOpen(null)}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Close</Button>
            {open?.status === "PENDING" ? <Button variant="primary">Mark completed</Button> : null}
          </>
        }
      >
        {open ? (
          <div className="ui-stack">
            <Field label="From">
              <SelectInput value={open.fromBranchId} disabled>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="To">
              <SelectInput value={open.toBranchId} disabled>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Notes">
              <TextArea value={open.notes} readOnly />
            </Field>
            <Table>
              <THead>
                <tr>
                  <Th>Product</Th>
                  <Th>Lot</Th>
                  <Th>Qty</Th>
                </tr>
              </THead>
              <tbody>
                {open.items.map((item, i) => (
                  <tr key={i}>
                    <Td>{productName(item.productId)}</Td>
                    <Td>{lotNumber(item.productLotId) || productLots.find((l) => l.id === item.productLotId)?.lotNumber}</Td>
                    <Td numeric>{item.quantity}</Td>
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
