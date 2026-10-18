import { useMemo, useState } from "react";
import { MessageSquarePlus, PackagePlus, Trash2 } from "lucide-react";
import {
  Button,
  Field,
  ProductSearch,
  Table,
  Td,
  TextArea,
  TextInput,
  THead,
  Th,
  UnitSegmentedControl,
  toaster,
} from "@/components/common";
import type { ProductLotRow } from "@/shared/domain/types";
import type { Product, ProductSellUnit } from "@/shared/types";
import {
  formatStockQty,
  productSellUnits,
  roundMoney,
  roundStockQty,
  toBaseQty,
} from "@/pages/products/productQty";
import { createTransfer, receiveTransfer, sendTransfer } from "@/services/transfers";
import { limitMoneyDraft, money, shortError } from "@/utils/format";
import {
  availableWholeQty,
  hasCompleteSellUnit,
  parseWholeQtyDraft,
  wholeQty,
} from "@/utils/salePricing";
import { stockToDisplayedQuantity } from "@/utils/unitConversion";
import { encodeRepairTransfer, type RepairTransferLineMeta } from "./repairShopTransfer";

type DraftRow = {
  id: string;
  productId: string;
  name: string;
  unitId: string;
  unitName: string;
  quantity: number;
  quantityDraft: string;
  unitPrice: number;
  priceDraft: string;
};

function branchQty(lot: ProductLotRow, branchId: string) {
  return lot.branchAllocations?.find((row) => row.branchId === branchId)?.quantity ?? 0;
}

function unitFor(product: Product, unitId: string) {
  const units = productSellUnits(product);
  return (
    units.find((unit) => unit.id === unitId) ?? units.find((unit) => unit.isDefault) ?? units[0]
  );
}

/**
 * Credit-sale-style composer: search products, set qty/price, save to the repair shop.
 * Stock still leaves the till branch (FIFO) so the shop can show held inventory — no transfer UI.
 */
export function RepairStockComposer({
  sourceBranchId,
  repairBranchId,
  repairBranchName,
  products,
  lots,
  onSaved,
}: {
  sourceBranchId: string;
  repairBranchId: string;
  repairBranchName: string;
  products: Product[];
  lots: ProductLotRow[];
  onSaved: () => Promise<void> | void;
}) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [searchKey, setSearchKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const availableBase = useMemo(() => {
    const totals = new Map<string, number>();
    lots.forEach((lot) => {
      const qty = branchQty(lot, sourceBranchId);
      if (qty > 0) totals.set(lot.productId, (totals.get(lot.productId) ?? 0) + qty);
    });
    return totals;
  }, [lots, sourceBranchId]);

  const searchableProducts = useMemo(
    () =>
      products
        .filter((product) => product.isActive !== false)
        .map((product) => ({ ...product, stock: availableBase.get(product.id) ?? 0 })),
    [availableBase, products],
  );

  function stockLeft(productId: string) {
    return availableBase.get(productId) ?? 0;
  }

  function addProduct(product: Product | null) {
    if (!product) return;
    if (rows.some((row) => row.productId === product.id)) {
      toaster.warn(`${product.name} is already in the table`);
      setSearchKey((key) => key + 1);
      return;
    }
    const units = productSellUnits(product);
    const available = stockLeft(product.id);
    if (available <= 0) {
      setError(`${product.name} is out of stock.`);
      return;
    }
    const preferred = units.find((row) => row.isDefault) ?? units[0];
    const unit =
      preferred && hasCompleteSellUnit(preferred, available)
        ? preferred
        : units.find((row) => hasCompleteSellUnit(row, available));
    if (!unit) {
      setError(`${product.name} is out of stock.`);
      return;
    }
    const unitPrice = Math.max(unit.price, unit.min);
    setError("");
    setRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        productId: product.id,
        name: product.name,
        unitId: unit.id,
        unitName: unit.name || product.unit,
        quantity: 1,
        quantityDraft: "1",
        unitPrice,
        priceDraft: String(unitPrice),
      },
    ]);
    setSearchKey((key) => key + 1);
  }

  function patchRow(id: string, patch: Partial<DraftRow>) {
    setError("");
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function changeLineUnit(row: DraftRow, unitId: string) {
    const product = products.find((item) => item.id === row.productId);
    if (!product) return;
    const next = unitFor(product, unitId);
    if (!next) return;
    const left = stockLeft(product.id);
    if (!hasCompleteSellUnit(next, left)) {
      setError(
        `${next.name || product.unit} needs more than ${formatStockQty(left)} ${product.unit} available.`,
      );
      return;
    }
    const units = productSellUnits(product);
    const current = unitFor(product, row.unitId);
    const baseQty = current ? toBaseQty(units, current, row.quantity) : row.quantity;
    const maxQty = availableWholeQty(next, left);
    let quantity = wholeQty(stockToDisplayedQuantity(next, baseQty));
    if (quantity > maxQty) quantity = maxQty;
    if (quantity <= 0) quantity = Math.min(1, maxQty);
    const unitPrice = Math.max(next.price, next.min);
    patchRow(row.id, {
      unitId,
      unitName: next.name || product.unit,
      quantity,
      quantityDraft: String(quantity),
      unitPrice,
      priceDraft: String(unitPrice),
    });
  }

  function commitQuantity(row: DraftRow) {
    const product = products.find((item) => item.id === row.productId);
    const unit = product ? unitFor(product, row.unitId) : undefined;
    if (!product || !unit) return;
    const maxQty = availableWholeQty(unit, stockLeft(product.id));
    let quantity = wholeQty(Number(row.quantityDraft)) || 1;
    if (quantity > maxQty) {
      quantity = maxQty;
      setError(
        maxQty > 0
          ? `Only ${maxQty} ${unit.name || product.unit} of ${row.name} left.`
          : `${row.name} is out of stock.`,
      );
    }
    patchRow(row.id, {
      quantity: quantity > 0 ? quantity : 1,
      quantityDraft: String(quantity > 0 ? quantity : 1),
    });
  }

  function commitPrice(row: DraftRow) {
    const product = products.find((item) => item.id === row.productId);
    const unit = product ? unitFor(product, row.unitId) : undefined;
    if (!unit) return;
    const raw = Number(row.priceDraft);
    let unitPrice = Number.isFinite(raw) && raw >= 0 ? raw : unit.min;
    if (unitPrice < unit.min) {
      unitPrice = unit.min;
      setError(`${row.name} price cannot be below ${money(unit.min)}.`);
    }
    patchRow(row.id, { unitPrice, priceDraft: String(unitPrice) });
  }

  const summary = rows.reduce(
    (sum, row) => {
      const product = products.find((item) => item.id === row.productId);
      const unit = product ? unitFor(product, row.unitId) : undefined;
      if (!unit) return sum;
      sum.cost += row.quantity * unit.cost;
      sum.value += row.quantity * row.unitPrice;
      sum.qty += row.quantity;
      return sum;
    },
    { cost: 0, value: 0, qty: 0 },
  );

  async function save() {
    const metadata: RepairTransferLineMeta[] = [];
    const items: { productId: string; productLotId: string; quantity: number }[] = [];

    for (const row of rows) {
      const product = products.find((item) => item.id === row.productId);
      const unit = product ? unitFor(product, row.unitId) : undefined;
      if (!product || !unit) continue;
      if (!Number.isFinite(row.unitPrice) || row.unitPrice < unit.min) {
        setError(`${product.name} price cannot be below ${money(unit.min)}.`);
        return;
      }
      const available = stockLeft(product.id);
      const maxQty = availableWholeQty(unit, available);
      const displayQty = wholeQty(row.quantity);
      if (displayQty <= 0) {
        setError(`Enter a whole-number quantity for ${product.name}`);
        return;
      }
      if (displayQty > maxQty) {
        setError(
          maxQty > 0
            ? `Only ${maxQty} ${unit.name || product.unit} of ${product.name} is available`
            : `${product.name} is out of stock.`,
        );
        return;
      }
      const baseQuantity = roundStockQty(toBaseQty(productSellUnits(product), unit, displayQty));
      if (baseQuantity > available + 1e-6) {
        setError(
          `Only ${formatStockQty(available)} ${product.unit} of ${product.name} is available`,
        );
        return;
      }

      let remaining = baseQuantity;
      const fifoLots = lots
        .filter((lot) => lot.productId === product.id && branchQty(lot, sourceBranchId) > 0)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
      for (const lot of fifoLots) {
        const take = roundStockQty(Math.min(remaining, branchQty(lot, sourceBranchId)));
        if (take > 0) items.push({ productId: product.id, productLotId: lot.id, quantity: take });
        remaining = roundStockQty(remaining - take);
        if (remaining <= 0) break;
      }
      metadata.push({
        productId: product.id,
        unitId: unit.id,
        unitName: unit.name || product.unit,
        quantity: displayQty,
        baseQuantity,
        unitPrice: row.unitPrice,
        unitCost: unit.cost,
      });
    }

    if (!items.length) {
      setError("Add at least one product.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const noteBits = [encodeRepairTransfer(metadata), notes.trim()].filter(Boolean);
      const created = await createTransfer({
        fromBranchId: sourceBranchId,
        toBranchId: repairBranchId,
        notes: noteBits.join("\n"),
        items,
      });
      await sendTransfer(created.id);
      await receiveTransfer(created.id);
      toaster.success(`Products added to ${repairBranchName}`);
      setRows([]);
      setNotes("");
      setShowNotes(false);
      await onSaved();
    } catch (err) {
      setError(shortError(err, "Could not add products to repair shop"));
      toaster.error(shortError(err, "Could not add products to repair shop"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-2.5">
      <div className="grid gap-2 rounded-xl border border-line bg-paper p-2.5">
        <Field label="Add product">
          <ProductSearch
            key={searchKey}
            products={searchableProducts}
            value=""
            onChange={addProduct}
            placeholder="Search product ID, name, SKU, or barcode"
            autoFocus
            clearable
            showInventory
            showPrice
            blockOutOfStock
            invalid={Boolean(error && !rows.length)}
          />
        </Field>
        <p className="m-0 text-[10px] text-muted">
          Select a result to add it immediately, then adjust unit, quantity, and expected price —
          same as a credit sale.
        </p>
      </div>

      {rows.length ? (
        <Table>
          <THead>
            <tr>
              <Th>Product</Th>
              <Th>Unit</Th>
              <Th>Qty</Th>
              <Th>Price</Th>
              <Th>Total</Th>
              <Th />
            </tr>
          </THead>
          <tbody>
            {rows.map((row) => {
              const product = products.find((item) => item.id === row.productId);
              if (!product) return null;
              const units = productSellUnits(product);
              const unit = unitFor(product, row.unitId);
              const left = stockLeft(product.id);
              const maxQty = unit ? availableWholeQty(unit, left) : 0;
              const minPrice = unit?.min ?? 0;
              return (
                <tr key={row.id}>
                  <Td>
                    <strong className="block text-[12px] text-ink">{row.name}</strong>
                    <small className="text-[10px] text-muted">
                      {product.sku}
                      {maxQty > 0
                        ? ` · ${maxQty} ${unit?.name || product.unit} left`
                        : " · out of stock"}
                    </small>
                  </Td>
                  <Td>
                    {units.length > 1 ? (
                      <UnitSegmentedControl
                        units={units.map((item: ProductSellUnit) => ({
                          id: item.id,
                          label: item.name,
                          disabled: !hasCompleteSellUnit(item, left),
                        }))}
                        value={row.unitId}
                        onChange={(unitId) => changeLineUnit(row, unitId)}
                        ariaLabel={`Unit for ${row.name}`}
                        className="min-w-[120px]"
                        compact
                      />
                    ) : (
                      <span className="text-[11px] font-medium text-sub">{row.unitName}</span>
                    )}
                  </Td>
                  <Td>
                    <TextInput
                      inputMode="numeric"
                      aria-label={`Quantity for ${row.name}`}
                      value={row.quantityDraft}
                      onChange={(event) => {
                        const value = parseWholeQtyDraft(event.target.value);
                        const quantity = wholeQty(Number(value));
                        if (!value) {
                          patchRow(row.id, { quantityDraft: "" });
                          return;
                        }
                        const capped = Math.min(quantity, maxQty);
                        if (quantity > maxQty) {
                          setError(
                            maxQty > 0
                              ? `Only ${maxQty} ${unit?.name || product.unit} of ${row.name} left.`
                              : `${row.name} is out of stock.`,
                          );
                        }
                        patchRow(row.id, {
                          quantityDraft: String(capped > 0 ? capped : quantity),
                          quantity: capped > 0 ? capped : quantity,
                        });
                      }}
                      onBlur={() => commitQuantity(row)}
                    />
                  </Td>
                  <Td>
                    <TextInput
                      inputMode="decimal"
                      aria-label={`Price for ${row.name}`}
                      value={row.priceDraft}
                      onChange={(event) => {
                        const value = limitMoneyDraft(event.target.value);
                        const price = Number(value);
                        patchRow(row.id, {
                          priceDraft: value,
                          ...(Number.isFinite(price) && price >= minPrice
                            ? { unitPrice: price }
                            : {}),
                        });
                      }}
                      onBlur={() => commitPrice(row)}
                    />
                  </Td>
                  <Td numeric>
                    <strong>{money(roundMoney(row.quantity * row.unitPrice))}</strong>
                  </Td>
                  <Td>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${row.name}`}
                      onClick={() =>
                        setRows((current) => current.filter((item) => item.id !== row.id))
                      }
                    >
                      <Trash2 size={14} />
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <div className="grid min-h-16 place-items-center rounded-xl border border-dashed border-line bg-bg/40 py-3 text-center">
          <div>
            <PackagePlus className="mx-auto mb-1 text-muted" size={20} />
            <p className="m-0 text-[12px] font-semibold text-sub">No products added</p>
            <small className="text-[10px] text-muted">Search above to build the list</small>
          </div>
        </div>
      )}

      {showNotes ? (
        <Field label="Note">
          <TextArea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional note"
            autoFocus
          />
        </Field>
      ) : (
        <div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={<MessageSquarePlus size={14} />}
            onClick={() => setShowNotes(true)}
          >
            Add note
          </Button>
        </div>
      )}

      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
        <div className="grid grid-cols-3 gap-5 text-[10px]">
          <span className="text-muted">
            This add <strong className="block text-[12px] text-ink">{money(summary.value)}</strong>
            <small className="block text-[9px] text-muted">
              {rows.length} product{rows.length === 1 ? "" : "s"} · {wholeQty(summary.qty)} qty
            </small>
          </span>
          <span className="text-muted">
            Cost <strong className="block text-[12px] text-ink">{money(summary.cost)}</strong>
          </span>
          <span className="text-muted">
            Profit{" "}
            <strong className="block text-[12px] text-accent-deep">
              {money(summary.value - summary.cost)}
            </strong>
          </span>
        </div>
        <Button
          variant="primary"
          icon={<PackagePlus size={14} />}
          disabled={saving || !rows.length}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : `Add to ${repairBranchName}`}
        </Button>
      </div>
      {error ? <p className="m-0 text-[12px] text-[var(--danger)]">{error}</p> : null}
    </section>
  );
}
