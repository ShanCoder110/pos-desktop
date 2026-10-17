import { useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  Button,
  EmptyRow,
  Field,
  MoneyInput,
  SearchableSelect,
  Table,
  TableRowsSkeleton,
  Td,
  TextInput,
  THead,
  Th,
  Toggle,
  toaster,
} from "@/components/common";
import { useProductsHub } from "@/pages/products/ProductsLayout";
import { productSellUnits, qtyInUnit } from "@/pages/products/productQty";
import { STOCK_COUNT_COPY, STOCK_COUNT_ROLES } from "@/shared/constants/products";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import type { Product, ProductSellUnit } from "@/shared/types";
import type { StockMovementRow } from "@/shared/domain/types";
import { ensureSession } from "@/services/auth";
import { listAllBranches, listAllUsers } from "@/services/org";
import { countStock, listStock, listStockMovements, mapStockMovement } from "@/services/stock";
import { isAbortError } from "@/utils/async";
import { formatTableDateTime, shortError } from "@/utils/format";
import { formatStockQty } from "@/pages/products/productQty";
import {
  displayedToBaseQty,
  MAX_STOCK_COUNT_BASE_UNITS,
  stockCountAllowsFractions,
  stockCountCountedError,
  stockCountDifference,
  STOCK_COUNT_REASON_MAX,
} from "@/utils/stockCount";

function formatDiff(value: number) {
  if (Math.abs(value) < 1e-9) return "0";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatStockQty(value)}`;
}

export function StockCountPage() {
  const { products, suppliers, setActions, refreshProducts, refreshLots } = useProductsHub();
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [productId, setProductId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [adjustSupplier, setAdjustSupplier] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [supplierAmount, setSupplierAmount] = useState("");
  const [systemBase, setSystemBase] = useState(0);
  const [history, setHistory] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState({
    session: true,
    stock: false,
    history: false,
    saving: false,
  });

  // null = role still loading — do not fetch stock/history (avoids cashier toasts).
  const allowed = viewerRole !== null && STOCK_COUNT_ROLES.has(viewerRole);

  const product = useMemo(
    () => products.find((row) => row.id === productId) ?? null,
    [products, productId],
  );
  const sellUnits = useMemo(() => (product ? productSellUnits(product) : []), [product]);
  const unit = useMemo(
    () => sellUnits.find((row) => row.id === unitId) ?? sellUnits.find((row) => row.isBase) ?? null,
    [sellUnits, unitId],
  );

  const allowsFractions = stockCountAllowsFractions(
    unit?.symbol ?? product?.unit,
    product?.isLinear,
  );
  const countedNumber = Number(counted);
  const countedBase = unit
    ? displayedToBaseQty(
        Number.isFinite(countedNumber) ? countedNumber : 0,
        unit.contains,
        unit.factorDirection === "divide" ? "divide" : "multiply",
      )
    : 0;
  const countedFieldError = stockCountCountedError(counted, countedBase, allowsFractions);
  const countedValid =
    counted.trim() !== "" &&
    Number.isFinite(countedNumber) &&
    countedNumber >= 0 &&
    countedBase <= MAX_STOCK_COUNT_BASE_UNITS &&
    !countedFieldError;
  const difference = countedValid ? stockCountDifference(systemBase, countedBase) : 0;
  const systemInUnit =
    product && unit ? qtyInUnit(sellUnits, product.unit, unit, systemBase) : systemBase;

  useEffect(() => {
    setActions(
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
        <ClipboardList size={14} />
        {STOCK_COUNT_COPY.subtitle}
      </span>,
    );
    return () => setActions(null);
  }, [setActions]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading((current) => ({ ...current, session: true }));
    void Promise.all([
      ensureSession(controller.signal),
      listAllBranches(controller.signal).catch(() => []),
      listAllUsers(controller.signal).catch(() => []),
    ])
      .then(([session, branchRows, users]) => {
        setViewerRole(session?.user.role ?? null);
        const active = branchRows.filter((row) => row.isActive !== false);
        setBranches(active.map((row) => ({ id: row.id, name: row.name })));
        setUserNames(Object.fromEntries(users.map((row) => [row.id, row.name])));
        const sessionBranch = session?.branchId ?? active[0]?.id ?? "";
        setBranchId((current) => current || sessionBranch);
      })
      .catch(() => setViewerRole(null))
      .finally(() => setLoading((current) => ({ ...current, session: false })));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!productId) {
      setUnitId("");
      return;
    }
    const next = productSellUnits(products.find((row) => row.id === productId) as Product);
    const preferred = next.find((row) => row.isBase) ?? next[0];
    setUnitId(preferred?.id ?? "");
  }, [productId, products]);

  useEffect(() => {
    if (!productId || !branchId || !allowed) {
      setSystemBase(0);
      return;
    }
    const controller = new AbortController();
    setLoading((current) => ({ ...current, stock: true }));
    void listStock({ productId, branchId, perPage: 1 }, controller.signal)
      .then((response) => {
        const row = response.data[0];
        setSystemBase(row?.remaining ?? 0);
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        const fallback = products.find((row) => row.id === productId);
        const branchQty = fallback?.branchStock?.find((row) => row.branchId === branchId)?.quantity;
        setSystemBase(branchQty ?? fallback?.stock ?? 0);
      })
      .finally(() => setLoading((current) => ({ ...current, stock: false })));
    return () => controller.abort();
  }, [productId, branchId, allowed, products]);

  function reloadHistory(signal?: AbortSignal) {
    setLoading((current) => ({ ...current, history: true }));
    return listStockMovements(
      {
        movementType: "ADJUSTMENT",
        perPage: DEFAULT_PAGE_SIZE * 2,
        branchId: branchId || undefined,
      },
      signal,
    )
      .then((response) => {
        const rows = response.data
          .filter(
            (row) => row.referenceType === "StockAdjustment" || row.movementType === "ADJUSTMENT",
          )
          .map(mapStockMovement);
        setHistory(rows);
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        toaster.error(shortError(error, STOCK_COUNT_COPY.loadFailed));
        setHistory([]);
      })
      .finally(() => setLoading((current) => ({ ...current, history: false })));
  }

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void reloadHistory(controller.signal);
    return () => controller.abort();
  }, [allowed, branchId]);

  async function save() {
    if (!productId) {
      toaster.error(STOCK_COUNT_COPY.pickProduct);
      return;
    }
    if (!branchId) {
      toaster.error(STOCK_COUNT_COPY.pickBranch);
      return;
    }
    if (!unitId) {
      toaster.error(STOCK_COUNT_COPY.pickUnit);
      return;
    }
    if (counted.trim() === "") {
      toaster.error(STOCK_COUNT_COPY.countedRequired);
      return;
    }
    if (countedFieldError) {
      toaster.error(countedFieldError);
      return;
    }
    if (!countedValid) {
      toaster.error(STOCK_COUNT_COPY.countedRequired);
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      toaster.error(STOCK_COUNT_COPY.reasonRequired);
      return;
    }
    if (trimmedReason.length > STOCK_COUNT_REASON_MAX) {
      toaster.error(STOCK_COUNT_COPY.reasonMax);
      return;
    }
    if (adjustSupplier && (!supplierId || !supplierAmount)) {
      toaster.error("Pick a supplier and amount");
      return;
    }

    setLoading((current) => ({ ...current, saving: true }));
    try {
      await countStock({
        productId,
        branchId,
        productUnitId: unitId,
        countedQuantity: countedNumber,
        reason: trimmedReason,
        adjustSupplierPayable: adjustSupplier,
        supplierId: adjustSupplier ? supplierId : undefined,
        supplierAmount: adjustSupplier ? Number(supplierAmount) || 0 : undefined,
      });
      toaster.success(STOCK_COUNT_COPY.saved);
      setCounted("");
      setReason("");
      setAdjustSupplier(false);
      setSupplierAmount("");
      await Promise.all([refreshProducts(), refreshLots(), reloadHistory()]);
      const stock = await listStock({ productId, branchId, perPage: 1 });
      setSystemBase(stock.data[0]?.remaining ?? countedBase);
    } catch (error) {
      if (isAbortError(error)) return;
      toaster.error(shortError(error, STOCK_COUNT_COPY.saveFailed));
    } finally {
      setLoading((current) => ({ ...current, saving: false }));
    }
  }

  if (loading.session) {
    return (
      <div className="p-3">
        <table>
          <tbody>
            <TableRowsSkeleton columnCount={4} rows={6} />
          </tbody>
        </table>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-muted">
        {STOCK_COUNT_COPY.denied}
      </div>
    );
  }

  const productOptions = products.map((row) => ({
    value: row.id,
    label: `${row.name}${row.sku ? ` · ${row.sku}` : ""}`,
  }));
  const branchOptions = branches.map((row) => ({ value: row.id, label: row.name }));
  const unitOptions = sellUnits.map((row: ProductSellUnit) => ({
    value: row.id,
    label: `${row.name}${row.symbol ? ` (${row.symbol})` : ""}`,
  }));
  const supplierOptions = suppliers
    .filter((row) => row.isActive)
    .map((row) => ({ value: row.id, label: row.name }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <section className="shrink-0 rounded-[10px] border border-line bg-paper p-3">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList size={16} className="text-accent-deep" />
          <strong className="text-[13px] text-ink">{STOCK_COUNT_COPY.title}</strong>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={STOCK_COUNT_COPY.product}>
            <SearchableSelect
              value={productId}
              onChange={setProductId}
              placeholder={STOCK_COUNT_COPY.pickProduct}
              searchPlaceholder="Search products"
              clearable
              options={productOptions}
            />
          </Field>
          <Field label={STOCK_COUNT_COPY.branch}>
            <SearchableSelect
              value={branchId}
              onChange={setBranchId}
              placeholder={STOCK_COUNT_COPY.pickBranch}
              searchPlaceholder="Search branches"
              clearable={false}
              options={branchOptions}
            />
          </Field>
          <Field label={STOCK_COUNT_COPY.unit}>
            <SearchableSelect
              value={unitId}
              onChange={setUnitId}
              placeholder={STOCK_COUNT_COPY.pickUnit}
              searchPlaceholder="Search units"
              clearable={false}
              options={unitOptions}
              disabled={!product}
            />
          </Field>
          <Field label={STOCK_COUNT_COPY.currentBase}>
            <TextInput value={loading.stock ? "…" : formatStockQty(systemBase)} disabled />
          </Field>
          <Field label={STOCK_COUNT_COPY.currentInUnit}>
            <TextInput
              value={
                loading.stock
                  ? "…"
                  : `${formatStockQty(systemInUnit)}${unit ? ` ${unit.name}` : ""}`
              }
              disabled
            />
          </Field>
          <Field
            label={STOCK_COUNT_COPY.counted}
            error={counted.trim() !== "" ? (countedFieldError ?? undefined) : undefined}
          >
            <TextInput
              inputMode={allowsFractions ? "decimal" : "numeric"}
              maxLength={FIELD_LIMITS.qty}
              placeholder="0"
              value={counted}
              onChange={(event) => {
                const next = event.target.value;
                if (!allowsFractions && next.includes(".")) return;
                if (allowsFractions && /\.\d{4,}$/.test(next)) return;
                setCounted(next);
              }}
            />
          </Field>
          <Field label={STOCK_COUNT_COPY.difference}>
            <div
              className={
                countedValid && difference < 0
                  ? "rounded-[8px] border border-line bg-[var(--bg)] px-3 py-2 text-[13px] tabular-nums text-[var(--danger)]"
                  : countedValid && difference > 0
                    ? "rounded-[8px] border border-line bg-[var(--bg)] px-3 py-2 text-[13px] tabular-nums text-[var(--ok)]"
                    : "rounded-[8px] border border-line bg-[var(--bg)] px-3 py-2 text-[13px] tabular-nums text-muted"
              }
            >
              {countedValid ? formatDiff(difference) : "—"}
            </div>
          </Field>
          <Field
            label={STOCK_COUNT_COPY.reason}
            className="sm:col-span-2"
            hint={`${reason.trim().length}/${STOCK_COUNT_REASON_MAX}`}
          >
            <TextInput
              maxLength={FIELD_LIMITS.stockCountReason}
              placeholder={STOCK_COUNT_COPY.reasonPlaceholder}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 rounded-[10px] border border-dashed border-line bg-[var(--bg)] p-3 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
          <div className="flex items-center gap-2 pb-1">
            <Toggle checked={adjustSupplier} onChange={setAdjustSupplier} label="" />
            <div>
              <strong className="block text-[12px] text-ink">
                {STOCK_COUNT_COPY.supplierAdjust}
              </strong>
              <span className="text-[11px] text-muted">{STOCK_COUNT_COPY.supplierAdjustHint}</span>
            </div>
          </div>
          {adjustSupplier ? (
            <>
              <Field label={STOCK_COUNT_COPY.supplier}>
                <SearchableSelect
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Choose supplier"
                  searchPlaceholder="Search suppliers"
                  clearable
                  options={supplierOptions}
                />
              </Field>
              <Field label={STOCK_COUNT_COPY.supplierAmount}>
                <MoneyInput
                  value={supplierAmount}
                  onChange={(event) => setSupplierAmount(event.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </>
          ) : null}
        </div>

        <div className="mt-3 flex justify-end">
          <Button variant="primary" disabled={loading.saving} onClick={() => void save()}>
            {STOCK_COUNT_COPY.save}
          </Button>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-line bg-paper">
        <div className="shrink-0 border-b border-line px-3 py-2 text-[12px] font-semibold text-ink">
          {STOCK_COUNT_COPY.history}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {loading.history ? (
            <Table>
              <tbody>
                <TableRowsSkeleton columnCount={8} rows={5} />
              </tbody>
            </Table>
          ) : (
            <Table>
              <THead>
                <Th>Date</Th>
                <Th>Product</Th>
                <Th>Unit</Th>
                <Th className="num">Old</Th>
                <Th className="num">New</Th>
                <Th className="num">Diff</Th>
                <Th>Reason</Th>
                <Th>User</Th>
              </THead>
              <tbody>
                {history.length === 0 ? (
                  <EmptyRow cols={8} text={STOCK_COUNT_COPY.historyEmpty} />
                ) : (
                  history.map((row) => {
                    const oldQty = row.quantityBefore ?? null;
                    const newQty =
                      row.quantityAfter ?? (oldQty != null ? oldQty + row.quantity : null);
                    const diff = oldQty != null && newQty != null ? newQty - oldQty : row.quantity;
                    return (
                      <tr key={row.id}>
                        <Td>{formatTableDateTime(row.createdAt)}</Td>
                        <Td>{row.productName ?? row.productId}</Td>
                        <Td>{row.displayedUnitName ?? "—"}</Td>
                        <Td numeric>{oldQty == null ? "—" : formatStockQty(oldQty)}</Td>
                        <Td numeric>{newQty == null ? "—" : formatStockQty(newQty)}</Td>
                        <Td numeric>{formatDiff(diff)}</Td>
                        <Td>{row.notes || "—"}</Td>
                        <Td>{userNames[row.createdBy] ?? row.createdBy}</Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
