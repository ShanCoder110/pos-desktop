import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  EmptyRow,
  HubChart,
  PAGE_SIZE_ALL,
  Pagination,
  Table,
  Td,
  THead,
  Th,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { catalog as seed, stockMovements, branchName, lotNumber, userName } from "@/shared/domain/mock";
import type { CatalogProduct } from "@/shared/domain/types";
import { qty } from "@/utils/format";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import { STOCK_TABLE_COLUMNS } from "@/shared/constants/products";


export function StockPage() {
  const { sectionKpi } = useProductsHub();
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cols, setCols] = useState(STOCK_TABLE_COLUMNS.map((c) => c.id));
  const [view, setView] = useState<HubView>("table");
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const status = chips.find((c) => c.field === "status")?.value;
    return seed.filter((r) => {
      if (needle && !`${r.name} ${r.sku}`.toLowerCase().includes(needle)) return false;
      if (sectionKpi === "healthy") return r.onHand >= r.minimumStock;
      if (sectionKpi === "risk") return r.onHand > 0 && r.onHand < r.minimumStock;
      if (sectionKpi === "dead") return r.onHand <= 0;
      if (sectionKpi === "made") return r.isManufactured;
      if (status === "Healthy") return r.onHand >= r.minimumStock;
      if (status === "Below min") return r.onHand > 0 && r.onHand < r.minimumStock;
      if (status === "Zero") return r.onHand <= 0;
      return true;
    });
  }, [q, chips, sectionKpi]);

  const pages = pageSize === PAGE_SIZE_ALL ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = pageSize === PAGE_SIZE_ALL ? rows : rows.slice((page - 1) * pageSize, page * pageSize);
  const chartData = rows
    .map((row) => ({ id: row.id, label: row.name, value: row.onHand }))
    .sort((a, b) => b.value - a.value);
  const moves = open ? stockMovements.filter((m) => m.productId === open.id) : [];
  const show = (id: string) => cols.includes(id);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      <Table
        toolbar={
          <HubToolbar
            columns={STOCK_TABLE_COLUMNS}
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
            filterFields={[{ id: "status", label: "Status", options: ["Healthy", "Below min", "Zero"] }]}
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search stock"
            view={view}
            onView={setView}
          />
        }
        body={view === "insights" ? <HubChart type="bar" title="On-hand stock by product" data={chartData} /> : undefined}
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
            <Th>Product</Th>
            {show("sku") ? <Th>SKU</Th> : null}
            {show("unit") ? <Th>Base unit</Th> : null}
            {show("onHand") ? <Th>On hand</Th> : null}
            {show("minimum") ? <Th>Minimum</Th> : null}
            {show("status") ? <Th>Status</Th> : null}
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={cols.length + 2} /> : null}
          {shown.map((row) => {
            const dead = row.onHand <= 0;
            const low = !dead && row.onHand < row.minimumStock;
            return (
              <tr key={row.id}>
                <Td className="ui-check-col">
                  <Checkbox
                    checked={selected.includes(row.id)}
                    onChange={(e) => {
                      setSelected((s) => (e.target.checked ? [...s, row.id] : s.filter((id) => id !== row.id)));
                    }}
                  />
                </Td>
                <Td>
                  {row.name}
                  {row.isManufactured ? <span className="sub">Manufactured</span> : null}
                </Td>
                {show("sku") ? <Td>{row.sku}</Td> : null}
                {show("unit") ? <Td>{row.baseUnit}</Td> : null}
                {show("onHand") ? <Td numeric>{qty(row.onHand, row.baseUnit)}</Td> : null}
                {show("minimum") ? <Td numeric>{qty(row.minimumStock, row.baseUnit)}</Td> : null}
                {show("status") ? (
                  <Td>
                    <Badge tone={dead ? "danger" : low ? "warn" : "ok"}>{dead ? "Out" : low ? "Low" : "OK"}</Badge>
                  </Td>
                ) : null}
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
          <div className="ui-stack [display:grid] [gap:12px]">
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
