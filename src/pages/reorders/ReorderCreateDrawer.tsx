import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Drawer,
  Field,
  SearchableSelect,
  TextInput,
  UnitSegmentedControl,
  toaster,
} from "@/components/common";
import {
  inventoryPerSellUnit,
  priceFromStock,
  productSellUnits,
} from "@/pages/products/productQty";
import { productStockUnitId, quickReorderPrefill } from "@/pages/reorders/quickReorder";
import { reorderLineBaseTotals } from "@/pages/reorders/reorderUnits";
import { REORDER_COPY } from "@/shared/constants/reorders";
import type { ProductLotRow, SupplierRow } from "@/shared/domain/types";
import type { Product } from "@/shared/types";
import { createPurchaseOrder } from "@/services/purchasing";
import { money, shortError } from "@/utils/format";
import {
  convertDisplayedUnit,
  defaultTransactionUnit,
  stockToDisplayedQuantity,
} from "@/utils/unitConversion";

export function ReorderCreateDrawer({
  open,
  products,
  lots,
  suppliers,
  initialProductId,
  onClose,
  onCreated,
}: {
  open: boolean;
  products: Product[];
  lots: ProductLotRow[];
  suppliers: { id: string; name: string }[] | SupplierRow[];
  initialProductId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [productId, setProductId] = useState(initialProductId ?? "");
  const product = products.find((row) => row.id === productId) ?? null;
  const units = useMemo(() => {
    if (!product) return [];
    return productSellUnits(product).filter(
      (unit) => unit.id && !unit.id.endsWith("-u") && !unit.id.endsWith("-pack"),
    );
  }, [product]);
  const prefill = useMemo(
    () => (product ? quickReorderPrefill(product, lots) : null),
    [product, lots],
  );
  const [unitId, setUnitId] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProductId(initialProductId ?? "");
  }, [open, initialProductId]);

  useEffect(() => {
    if (!product || !prefill) {
      setUnitId("");
      setQty("");
      setCost("");
      setSupplierId("");
      return;
    }
    const nextUnit = defaultTransactionUnit(product, units);
    const id = nextUnit?.id ?? productStockUnitId(product);
    setUnitId(id);
    setQty(String(nextUnit ? stockToDisplayedQuantity(nextUnit, prefill.quantity) || "" : ""));
    setCost(
      String(
        nextUnit ? priceFromStock(units, product.unit, prefill.cost, nextUnit) : prefill.cost || "",
      ),
    );
    setSupplierId(prefill.supplierId);
  }, [product, units, prefill]);

  const selectedUnit = units.find((unit) => unit.id === unitId);
  const displayedQty = Number(qty);
  const unitCost = Number(cost);
  const basePreview =
    selectedUnit && Number.isFinite(displayedQty) && Number.isFinite(unitCost)
      ? reorderLineBaseTotals(selectedUnit, displayedQty, unitCost)
      : null;

  function changeUnit(nextUnitId: string) {
    const nextUnit = units.find((unit) => unit.id === nextUnitId);
    if (!nextUnit || !product) return;
    const currentUnit = units.find((unit) => unit.id === unitId);
    const currentQty = Number(qty);
    const currentCost = Number(cost);
    setUnitId(nextUnitId);
    if (currentUnit && Number.isFinite(currentQty)) {
      setQty(String(convertDisplayedUnit(currentUnit, nextUnit, currentQty)));
    }
    if (currentUnit && Number.isFinite(currentCost) && currentCost > 0) {
      const stockCost = currentCost / inventoryPerSellUnit(currentUnit);
      setCost(String(priceFromStock(units, product.unit, stockCost, nextUnit)));
    }
  }

  async function submit() {
    if (!product) {
      toaster.error("Select a product");
      return;
    }
    if (!Number.isFinite(displayedQty) || displayedQty <= 0) {
      toaster.error(REORDER_COPY.qtyRequired);
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toaster.error("Enter a unit cost");
      return;
    }
    if (!supplierId) {
      toaster.error(REORDER_COPY.supplierRequired);
      return;
    }
    if (!unitId) {
      toaster.error(REORDER_COPY.unitRequired);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await createPurchaseOrder({
        supplierId,
        items: [
          {
            productId: product.id,
            unitId,
            quantity: displayedQty,
            unitCost,
          },
        ],
      });
      toaster.success(REORDER_COPY.created);
      onCreated();
      onClose();
    } catch (error) {
      toaster.error(shortError(error, REORDER_COPY.createFailed));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      size="md"
      title={REORDER_COPY.createAction}
      subtitle={
        <p className="ui-drawer-subtitle">Pick unit per line — qty and cost save in base</p>
      }
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : REORDER_COPY.createAction}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-1">
        <Field label="Product">
          <SearchableSelect
            name="reorder-create-product"
            value={productId}
            onChange={setProductId}
            placeholder="Search products"
            searchPlaceholder="Search products"
            options={products.map((row) => ({
              value: row.id,
              label: `${row.name}${row.sku ? ` · ${row.sku}` : ""}`,
            }))}
          />
        </Field>
        {units.length ? (
          <Field label="Unit">
            <UnitSegmentedControl
              units={units.map((unit) => ({
                id: unit.id,
                label: unit.name || unit.symbol || "Unit",
                meta: inventoryPerSellUnit(unit) > 1 ? `×${inventoryPerSellUnit(unit)}` : undefined,
              }))}
              value={unitId}
              onChange={changeUnit}
            />
          </Field>
        ) : null}
        <Field label={REORDER_COPY.qtyLabel}>
          <TextInput
            inputMode="decimal"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
          />
        </Field>
        <Field label={`${REORDER_COPY.costLabel} / unit`}>
          <TextInput
            inputMode="decimal"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </Field>
        <Field label={REORDER_COPY.supplierLabel}>
          <SearchableSelect
            name="reorder-create-supplier"
            value={supplierId}
            onChange={setSupplierId}
            placeholder={REORDER_COPY.supplierLabel}
            searchPlaceholder="Search suppliers"
            options={suppliers.map((row) => ({ value: row.id, label: row.name }))}
          />
        </Field>
        {basePreview && selectedUnit ? (
          <p className="m-0 rounded-md border border-line bg-canvas px-3 py-2 text-[12px] text-muted">
            Saves as <strong className="text-ink">{basePreview.baseQty} base</strong> @{" "}
            <strong className="text-ink">{money(basePreview.costPerBase)}</strong>/base
            {" · "}
            line {money(basePreview.lineTotal)}
            {selectedUnit.name ? ` (${displayedQty} ${selectedUnit.name})` : ""}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
