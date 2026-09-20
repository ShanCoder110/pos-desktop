import { useMemo, useState } from "react";
import { ArrowLeftRight, Info, Store } from "lucide-react";
import { Badge, Button, Checkbox, FormSection, TextInput } from "@/components/common";
import { rebalanceBranchQuantity, preciseStockQty } from "@/pages/products/branchStockUtils";
import { DetailQtyDisplay } from "@/pages/products/DetailQtyDisplay";
import { UnitQtyInput, UnitQtySwitch, useProductUnitQty } from "@/pages/products/UnitQtyField";
import {
  displayQtyFromStock,
  formatStockQty,
  productSellUnits,
  roundStockQty,
  signedStockQty,
  unitLabel,
} from "@/pages/products/productQty";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { LOT_COPY } from "@/shared/constants/products";
import type { Product } from "@/shared/types";
import { cn } from "@/utils/format";

export type LotBranchRow = {
  branchId: string;
  branchName: string;
  selected: boolean;
  quantity: number;
};

function sortedRows(rows: LotBranchRow[], sessionBranchId?: string) {
  return [...rows].sort((a, b) => {
    if (a.branchId === sessionBranchId) return -1;
    if (b.branchId === sessionBranchId) return 1;
    return a.branchName.localeCompare(b.branchName);
  });
}

export function LotBranchFields({
  rows,
  sessionBranchId,
  receivedQuantity,
  unitLabel: unitLabelText,
  product,
  mode = "receive",
  baselineQuantities,
  onChange,
}: {
  rows: LotBranchRow[];
  sessionBranchId?: string;
  receivedQuantity: number;
  unitLabel: string;
  product?: Product;
  mode?: "receive" | "rebalance";
  /** Starting branch qty when editing an existing lot (rebalance only). */
  baselineQuantities?: Record<string, number>;
  onChange: (rows: LotBranchRow[]) => void;
}) {
  const visible = useMemo(() => sortedRows(rows, sessionBranchId), [rows, sessionBranchId]);
  const [autoPull, setAutoPull] = useState(true);
  const { unitId, setUnitId, selectedUnit } = useProductUnitQty(product);
  const units = product ? productSellUnits(product) : [];
  const stockLabel = product ? unitLabel(product.unit) : unitLabelText;
  const allocated = roundStockQty(visible.reduce((sum, row) => sum + row.quantity, 0));
  const remaining = roundStockQty(receivedQuantity - allocated);
  const currentName =
    visible.find((row) => row.branchId === sessionBranchId)?.branchName ?? "current branch";
  const balanced = receivedQuantity <= 0 || Math.abs(remaining) < 1e-6;

  function maxForRow(branchId: string) {
    const other = visible
      .filter((row) => row.branchId !== branchId)
      .reduce((sum, row) => sum + row.quantity, 0);
    return Math.max(0, roundStockQty(receivedQuantity - other));
  }

  function patchRows(next: LotBranchRow[]) {
    onChange(
      next.map((row) => ({
        ...row,
        quantity: preciseStockQty(row.quantity),
        selected: row.quantity > 0,
      })),
    );
  }

  function setQuantity(branchId: string, raw: string) {
    const quantity = raw.trim() === "" ? 0 : Number(raw);
    if (!Number.isFinite(quantity) || quantity < 0) return;
    const next = roundStockQty(Math.min(quantity, maxForRow(branchId)));
    patchRows(rows.map((row) => (row.branchId === branchId ? { ...row, quantity: next } : row)));
  }

  function setStockQuantity(branchId: string, stockQty: number) {
    patchRows(rebalanceBranchQuantity(rows, branchId, stockQty, receivedQuantity, autoPull));
  }

  function formatDelta(stockDelta: number) {
    if (!stockDelta) return "";
    if (product && selectedUnit) {
      const inUnit = displayQtyFromStock(units, product.unit, selectedUnit, Math.abs(stockDelta));
      return signedStockQty(stockDelta > 0 ? inUnit : -inUnit);
    }
    return signedStockQty(stockDelta);
  }

  function QtyText({ qty }: { qty: number }) {
    if (product) {
      return <DetailQtyDisplay product={product} qty={qty} extraUnitId={unitId} />;
    }
    return (
      <span className="tabular-nums">
        {formatStockQty(qty)} {stockLabel}
      </span>
    );
  }

  function distributeEqually() {
    if (receivedQuantity <= 0 || !visible.length) return;

    const total = Math.floor(receivedQuantity);
    const count = visible.length;
    const each = Math.floor(total / count);
    const extra = total - each * count;
    const mainId =
      sessionBranchId && visible.some((row) => row.branchId === sessionBranchId)
        ? sessionBranchId
        : visible[0].branchId;

    patchRows(
      rows.map((row) => {
        const inSplit = visible.some((entry) => entry.branchId === row.branchId);
        if (!inSplit) return { ...row, quantity: 0 };
        const quantity = row.branchId === mainId ? each + extra : each;
        return { ...row, quantity };
      }),
    );
  }

  function giveRemainderToCurrent() {
    if (!sessionBranchId || remaining <= 0) return;
    patchRows(
      rows.map((row) =>
        row.branchId === sessionBranchId
          ? { ...row, quantity: roundStockQty(row.quantity + remaining) }
          : row,
      ),
    );
  }

  const isRebalance = mode === "rebalance";

  return (
    <FormSection
      title={isRebalance ? LOT_COPY.branchSplitTitle : "Allocate to branches"}
      icon={<Store size={14} />}
      action={
        <Button
          type="button"
          size="sm"
          variant="soft"
          icon={<ArrowLeftRight size={13} />}
          disabled={receivedQuantity <= 0}
          onClick={distributeEqually}
        >
          Distribute equally
        </Button>
      }
    >
      <p className="m-0 text-[11px] text-muted">
        {isRebalance ? LOT_COPY.branchSplitHint : "Split this lot across branches on receive."}{" "}
        {isRebalance ? LOT_COPY.branchSplitTotal : "Total lot"} <QtyText qty={receivedQuantity} />
        {!isRebalance ? " · pick a unit below, then enter qty per branch" : ""}
      </p>

      {product ? (
        <UnitQtySwitch product={product} unitId={unitId} onUnitIdChange={setUnitId} />
      ) : null}

      <div className="overflow-hidden rounded-[10px] border border-line">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-line bg-[var(--bg)] text-left text-[10px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Branch</th>
              <th className="px-3 py-2 text-right font-semibold">Allocate</th>
              <th className="px-3 py-2 text-right font-semibold">After</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.branchId} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2 text-ink">
                    <Store size={14} className="shrink-0 text-muted" aria-hidden />
                    <span className="truncate font-medium">{row.branchName}</span>
                    {row.branchId === sessionBranchId ? <Badge tone="ok">Current</Badge> : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end">
                    {product && unitId ? (
                      <UnitQtyInput
                        product={product}
                        unitId={unitId}
                        stockQty={row.quantity}
                        onStockQtyChange={(stockQty) => setStockQuantity(row.branchId, stockQty)}
                      />
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        <TextInput
                          className="lot-branch-qty-input !w-[88px] tabular-nums"
                          inputMode="decimal"
                          maxLength={FIELD_LIMITS.qty}
                          placeholder="0"
                          aria-label={`Quantity for ${row.branchName}`}
                          value={row.quantity > 0 ? String(row.quantity) : ""}
                          onChange={(event) => setQuantity(row.branchId, event.target.value)}
                        />
                        <span className="w-6 shrink-0 text-[11px] text-muted">{stockLabel}</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {(() => {
                    const baseline = baselineQuantities?.[row.branchId] ?? 0;
                    const delta = isRebalance ? row.quantity - baseline : 0;
                    const deltaLabel =
                      isRebalance && Math.abs(delta) > 1e-6 ? formatDelta(delta) : "";
                    return (
                      <div
                        className={cn("lot-branch-after text-muted", isRebalance && "has-delta")}
                      >
                        <QtyText qty={row.quantity} />
                        {isRebalance ? (
                          <span
                            className={cn(
                              "lot-branch-delta",
                              deltaLabel && (delta > 0 ? "is-up" : "is-down"),
                            )}
                          >
                            {deltaLabel || "\u00a0"}
                          </span>
                        ) : null}
                      </div>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
        <div className="rounded-lg border border-line bg-[var(--bg)] px-3 py-2">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">
            Allocated
          </span>
          <strong className="text-[13px] text-ink">
            <QtyText qty={allocated} />
          </strong>
        </div>
        <div className="rounded-lg border border-line bg-[var(--bg)] px-3 py-2">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">
            Remaining
          </span>
          <strong
            className={cn(
              "text-[13px] tabular-nums",
              remaining > 0
                ? "text-[var(--warn)]"
                : remaining < 0
                  ? "text-[var(--danger)]"
                  : "text-ink",
            )}
          >
            <QtyText qty={Math.abs(remaining)} />
            {remaining < 0 ? " over" : ""}
          </strong>
        </div>
        {remaining > 0 && sessionBranchId ? (
          <Button type="button" size="sm" variant="soft" onClick={giveRemainderToCurrent}>
            Put leftover on {currentName}
          </Button>
        ) : null}
      </div>

      {visible.length > 1 ? (
        <label className="lot-branch-auto-pull m-0 flex cursor-pointer items-start gap-2.5 text-[11px] leading-snug text-muted">
          <Checkbox checked={autoPull} onChange={(event) => setAutoPull(event.target.checked)} />
          <span>
            <strong className="block font-semibold text-ink">{LOT_COPY.branchSplitAutoPull}</strong>
            {LOT_COPY.branchSplitAutoPullHint}
          </span>
        </label>
      ) : null}

      {!balanced && remaining > 0 && !autoPull ? (
        <p className="m-0 inline-flex items-start gap-1.5 text-[11px] leading-snug text-muted">
          <Info size={13} className="mt-0.5 shrink-0 text-accent-deep" aria-hidden />
          Leftover quantity can go to {currentName}. Distribute equally uses whole numbers;{" "}
          {currentName} gets any extra (e.g. 13 → 7 + 6, not 6.5).
        </p>
      ) : null}
    </FormSection>
  );
}
