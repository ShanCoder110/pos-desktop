import { useEffect, useMemo, useState } from "react";
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
  TabSheet,
  Tabs,
  Td,
  THead,
  Th,
} from "@/components/common";
import type { ProductionRow, ProductionStatus } from "@/shared/domain/types";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import { useQueryTab } from "@/hooks/useQueryTab";
import { ensureSession } from "@/services/auth";
import { listAllBranches, listAllUsers } from "@/services/org";
import { listAllProducts } from "@/services/products";
import { listAllProduction } from "@/services/production";
import { money } from "@/utils/format";

const REPAIR_TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
] as const;

function tone(s: ProductionStatus) {
  if (s === "COMPLETED") return "ok" as const;
  if (s === "IN_PROGRESS") return "warn" as const;
  if (s === "PENDING") return "info" as const;
  return "danger" as const;
}

export function RepairPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useQueryTab(REPAIR_TABS, "all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ProductionRow | null>(null);
  const [seed, setSeed] = useState<ProductionRow[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const [jobs, products, branches, users] = await Promise.all([
        listAllProduction(controller.signal).catch(() => []),
        listAllProducts(controller.signal).catch(() => []),
        listAllBranches(controller.signal).catch(() => []),
        listAllUsers(controller.signal).catch(() => []),
      ]);
      setSeed(jobs);
      setProductNames(Object.fromEntries(products.map((p) => [p.id, p.name])));
      setBranchNames(Object.fromEntries(branches.map((b) => [b.id, b.name])));
      setUserNames(Object.fromEntries(users.map((u) => [u.id, u.name])));
    })();
    return () => controller.abort();
  }, []);

  const productName = (id: string) => productNames[id] ?? id;
  const branchName = (id: string) => branchNames[id] ?? id;
  const userName = (id: string) => userNames[id] ?? id;

  const rows = useMemo(() => {
    return seed.filter((r) => {
      const text = `${r.productionNumber} ${productName(r.productId)}`.toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (tab !== "all") return r.status === tab.toUpperCase();
      return true;
    });
  }, [q, tab, seed, productNames]);

  const pages = Math.max(1, Math.ceil(rows.length / DEFAULT_PAGE_SIZE));
  const shown = rows.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Production" />
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        A job consumes BOM components (PRODUCTION_USE, including damage) then outputs finished goods
        (PRODUCTION_OUTPUT). Technician commission is EmployeeCommission until paid as a Transaction
        OUT.
      </p>
      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
        <KpiCard
          label="Open"
          value={seed.filter((p) => p.status === "PENDING" || p.status === "IN_PROGRESS").length}
          hint="Not finished"
          tone="warn"
        />
        <KpiCard
          label="Completed"
          value={seed.filter((p) => p.status === "COMPLETED").length}
          hint="Stock in"
          tone="ok"
        />
        <KpiCard
          label="Commission due"
          value={money(
            seed.reduce((s, p) => s + (p.status === "COMPLETED" ? p.commissionAmount : 0), 0),
          )}
          hint="Pay staff"
          tone="danger"
        />
      </div>
      <TabSheet
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => {
              setTab(id);
              setPage(1);
            }}
            items={[...REPAIR_TABS]}
          />
        }
      >
        <Table
          toolbar={
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Job no or product"
            />
          }
          footer={
            <Pagination
              page={Math.min(page, pages)}
              pages={pages}
              total={rows.length}
              onChange={setPage}
            />
          }
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
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setOpen(row)}
                    aria-label="View"
                  >
                    <Eye size={15} />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TabSheet>

      <Drawer
        open={Boolean(open)}
        title={open?.productionNumber ?? "Job"}
        onClose={() => setOpen(null)}
        footer={<Button onClick={() => setOpen(null)}>Close</Button>}
      >
        {open ? (
          <div className="ui-stack [display:grid] [gap:12px]">
            <dl className="ui-kv [display:grid] [grid-template-columns:118px_1fr] [gap:8px_12px] [font-size:13px]">
              <dt>Material</dt>
              <dd>{money(open.materialCost)}</dd>
              <dt>Damage</dt>
              <dd>{money(open.damageCost)}</dd>
              <dt>Commission</dt>
              <dd>{money(open.commissionAmount)}</dd>
              <dt>Total</dt>
              <dd>{money(open.totalCost)}</dd>
            </dl>
            <p className="text-[14px] font-extrabold tracking-tight text-ink">Consumed this job</p>
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
                    <Td>{item.lotId || "—"}</Td>
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
