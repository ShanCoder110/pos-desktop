import { useEffect, useMemo, useState } from "react";
import { Button, Field, SelectInput, TextInput, toaster } from "@/components/common";
import type { ChangeEvent } from "react";
import type { InvoiceRow, ItemCondition } from "@/shared/domain/types";
import { money } from "@/utils/format";
import { listReturns, postReturn } from "@/services/credit";

type LineDraft = {
  invoiceItemId: string;
  productName: string;
  soldQty: number;
  unitPrice: number;
  alreadyReturned: number;
  returnQty: string;
  condition: ItemCondition;
};

const CONDITIONS: { value: ItemCondition; label: string }[] = [
  { value: "GOOD", label: "Good (restock)" },
  { value: "DAMAGED", label: "Damaged (no sellable restock)" },
];

export function InvoiceReturnPanel({
  invoice,
  onSuccess,
}: {
  invoice: InvoiceRow;
  onSuccess?: () => void;
}) {
  const [reason, setReason] = useState("Customer return");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listReturns({ invoiceId: invoice.id, perPage: 100 }, controller.signal)
      .then((response) => {
        const returnedByItem = new Map<string, number>();
        for (const row of response.data) {
          for (const item of row.items ?? []) {
            const key = item.invoiceItemId;
            returnedByItem.set(key, (returnedByItem.get(key) ?? 0) + item.displayedQuantity);
          }
        }
        setLines(
          invoice.items.map((item) => ({
            invoiceItemId: item.id,
            productName: item.productName ?? item.productId,
            soldQty: item.quantity,
            unitPrice: item.unitPrice,
            alreadyReturned: returnedByItem.get(item.id) ?? 0,
            returnQty: "",
            condition: "GOOD",
          })),
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLines(
          invoice.items.map((item) => ({
            invoiceItemId: item.id,
            productName: item.productName ?? item.productId,
            soldQty: item.quantity,
            unitPrice: item.unitPrice,
            alreadyReturned: 0,
            returnQty: "",
            condition: "GOOD",
          })),
        );
      });
    return () => controller.abort();
  }, [invoice, reload]);

  const itemsToSubmit = useMemo(() => {
    return lines
      .map((line) => {
        const qty = Number(line.returnQty);
        if (!Number.isFinite(qty) || qty <= 0) return null;
        const max = line.soldQty - line.alreadyReturned;
        if (qty > max + 0.0001) return { error: `${line.productName}: max ${max}` as const };
        return {
          invoiceItemId: line.invoiceItemId,
          quantity: qty,
          condition: line.condition,
          refundAmount: +(qty * line.unitPrice).toFixed(2),
        };
      })
      .filter(Boolean);
  }, [lines]);

  const hasError = itemsToSubmit.some((row) => row && "error" in row);
  const payloadItems = itemsToSubmit.filter(
    (row): row is Exclude<typeof row, null | { error: string }> =>
      Boolean(row && !("error" in row)),
  );

  async function submit() {
    if (!payloadItems.length) {
      toaster.warn("Enter a return quantity for at least one line");
      return;
    }
    if (hasError) {
      toaster.error("Return quantity exceeds what is still available on this invoice");
      return;
    }
    setLoading(true);
    try {
      await postReturn({
        invoiceId: invoice.id,
        returnType: "REFUND",
        reason: reason.trim() || "Return",
        items: payloadItems,
      });
      toaster.success("Return recorded");
      setLines((prev) =>
        prev.map((line) => {
          const submitted = payloadItems.find((item) => item.invoiceItemId === line.invoiceItemId);
          if (!submitted) return line;
          return {
            ...line,
            alreadyReturned: line.alreadyReturned + submitted.quantity,
            returnQty: "",
          };
        }),
      );
      setReload((value) => value + 1);
      onSuccess?.();
    } catch (error) {
      toaster.error(error instanceof Error ? error.message : "Could not record return");
    } finally {
      setLoading(false);
    }
  }

  if (!invoice.items.length) {
    return <p className="text-[12px] text-muted">This invoice has no line items.</p>;
  }

  return (
    <div className="ui-stack grid gap-3 border-t border-line pt-4">
      <p className="text-[12px] font-bold text-ink">Record return</p>
      <Field label="Reason">
        <TextInput
          value={reason}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setReason(event.target.value)}
          maxLength={200}
        />
      </Field>
      <div className="grid gap-3">
        {lines.map((line) => {
          const max = +(line.soldQty - line.alreadyReturned).toFixed(3);
          const qty = Number(line.returnQty);
          const over = qty > max + 0.0001;
          return (
            <div
              key={line.invoiceItemId}
              className="rounded-lg border border-line bg-paper/60 p-3 text-[12px]"
            >
              <p className="font-semibold text-ink">{line.productName}</p>
              <p className="text-[10px] text-muted">
                Sold {line.soldQty} · Already returned {line.alreadyReturned} · Available {max}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Qty to return">
                  <TextInput
                    value={line.returnQty}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const value = event.target.value;
                      setLines((prev) =>
                        prev.map((row) =>
                          row.invoiceItemId === line.invoiceItemId
                            ? { ...row, returnQty: value }
                            : row,
                        ),
                      );
                    }}
                    placeholder={max > 0 ? `Up to ${max}` : "None left"}
                  />
                </Field>
                <Field label="Condition">
                  <SelectInput
                    value={line.condition}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                      const value = event.target.value as ItemCondition;
                      setLines((prev) =>
                        prev.map((row) =>
                          row.invoiceItemId === line.invoiceItemId
                            ? { ...row, condition: value }
                            : row,
                        ),
                      );
                    }}
                  >
                    {CONDITIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
              {over ? (
                <p className="mt-1 text-[11px] font-semibold text-danger">
                  Over return — only {max} available on this line.
                </p>
              ) : null}
              {qty > 0 && !over ? (
                <p className="mt-1 text-[11px] text-muted">
                  Refund {money(qty * line.unitPrice)}
                  {qty < max ? " (partial return)" : qty === max ? " (full line)" : ""}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <Button
        variant="primary"
        disabled={
          loading ||
          hasError ||
          !payloadItems.length ||
          lines.every((line) => line.soldQty - line.alreadyReturned <= 0.0001)
        }
        onClick={() => void submit()}
      >
        {loading ? "Saving…" : "Submit return"}
      </Button>
    </div>
  );
}
