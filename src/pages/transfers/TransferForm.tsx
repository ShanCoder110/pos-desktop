import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Layers, MessageSquare, Package, Store } from "lucide-react";
import {
  Button,
  Checkbox,
  Field,
  FormSection,
  ProductSearch,
  SelectInput,
  TextArea,
  toaster,
} from "@/components/common";
import { DetailQtyDisplay } from "@/pages/products/DetailQtyDisplay";
import { UnitQtyInput, UnitQtySwitch, useProductUnitQty } from "@/pages/products/UnitQtyField";
import { formatStockQty, roundStockQty, unitLabel } from "@/pages/products/productQty";
import { TRANSFER_COPY } from "@/shared/constants/products";
import type { ProductLotRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { ensureSession } from "@/services/auth";
import type { BranchResponse } from "@/services/org";
import { createTransfer, receiveTransfer, sendTransfer } from "@/services/transfers";
import { shortError } from "@/utils/format";

export const TRANSFER_FORM_ID = "transfer-form";

type TransferLine = {
  lotId: string;
  selected: boolean;
  quantity: number;
};

function lotBranchQty(lot: ProductLotRow, branchId: string) {
  if (!branchId) return 0;
  const row = lot.branchAllocations?.find((entry) => entry.branchId === branchId);
  return row?.quantity ?? 0;
}

function TransferLotTable({
  product,
  unitId,
  rows,
  lines,
  onPatch,
}: {
  product: Product;
  unitId: string;
  rows: { lot: ProductLotRow; available: number }[];
  lines: TransferLine[];
  onPatch: (lotId: string, patch: Partial<TransferLine>) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-line bg-[var(--bg)] text-left text-[10px] font-semibold uppercase tracking-wide text-sub">
            <th className="px-3 py-2.5 font-semibold">Lot</th>
            <th className="px-3 py-2.5 text-right font-semibold">Available</th>
            <th className="px-3 py-2.5 text-right font-semibold">Transfer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ lot, available }) => {
            const line = lines.find((row) => row.lotId === lot.id);
            const selected = line?.selected ?? false;
            const qty = line?.quantity ?? 0;
            return (
              <tr key={lot.id} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2.5">
                  <label className="flex min-w-0 items-center gap-2 font-medium text-ink">
                    <Checkbox
                      checked={selected}
                      aria-label={`Transfer lot ${lot.lotNumber}`}
                      onChange={(event) =>
                        onPatch(lot.id, {
                          selected: event.target.checked,
                          quantity: event.target.checked ? available : 0,
                        })
                      }
                    />
                    <span className="truncate">{lot.lotNumber}</span>
                  </label>
                </td>
                <td className="px-3 py-2.5 text-right text-muted">
                  <DetailQtyDisplay product={product} qty={available} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end">
                    <UnitQtyInput
                      product={product}
                      unitId={unitId}
                      stockQty={qty}
                      disabled={!selected}
                      onStockQtyChange={(stockQty) =>
                        onPatch(lot.id, {
                          quantity: Math.min(stockQty, available),
                          selected: stockQty > 0,
                        })
                      }
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TransferForm({
  products,
  lots,
  branches,
  initialProductId,
  initialLotId,
  onClose,
  onSaved,
  onSavingChange,
}: {
  products: Product[];
  lots: ProductLotRow[];
  branches: BranchResponse[];
  initialProductId?: string;
  initialLotId?: string;
  onClose: () => void;
  onSaved: () => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [productId, setProductId] = useState(initialProductId ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const product = products.find((row) => row.id === productId);
  const { unitId, setUnitId } = useProductUnitQty(product);
  const stockUnit = product ? unitLabel(product.unit) : "unit";
  const activeBranches = branches.filter((row) => row.isActive);
  const fromBranchName = activeBranches.find((row) => row.id === fromBranchId)?.name;

  const productLots = useMemo(() => {
    if (!productId || !fromBranchId) return [];
    return lots
      .filter((lot) => lot.productId === productId && lot.remainingQuantity > 0)
      .map((lot) => ({
        lot,
        available: lotBranchQty(lot, fromBranchId),
      }))
      .filter((row) => row.available > 0)
      .sort((a, b) => b.lot.receivedAt.localeCompare(a.lot.receivedAt));
  }, [lots, productId, fromBranchId]);

  const selectedTotal = roundStockQty(
    lines
      .filter((row) => row.selected && row.quantity > 0)
      .reduce((sum, row) => sum + row.quantity, 0),
  );

  const lotsEmptyMessage = !fromBranchId
    ? TRANSFER_COPY.pickFromBranch
    : !productId
      ? TRANSFER_COPY.pickProduct
      : TRANSFER_COPY.noLots;

  useEffect(() => {
    const controller = new AbortController();
    void ensureSession(controller.signal)
      .then((session) => {
        const focus = session?.branchId ?? activeBranches[0]?.id ?? "";
        setFromBranchId((current) => current || focus);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [activeBranches]);

  useEffect(() => {
    setLines((current) => {
      const prior = new Map(current.map((row) => [row.lotId, row]));
      return productLots.map(({ lot, available }) => {
        const existing = prior.get(lot.id);
        if (existing) return existing;
        const preselect = Boolean(initialLotId && lot.id === initialLotId);
        return {
          lotId: lot.id,
          selected: preselect,
          quantity: preselect ? available : 0,
        };
      });
    });
  }, [productLots, initialLotId]);

  function patchLine(lotId: string, patch: Partial<TransferLine>) {
    setLines((current) => current.map((row) => (row.lotId === lotId ? { ...row, ...patch } : row)));
  }

  async function save() {
    setError(null);
    if (!fromBranchId) {
      setError(TRANSFER_COPY.fromRequired);
      return;
    }
    if (!toBranchId) {
      setError(TRANSFER_COPY.toRequired);
      return;
    }
    if (fromBranchId === toBranchId) {
      setError(TRANSFER_COPY.sameBranch);
      return;
    }
    if (!productId) {
      setError(TRANSFER_COPY.productRequired);
      return;
    }

    const items = lines
      .filter((row) => row.selected && row.quantity > 0)
      .map((row) => {
        const lot = productLots.find((entry) => entry.lot.id === row.lotId)?.lot;
        const max = lot ? lotBranchQty(lot, fromBranchId) : 0;
        const quantity = roundStockQty(Math.min(row.quantity, max));
        return {
          productId,
          productLotId: row.lotId,
          quantity,
        };
      })
      .filter((row) => row.quantity > 0);

    if (!items.length) {
      setError(TRANSFER_COPY.lotRequired);
      return;
    }

    setSaving(true);
    onSavingChange?.(true);
    try {
      const created = await createTransfer({
        fromBranchId,
        toBranchId,
        notes: notes.trim() || null,
        items,
      });
      await sendTransfer(created.id);
      await receiveTransfer(created.id);
      toaster.success(TRANSFER_COPY.created);
      onSaved();
      onClose();
    } catch (err) {
      toaster.error(shortError(err, TRANSFER_COPY.saveFailed));
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  return (
    <form
      id={TRANSFER_FORM_ID}
      className="transfer-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="transfer-form-pane">
        <FormSection title={TRANSFER_COPY.routeTitle} icon={<Store size={14} />}>
          <div className="transfer-route">
            <Field label={TRANSFER_COPY.fromLabel}>
              <SelectInput
                value={fromBranchId}
                onChange={(event) => setFromBranchId(event.target.value)}
              >
                <option value="">Select branch</option>
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <span className="transfer-route-arrow" aria-hidden>
              <ArrowLeftRight size={16} />
            </span>
            <Field label={TRANSFER_COPY.toLabel}>
              <SelectInput
                value={toBranchId}
                onChange={(event) => setToBranchId(event.target.value)}
              >
                <option value="">Select branch</option>
                {activeBranches
                  .filter((branch) => branch.id !== fromBranchId)
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
              </SelectInput>
            </Field>
          </div>
        </FormSection>

        <FormSection title={TRANSFER_COPY.productSectionTitle} icon={<Package size={14} />}>
          {product ? (
            <div className="transfer-product-picked">
              <span className="transfer-product-picked-icon">
                <Package size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <strong>{product.name}</strong>
                <span>{product.sku}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="soft"
                onClick={() => {
                  setProductId("");
                  setLines([]);
                  setError(null);
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <ProductSearch
              products={products}
              value={productId}
              onChange={(next) => {
                setProductId(next?.id ?? "");
                setError(null);
              }}
              autoFocus
              invalid={error === TRANSFER_COPY.productRequired}
            />
          )}
          {error === TRANSFER_COPY.productRequired ? (
            <p className="transfer-form-error">{error}</p>
          ) : null}
        </FormSection>

        <FormSection
          title={TRANSFER_COPY.lotsTitle}
          icon={<Layers size={14} />}
          action={
            selectedTotal > 0 && product ? (
              <span className="transfer-lot-total">
                <DetailQtyDisplay product={product} qty={selectedTotal} />
              </span>
            ) : selectedTotal > 0 ? (
              <span className="transfer-lot-total tabular-nums">
                {formatStockQty(selectedTotal)} {stockUnit}
              </span>
            ) : null
          }
        >
          {productLots.length > 0 && product ? (
            <>
              <p className="transfer-section-hint">
                {fromBranchName ? TRANSFER_COPY.lotsHint(fromBranchName) : TRANSFER_COPY.lotHint}
              </p>
              <UnitQtySwitch product={product} unitId={unitId} onUnitIdChange={setUnitId} />
              <TransferLotTable
                product={product}
                unitId={unitId}
                rows={productLots}
                lines={lines}
                onPatch={patchLine}
              />
            </>
          ) : (
            <p className="transfer-empty">{lotsEmptyMessage}</p>
          )}
        </FormSection>

        <FormSection title={TRANSFER_COPY.notesLabel} icon={<MessageSquare size={14} />}>
          <TextArea
            placeholder={TRANSFER_COPY.notesPlaceholder}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
          />
        </FormSection>

        {error && error !== TRANSFER_COPY.productRequired ? (
          <p className="transfer-form-error">{error}</p>
        ) : null}
      </div>
    </form>
  );
}
