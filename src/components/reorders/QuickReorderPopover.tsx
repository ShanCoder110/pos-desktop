import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Field,
  SearchableSelect,
  TextInput,
  TruncatedTooltip,
  toaster,
} from "@/components/common";
import { productStockUnitId, quickReorderPrefill } from "@/pages/reorders/quickReorder";
import { REORDER_COPY } from "@/shared/constants/reorders";
import type { ProductLotRow, SupplierRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { createPurchaseOrder } from "@/services/purchasing";
import { money, shortError } from "@/utils/format";

export function QuickReorderPopover({
  product,
  lots,
  suppliers,
  onClose,
  onCreated,
}: {
  product: Product;
  lots: ProductLotRow[];
  suppliers: { id: string; name: string }[] | SupplierRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const prefill = useMemo(() => quickReorderPrefill(product, lots), [product, lots]);
  const [qty, setQty] = useState(String(prefill.quantity || ""));
  const [supplierId, setSupplierId] = useState(prefill.supplierId);
  const [saving, setSaving] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQty(String(prefill.quantity || ""));
    setSupplierId(prefill.supplierId);
    qtyRef.current?.focus();
    qtyRef.current?.select();
  }, [product.id, prefill.quantity, prefill.supplierId]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (panelRef.current?.contains(target)) return;
      if (target?.closest(".ui-combo-menu")) return;
      onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          "input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ].filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function submit() {
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toaster.error(REORDER_COPY.qtyRequired);
      qtyRef.current?.focus();
      return;
    }
    if (!supplierId) {
      toaster.error(REORDER_COPY.supplierRequired);
      return;
    }
    const unitId = productStockUnitId(product);
    if (!unitId) {
      toaster.error(REORDER_COPY.unitRequired);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await createPurchaseOrder({
        supplierId,
        items: [{ productId: product.id, unitId, quantity, unitCost: prefill.cost }],
      });
      toaster.success(REORDER_COPY.created);
      onCreated();
    } catch (error) {
      toaster.error(shortError(error, REORDER_COPY.createFailed));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-[calc(100%+6px)] z-30 w-[260px]"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          void submit();
        }
      }}
    >
      <div className="rounded-[10px] border border-line bg-paper p-2.5 shadow-[0_10px_28px_rgba(15,23,42,0.12)]">
        <TruncatedTooltip
          text={product.name}
          className="mb-2.5 text-[12px] font-semibold leading-tight text-ink"
        />
        <Field label={REORDER_COPY.qtyLabel}>
          <TextInput
            inputRef={qtyRef}
            inputMode="decimal"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
          />
        </Field>
        <Field label={REORDER_COPY.supplierLabel}>
          <SearchableSelect
            name="quick-reorder-supplier"
            value={supplierId}
            onChange={setSupplierId}
            placeholder={REORDER_COPY.supplierLabel}
            searchPlaceholder="Search suppliers"
            options={suppliers.map((row) => ({ value: row.id, label: row.name }))}
          />
        </Field>
        <p className="m-0 mb-2 text-[11px] text-muted">
          {REORDER_COPY.costLabel} {money(prefill.cost)}
          {prefill.fromLot ? ` · ${prefill.fromLot.lotNumber}` : ""}
        </p>
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onClose}>
            Esc
          </Button>
          <Button size="sm" variant="primary" disabled={saving} onClick={() => void submit()}>
            {saving ? "…" : REORDER_COPY.addAction}
          </Button>
        </div>
      </div>
    </div>
  );
}
