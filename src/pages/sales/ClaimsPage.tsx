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
import { products as seed } from "@/shared/mock";
import type { Product } from "@/shared/types";

const PAGE = 10;

export function ClaimsPage() {
  const { sectionKpi } = useSalesHub();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Product | null>(null);

  useEffect(() => {
    setPage(1);
  }, [sectionKpi]);

  const rows = useMemo(() => {
    return seed.filter((r) => {
      const text = `${r.name} ${r.sku} ${r.category}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (sectionKpi === "damaged") return r.damaged > 0;
      return r.claims > 0;
    });
  }, [q, sectionKpi]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="products-hub-panel [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      <Table
        toolbar={<SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, SKU, category" />}
        footer={<Pagination page={Math.min(page, pages)} pages={pages} total={rows.length} onChange={setPage} />}
      >
        <THead>
          <tr>
            <Th>Product</Th>
            <Th>SKU</Th>
            <Th>Category</Th>
            <Th>Claims</Th>
            <Th>Damaged</Th>
            <Th>Stock</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {shown.length === 0 ? <EmptyRow cols={7} /> : null}
          {shown.map((row) => (
            <tr key={row.id}>
              <Td>{row.name}</Td>
              <Td>{row.sku}</Td>
              <Td>{row.category}</Td>
              <Td numeric>{row.claims}</Td>
              <Td numeric>{row.damaged}</Td>
              <Td numeric>{row.stock}</Td>
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
        title={open?.name ?? "Claim"}
        onClose={() => setOpen(null)}
        footer={<Button onClick={() => setOpen(null)}>Close</Button>}
      >
        {open ? (
          <dl className="ui-kv [display:grid] [grid-template-columns:118px_1fr] [gap:8px_12px] [font-size:13px]">
            <dt>SKU</dt>
            <dd>{open.sku || "—"}</dd>
            <dt>Category</dt>
            <dd>{open.category}</dd>
            <dt>Claims</dt>
            <dd>{open.claims}</dd>
            <dt>Damaged</dt>
            <dd>{open.damaged}</dd>
            <dt>Stock</dt>
            <dd>{open.stock}</dd>
            <dt>Status</dt>
            <dd>
              <Badge tone={open.claims > 0 ? "warn" : "ok"}>{open.claims > 0 ? "Open claims" : "Clear"}</Badge>
            </dd>
          </dl>
        ) : null}
      </Drawer>
    </div>
  );
}
