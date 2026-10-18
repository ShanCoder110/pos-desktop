import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Eye, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  Field,
  KpiCard,
  Menu,
  MenuItem,
  PageHead,
  Table,
  Td,
  TextInput,
  THead,
  Th,
  toaster,
} from "@/components/common";
import type { ProductLotRow, StockTransferRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { routes } from "@/shared/constants/routes";
import { ensureSession } from "@/services/auth";
import { listAllLots } from "@/services/lots";
import { createBranch, listAllBranches, type BranchResponse } from "@/services/org";
import { listAllProducts } from "@/services/products";
import { listAllTransfers } from "@/services/transfers";
import {
  formatStockQty,
  productSellUnits,
  roundStockQty,
  toBaseQty,
} from "@/pages/products/productQty";
import { formatTableDateTime, limitMoneyDraft, money, shortError } from "@/utils/format";
import {
  availableWholeQty,
  hasCompleteSellUnit,
  parseWholeQtyDraft,
  wholeQty,
} from "@/utils/salePricing";
import { RepairStockComposer } from "./RepairStockComposer";
import { createRepairAddTransfer, permanentlyDeleteRepairTransfer } from "./repairShopMutations";
import {
  decodeRepairTransfer,
  isActiveRepairTransfer,
  type RepairTransferLineMeta,
} from "./repairShopTransfer";

type RepairLineRow = {
  id: string;
  transferId: string;
  transferNumber: string;
  date: string;
  productId: string;
  productName: string;
  sku: string;
  lineIndex: number;
  unitId: string;
  quantity: number;
  unitName: string;
  unitPrice: number;
  unitCost: number;
  baseQuantity: number;
  total: number;
  profit: number;
  status: string;
};

function branchQty(lot: ProductLotRow, branchId: string) {
  return lot.branchAllocations?.find((row) => row.branchId === branchId)?.quantity ?? 0;
}

export function RepairPage() {
  const navigate = useNavigate();
  const { repairShopId } = useParams<{ repairShopId: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [lots, setLots] = useState<ProductLotRow[]>([]);
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [transfers, setTransfers] = useState<StockTransferRow[]>([]);
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [repairBranchId, setRepairBranchId] = useState("");
  const [addProductsOpen, setAddProductsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [openRecord, setOpenRecord] = useState<StockTransferRow | null>(null);
  const [editLine, setEditLine] = useState<RepairLineRow | null>(null);
  const [editQtyDraft, setEditQtyDraft] = useState("");
  const [editPriceDraft, setEditPriceDraft] = useState("");
  const [editError, setEditError] = useState("");
  const [deleteLine, setDeleteLine] = useState<RepairLineRow | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [shopName, setShopName] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [savingShop, setSavingShop] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [nextProducts, nextLots, nextBranches, nextTransfers] = await Promise.all([
      listAllProducts(signal),
      listAllLots({}, signal),
      listAllBranches(signal),
      listAllTransfers({}, signal),
    ]);
    setProducts(nextProducts);
    setLots(nextLots);
    setBranches(nextBranches);
    setTransfers(nextTransfers);
    return nextBranches;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const session = await ensureSession(controller.signal);
      const nextBranches = await refresh(controller.signal);
      const sources = nextBranches.filter((branch) => branch.isActive && branch.type !== "REPAIR");
      setSourceBranchId(
        sources.some((branch) => branch.id === session?.branchId)
          ? (session?.branchId ?? "")
          : (sources[0]?.id ?? ""),
      );
      setRepairBranchId(repairShopId ?? "");
    })().catch((error) => {
      if (!controller.signal.aborted) {
        toaster.error(shortError(error, "Could not load repair shops"));
      }
    });
    return () => controller.abort();
  }, [refresh, repairShopId]);

  const repairShops = branches.filter((branch) => branch.isActive && branch.type === "REPAIR");
  const sourceBranches = branches.filter((branch) => branch.isActive && branch.type !== "REPAIR");
  const selectedShop = repairShops.find((branch) => branch.id === repairBranchId);
  const sourceBranch = sourceBranches.find((branch) => branch.id === sourceBranchId);
  const selectedTransfers = useMemo(() => {
    const notes = transfers.map((transfer) => transfer.notes);
    return transfers.filter(
      (transfer) =>
        transfer.toBranchId === repairBranchId && isActiveRepairTransfer(transfer, notes),
    );
  }, [repairBranchId, transfers]);

  const shopStock = useMemo(
    () => lots.reduce((total, lot) => total + branchQty(lot, repairBranchId), 0),
    [lots, repairBranchId],
  );

  const productById = useMemo(() => {
    const map = new Map(products.map((product) => [product.id, product]));
    return map;
  }, [products]);

  const repairLines = useMemo(() => {
    const rows: RepairLineRow[] = [];
    selectedTransfers.forEach((transfer) => {
      const meta = decodeRepairTransfer(transfer.notes);
      meta?.lines.forEach((line: RepairTransferLineMeta, index) => {
        const product = productById.get(line.productId);
        const total = line.quantity * line.unitPrice;
        const cost = line.quantity * line.unitCost;
        rows.push({
          id: `${transfer.id}:${line.productId}:${index}`,
          transferId: transfer.id,
          transferNumber: transfer.transferNumber,
          date: transfer.createdAt,
          productId: line.productId,
          productName: product?.name ?? line.productId,
          sku: product?.sku ?? "",
          lineIndex: index,
          unitId: line.unitId,
          quantity: line.quantity,
          unitName: line.unitName,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          baseQuantity: line.baseQuantity,
          total,
          profit: total - cost,
          status: transfer.status,
        });
      });
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [productById, selectedTransfers]);

  const totals = useMemo(() => {
    let cost = 0;
    let value = 0;
    repairLines.forEach((line) => {
      cost += line.quantity * line.unitCost;
      value += line.total;
    });
    return { cost, value, profit: value - cost };
  }, [repairLines]);

  const openRecordLines = useMemo(() => {
    if (!openRecord) return [];
    return repairLines.filter((line) => line.transferId === openRecord.id);
  }, [openRecord, repairLines]);

  function transferFor(line: RepairLineRow) {
    return selectedTransfers.find((row) => row.id === line.transferId) ?? null;
  }

  function metaLinesFor(transfer: StockTransferRow) {
    return decodeRepairTransfer(transfer.notes)?.lines ?? [];
  }

  function openEdit(line: RepairLineRow) {
    setEditLine(line);
    setEditQtyDraft(String(line.quantity));
    setEditPriceDraft(String(line.unitPrice));
    setEditError("");
  }

  async function saveEditLine() {
    if (!editLine || !sourceBranch || actionBusy) return;
    const transfer = transferFor(editLine);
    const product = productById.get(editLine.productId);
    const units = product ? productSellUnits(product) : [];
    const unit = units.find((row) => row.id === editLine.unitId) ?? units[0];
    if (!transfer || !product || !unit) {
      setEditError("This product is no longer available.");
      return;
    }
    const quantity = wholeQty(Number(editQtyDraft));
    const unitPrice = Number(editPriceDraft);
    if (quantity <= 0) {
      setEditError("Enter a whole-number quantity.");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < unit.min) {
      setEditError(`Price cannot be below ${money(unit.min)}.`);
      return;
    }
    // After delete, this line's base qty returns to source — allow at least that much.
    const sourceStock = lots.reduce(
      (sum, lot) => (lot.productId === product.id ? sum + branchQty(lot, sourceBranch.id) : sum),
      0,
    );
    const available = sourceStock + editLine.baseQuantity;
    if (!hasCompleteSellUnit(unit, available)) {
      setEditError(`Not enough stock for ${unit.name || product.unit}.`);
      return;
    }
    const maxQty = availableWholeQty(unit, available);
    if (quantity > maxQty) {
      setEditError(`Only ${maxQty} ${unit.name || product.unit} left.`);
      return;
    }

    const nextLines = metaLinesFor(transfer).map((line, index) =>
      index === editLine.lineIndex
        ? {
            ...line,
            quantity,
            unitPrice,
            baseQuantity: roundStockQty(toBaseQty(units, unit, quantity)),
            unitCost: unit.cost,
            unitName: unit.name || product.unit,
          }
        : line,
    );

    setActionBusy(true);
    setEditError("");
    try {
      await permanentlyDeleteRepairTransfer(transfer, transfers);
      const nextLots = await listAllLots({});
      await createRepairAddTransfer({
        sourceBranchId: sourceBranch.id,
        repairBranchId,
        lines: nextLines,
        products,
        lots: nextLots,
      });
      toaster.success("Product updated");
      setEditLine(null);
      await refresh();
    } catch (error) {
      setEditError(shortError(error, "Could not update product"));
      await refresh();
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmDeleteLine() {
    if (!deleteLine || !sourceBranch || actionBusy) return;
    const transfer = transferFor(deleteLine);
    if (!transfer) return;
    const remaining = metaLinesFor(transfer).filter(
      (_line, index) => index !== deleteLine.lineIndex,
    );
    setActionBusy(true);
    try {
      await permanentlyDeleteRepairTransfer(transfer, transfers);
      if (remaining.length) {
        const nextLots = await listAllLots({});
        await createRepairAddTransfer({
          sourceBranchId: sourceBranch.id,
          repairBranchId,
          lines: remaining,
          products,
          lots: nextLots,
        });
      }
      toaster.success(remaining.length ? "Product removed" : "Record deleted");
      setDeleteLine(null);
      setOpenRecord(null);
      await refresh();
    } catch (error) {
      toaster.error(shortError(error, "Could not delete product"));
      await refresh();
    } finally {
      setActionBusy(false);
    }
  }

  async function addShop() {
    if (!shopName.trim()) {
      toaster.error("Repair shop name is required");
      return;
    }
    setSavingShop(true);
    try {
      const created = await createBranch({
        name: shopName.trim(),
        type: "REPAIR",
        phone: shopPhone.trim() || undefined,
        address: shopAddress.trim() || undefined,
        isActive: true,
      });
      await refresh();
      setRepairBranchId(created.id);
      setCreateOpen(false);
      setShopName("");
      setShopPhone("");
      setShopAddress("");
      toaster.success("Repair shop created");
      navigate(`${routes.repair}/${encodeURIComponent(created.id)}`);
    } catch (error) {
      toaster.error(shortError(error, "Could not create repair shop"));
    } finally {
      setSavingShop(false);
    }
  }

  function openShop(shopId: string) {
    navigate(`${routes.repair}/${encodeURIComponent(shopId)}`);
  }

  if (repairShopId && selectedShop && sourceBranch) {
    return (
      <div className="ui-stack [display:grid] [gap:12px]">
        <PageHead
          title={selectedShop.name}
          leading={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Back to repair shops"
              title="Back to repair shops"
              onClick={() => navigate(routes.repair)}
            >
              <ArrowLeft size={16} />
            </Button>
          }
        >
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => setAddProductsOpen(true)}
          >
            Add products
          </Button>
        </PageHead>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
          <div>
            <span>{selectedShop.phone || "No phone"}</span>
            {selectedShop.address ? <span> · {selectedShop.address}</span> : null}
          </div>
          <Badge tone={totals.profit > 0 ? "warn" : "info"}>
            Profit on hold: {money(totals.profit)}
          </Badge>
        </div>

        <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(4,_minmax(0,_1fr))] [gap:10px]">
          <KpiCard
            label="Stock held"
            value={formatStockQty(shopStock)}
            hint="Base units at this shop"
            tone="info"
          />
          <KpiCard
            label="Value held"
            value={money(totals.value)}
            hint={`${repairLines.length} product line(s)`}
            tone="warn"
          />
          <KpiCard
            label="Cost held"
            value={money(totals.cost)}
            hint="Stock cost on records"
            tone="ok"
          />
          <KpiCard
            label="Profit on hold"
            value={money(totals.profit)}
            hint="Expected value less cost"
            tone={totals.profit > 0 ? "warn" : "info"}
          />
        </div>

        <Table>
          <THead>
            <tr>
              <Th>Date</Th>
              <Th>Record</Th>
              <Th>Product</Th>
              <Th>Quantity</Th>
              <Th>Unit price</Th>
              <Th>Line total</Th>
              <Th />
            </tr>
          </THead>
          <tbody>
            {repairLines.length === 0 ? (
              <EmptyRow cols={7} text="No products added yet" />
            ) : (
              repairLines.map((line) => (
                <tr key={line.id}>
                  <Td>{formatTableDateTime(line.date)}</Td>
                  <Td className="font-medium text-ink">#{line.transferNumber}</Td>
                  <Td>
                    <div className="font-medium text-ink">{line.productName}</div>
                    {line.sku ? (
                      <div className="text-[11px] text-muted">SKU: {line.sku}</div>
                    ) : null}
                  </Td>
                  <Td numeric>
                    {formatStockQty(line.quantity)} {line.unitName}
                  </Td>
                  <Td numeric>{money(line.unitPrice)}</Td>
                  <Td numeric className="font-semibold text-ink">
                    {money(line.total)}
                  </Td>
                  <Td>
                    <div onClick={(event) => event.stopPropagation()}>
                      <Menu>
                        <MenuItem
                          icon={<Eye size={14} />}
                          onClick={() => setOpenRecord(transferFor(line))}
                        >
                          View
                        </MenuItem>
                        <MenuItem icon={<Pencil size={14} />} onClick={() => openEdit(line)}>
                          Edit
                        </MenuItem>
                        <MenuItem
                          danger
                          icon={<Trash2 size={14} />}
                          onClick={() => setDeleteLine(line)}
                        >
                          Delete
                        </MenuItem>
                      </Menu>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>

        <Drawer
          open={addProductsOpen}
          size="lg"
          title={`Add products · ${selectedShop.name}`}
          subtitle={
            <p className="ui-drawer-subtitle">
              Add products and expected value — same flow as a credit sale
            </p>
          }
          onClose={() => setAddProductsOpen(false)}
        >
          <RepairStockComposer
            sourceBranchId={sourceBranch.id}
            repairBranchId={selectedShop.id}
            repairBranchName={selectedShop.name}
            products={products}
            lots={lots}
            onSaved={async () => {
              await refresh();
              setAddProductsOpen(false);
            }}
          />
        </Drawer>

        <Drawer
          open={Boolean(openRecord)}
          title={openRecord ? `Record · #${openRecord.transferNumber}` : "Record"}
          subtitle={
            openRecord ? (
              <p className="ui-drawer-subtitle">{formatTableDateTime(openRecord.createdAt)}</p>
            ) : null
          }
          onClose={() => setOpenRecord(null)}
        >
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-paper p-3 text-[11px]">
              <div>
                <span className="block text-muted">Value</span>
                <strong className="text-ink">
                  {money(openRecordLines.reduce((sum, line) => sum + line.total, 0))}
                </strong>
              </div>
              <div>
                <span className="block text-muted">Cost</span>
                <strong className="text-ink">
                  {money(
                    openRecordLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0),
                  )}
                </strong>
              </div>
              <div>
                <span className="block text-muted">Profit</span>
                <strong className="text-accent-deep">
                  {money(openRecordLines.reduce((sum, line) => sum + line.profit, 0))}
                </strong>
              </div>
            </div>
            <Table>
              <THead>
                <tr>
                  <Th>Product</Th>
                  <Th>Quantity</Th>
                  <Th>Unit price</Th>
                  <Th>Total</Th>
                </tr>
              </THead>
              <tbody>
                {openRecordLines.map((line) => (
                  <tr key={line.id}>
                    <Td>
                      <div className="font-medium text-ink">{line.productName}</div>
                      {line.sku ? (
                        <div className="text-[11px] text-muted">SKU: {line.sku}</div>
                      ) : null}
                    </Td>
                    <Td numeric>
                      {formatStockQty(line.quantity)} {line.unitName}
                    </Td>
                    <Td numeric>{money(line.unitPrice)}</Td>
                    <Td numeric className="font-semibold">
                      {money(line.total)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Drawer>

        <Drawer
          open={Boolean(editLine)}
          title={editLine ? `Edit · ${editLine.productName}` : "Edit"}
          subtitle={
            editLine ? (
              <p className="ui-drawer-subtitle">
                #{editLine.transferNumber}
                {editLine.sku ? ` · SKU ${editLine.sku}` : ""}
              </p>
            ) : null
          }
          onClose={() => {
            if (!actionBusy) setEditLine(null);
          }}
          footer={
            <>
              <Button disabled={actionBusy} onClick={() => setEditLine(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={actionBusy} onClick={() => void saveEditLine()}>
                {actionBusy ? "Saving…" : "Save changes"}
              </Button>
            </>
          }
        >
          {editLine ? (
            <div className="grid gap-3">
              <Field label="Quantity">
                <TextInput
                  inputMode="numeric"
                  value={editQtyDraft}
                  onChange={(event) => {
                    setEditQtyDraft(parseWholeQtyDraft(event.target.value));
                    setEditError("");
                  }}
                />
                <small className="mt-1 block text-[10px] text-muted">
                  {editLine.unitName} (whole numbers only)
                </small>
              </Field>
              <Field label="Unit price">
                <TextInput
                  inputMode="decimal"
                  value={editPriceDraft}
                  onChange={(event) => {
                    setEditPriceDraft(limitMoneyDraft(event.target.value));
                    setEditError("");
                  }}
                />
              </Field>
              <div className="rounded-lg border border-line bg-bg/40 px-3 py-2 text-[12px]">
                <span className="text-muted">Line total </span>
                <strong className="text-ink">
                  {money((Number(editQtyDraft) || 0) * (Number(editPriceDraft) || 0))}
                </strong>
              </div>
              {editError ? (
                <p className="m-0 text-[12px] text-[var(--danger)]">{editError}</p>
              ) : null}
            </div>
          ) : null}
        </Drawer>

        <ConfirmDialog
          open={Boolean(deleteLine)}
          title="Delete product?"
          body={
            deleteLine
              ? `Permanently remove ${deleteLine.productName} from this repair shop record? This cannot be undone.`
              : ""
          }
          confirmLabel={actionBusy ? "Deleting…" : "Delete permanently"}
          danger
          onCancel={() => {
            if (!actionBusy) setDeleteLine(null);
          }}
          onConfirm={() => {
            if (!actionBusy) void confirmDeleteLine();
          }}
        />
      </div>
    );
  }

  return (
    <div className="ui-stack grid gap-3">
      <PageHead title="Repair shops">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
          Create repair shop
        </Button>
      </PageHead>
      <p className="m-0 text-[12px] leading-relaxed text-muted">
        Create a repair location, add products to its records, and track stock cost, expected value,
        and profit held for that shop.
      </p>

      <section className="grid gap-2">
        <h2 className="m-0 text-[12px] font-extrabold uppercase tracking-wide text-sub">
          Repair shop list
        </h2>
        <Table>
          <THead>
            <tr>
              <Th>Repair shop</Th>
              <Th>Phone</Th>
              <Th>Address</Th>
              <Th>Stock held</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </THead>
          <tbody>
            {repairShops.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-2.5">
                  <div className="grid min-h-28 place-items-center text-center text-muted">
                    <div>
                      <Store className="mx-auto mb-1.5" size={24} />
                      <strong className="block text-[12px] text-sub">No repair shops yet</strong>
                      <small className="text-[10px]">
                        Create one to start tracking stock sent for repair.
                      </small>
                    </div>
                  </div>
                </td>
              </tr>
            ) : null}
            {repairShops.map((shop) => {
              const stock = lots.reduce((sum, lot) => sum + branchQty(lot, shop.id), 0);
              const selected = shop.id === repairBranchId;
              return (
                <tr
                  key={shop.id}
                  tabIndex={0}
                  className={`cursor-pointer transition-colors hover:bg-bg ${selected ? "bg-accent-bg" : ""}`}
                  onClick={() => openShop(shop.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") openShop(shop.id);
                  }}
                >
                  <Td>
                    <span className="flex items-center gap-2">
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-lg ${selected ? "bg-accent text-white" : "bg-bg text-sub"}`}
                      >
                        <Store size={15} />
                      </span>
                      <strong className="text-[12px] text-ink">{shop.name}</strong>
                    </span>
                  </Td>
                  <Td>{shop.phone || "—"}</Td>
                  <Td>{shop.address || "—"}</Td>
                  <Td numeric>{stock}</Td>
                  <Td>
                    <Badge tone="ok">Active</Badge>
                  </Td>
                  <Td>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Open ${shop.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openShop(shop.id);
                      }}
                    >
                      <ChevronRight size={15} />
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>

      <Drawer
        open={createOpen}
        title="Create repair shop"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={savingShop} onClick={() => void addShop()}>
              {savingShop ? "Creating…" : "Create shop"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <p className="m-0 rounded-lg bg-accent-bg p-3 text-[11px] leading-relaxed text-accent-deep">
            A repair shop holds product records with expected value and profit — add items the same
            way as a credit sale.
          </p>
          <Field label="Shop name">
            <TextInput
              autoFocus
              value={shopName}
              placeholder="e.g. Bilal Repair Center"
              onChange={(event) => setShopName(event.target.value)}
            />
          </Field>
          <Field label="Phone (optional)">
            <TextInput
              value={shopPhone}
              placeholder="03xx-xxxxxxx"
              onChange={(event) => setShopPhone(event.target.value)}
            />
          </Field>
          <Field label="Address (optional)">
            <TextInput
              value={shopAddress}
              placeholder="Market or workshop address"
              onChange={(event) => setShopAddress(event.target.value)}
            />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}
