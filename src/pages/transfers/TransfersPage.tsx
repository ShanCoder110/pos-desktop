import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Eye, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  EmptyRow,
  Field,
  PAGE_SIZE_ALL,
  Pagination,
  SelectInput,
  Table,
  Td,
  TextArea,
  THead,
  Th,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { HubToolbar } from "@/pages/products/HubToolbar";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { transfers as seed, branchName, lotNumber, productName, userName, branches, productLots } from "@/shared/domain/mock";
import type { StockTransferRow, TransferStatus } from "@/shared/domain/types";

const PAGE_SIZE = 10;
const COLUMNS = [
  { id: "from", label: "From", locked: true },
  { id: "to", label: "To" },
  { id: "status", label: "Status" },
  { id: "items", label: "Items" },
  { id: "created", label: "Created" },
  { id: "completed", label: "Completed" },
  { id: "by", label: "By" },
];

function tone(s: TransferStatus) {
  if (s === "COMPLETED") return "ok" as const;
  if (s === "PENDING") return "warn" as const;
  return "danger" as const;
}

export function TransfersPage() {
  const { setActions, sectionKpi } = useProductsHub();
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [cols, setCols] = useState(COLUMNS.map((c) => c.id));
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<StockTransferRow | null>(null);

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  useLayoutEffect(() => {
    setActions(
      <Button variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(seed[1])}>
        Add transfer
      </Button>,
    );
    return () => setActions(null);
  }, [setActions]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const status = chips.find((c) => c.field === "status")?.value?.toUpperCase();
    return seed.filter((r) => {
      if (needle) {
        const text = `${branchName(r.fromBranchId)} ${branchName(r.toBranchId)} ${r.notes}`.toLowerCase();
        if (!text.includes(needle)) return false;
      }
      if (sectionKpi === "PENDING" || sectionKpi === "COMPLETED" || sectionKpi === "CANCELLED") {
        return r.status === sectionKpi;
      }
      if (status) return r.status === status;
      return true;
    });
  }, [q, chips, sectionKpi]);

  const pages = pageSize === PAGE_SIZE_ALL ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = pageSize === PAGE_SIZE_ALL ? rows : rows.slice((page - 1) * pageSize, page * pageSize);
  const show = (id: string) => cols.includes(id);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  return (
    <div className="products-hub-panel">
      <Table
        toolbar={
          <HubToolbar
            columns={COLUMNS}
            cols={cols}
            onCols={setCols}
            chips={chips}
            onApply={(chip) => {
              setChips((prev) => [...prev.filter((c) => c.field !== chip.field), chip]);
              setPage(1);
            }}
            onRemove={(field) => {
              setChips((c) => c.filter((x) => x.field !== field));
              setPage(1);
            }}
            onClear={() => {
              setChips([]);
              setPage(1);
            }}
            filterFields={[{ id: "status", label: "Status", options: ["Pending", "Completed", "Cancelled"] }]}
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search transfers"
          />
        }
        footer={
          <Pagination
            page={Math.min(page, pages)}
            pages={pages}
            total={rows.length}
            pageSize={pageSize}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            onChange={setPage}
          />
        }
      >
        <THead>
          <tr>
            <Th className="ui-check-col">
              <Checkbox
                checked={allShownSelected}
                onChange={(e) => {
                  if (e.target.checked) setSelected((s) => [...new Set([...s, ...shown.map((r) => r.id)])]);
                  else setSelected((s) => s.filter((id) => !shown.some((r) => r.id === id)));
                }}
              />
            </Th>
            <Th>From</Th>
            {show("to") ? <Th>To</Th> : null}
            {show("status") ? <Th>Status</Th> : null}
            {show("items") ? <Th>Items</Th> : null}
            {show("created") ? <Th>Created</Th> : null}
            {show("completed") ? <Th>Completed</Th> : null}
            {show("by") ? <Th>By</Th> : null}
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={cols.length + 2} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td className="ui-check-col">
                <Checkbox
                  checked={selected.includes(row.id)}
                  onChange={(e) => {
                    setSelected((s) => (e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id)));
                  }}
                />
              </Td>
              <Td>{branchName(row.fromBranchId)}</Td>
              {show("to") ? <Td>{branchName(row.toBranchId)}</Td> : null}
              {show("status") ? (
                <Td>
                  <Badge tone={tone(row.status)}>{row.status}</Badge>
                </Td>
              ) : null}
              {show("items") ? <Td numeric>{row.items.length}</Td> : null}
              {show("created") ? <Td>{row.createdAt}</Td> : null}
              {show("completed") ? <Td>{row.completedAt ?? "—"}</Td> : null}
              {show("by") ? <Td>{userName(row.createdBy)}</Td> : null}
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
